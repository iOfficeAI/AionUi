/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Modal that shows the diff between a historical timeline entry and
 * the CURRENT editor buffer, and (for local-history entries) lets the
 * user restore the historical content.
 *
 * Visual: a Monaco `DiffEditor` (left = historical, right = current
 * buffer), read-only. The same engine the Phase-3 conflict review uses
 * inside `MonacoEditor.tsx:686`, lifted out of the editor body so it
 * can stand on its own in a modal.
 *
 * Restore flow:
 *   1. Snapshot the CURRENT buffer (source = 'restore') so the
 *      pre-restore state is preserved in Local History.
 *   2. Write the historical content to disk via `fs.writeFile`.
 *   3. Call `applyExternalContent` on the editor context — this
 *      updates both `content` and `originalContent` (clearing the
 *      dirty flag) and snapshot the pre-restore state with
 *      `source = 'agent'` if the buffer was dirty. The Monaco
 *      auto-sync effect (`MonacoEditor.tsx:638`) picks up the new
 *      `content` and pushes it into the model.
 *   4. Mutate the parent SWR so the Timeline list refreshes.
 *
 * Git rows don't have a `git show <hash>:<path>` IPC yet, so the
 * modal shows a disabled "not supported for git commits" empty state
 * for git items instead of opening the diff.
 */

import { Button, Empty, Message, Spin } from '@arco-design/web-react';
import * as monaco from '@aionui/editor-monaco';
import type { GitFileLogEntry } from '@/common/types/git/gitTypes';
import type { LocalHistoryEntry } from '@/common/types/localHistory/localHistoryTypes';
import type { OpenBuffer } from '@renderer/pages/conversation/Editor/types';
import { useEditorContext } from '@renderer/pages/conversation/Editor/EditorContext';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import styles from './TimelineDiffModal.module.css';

export type TimelineRowItem =
  | { kind: 'git'; entry: GitFileLogEntry; timestamp: number }
  | { kind: 'local'; entry: LocalHistoryEntry; timestamp: number };

export type TimelineDiffModalProps = {
  visible: boolean;
  onClose: () => void;
  item: TimelineRowItem | null;
  activeBuffer: OpenBuffer | null;
  /** Called after a successful restore or delete so the timeline SWR
   *  can revalidate. */
  onMutated: () => void;
};

type FetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; content: string }
  | { status: 'error'; message: string };

const initialFetchState: FetchState = { status: 'idle' };

/** Strip the file extension and use it as a Monaco language hint. The
 * `mapToMonacoLanguage` helper inside `MonacoEditor.tsx` is private,
 * so we lean on Monaco's built-in `getLanguages` to resolve the
 * language id. This keeps the diff syntax-highlighted without
 * pulling editor internals into the modal. */
const resolveMonacoLanguage = (filename: string | null, hint: string | null | undefined): string | undefined => {
  // Prefer the buffer's stored language (already resolved by
  // `inferEditorLanguage` upstream), but fall back to the file
  // extension so the modal also works for file types Monaco knows
  // about by extension.
  if (hint && hint !== 'plaintext') return hint;
  if (!filename) return undefined;
  const ext = filename.includes('.') ? filename.split('.').pop() : undefined;
  if (!ext) return undefined;
  // Monaco's `getLanguages()` only returns registered languages, but
  // built-ins like `typescript`, `javascript`, `json`, `markdown`, etc.
  // are present. The lookup is O(N) but N is tiny (~30 languages).
  const match = monaco.languages.getLanguages().find((l) => l.extensions?.includes(`.${ext.toLowerCase()}`));
  return match?.id;
};

const TimelineDiffModal: React.FC<TimelineDiffModalProps> = ({ visible, onClose, item, activeBuffer, onMutated }) => {
  const { t } = useTranslation();
  const editor = useEditorContext();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const diffEditorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const originalModelRef = useRef<monaco.editor.ITextModel | null>(null);
  const modifiedModelRef = useRef<monaco.editor.ITextModel | null>(null);

  // `oldContent` is the historical text we'll diff against. We only
  // fetch it for local-history rows — git rows are handled with an
  // empty state.
  const [fetchState, setFetchState] = useState<FetchState>(initialFetchState);
  const [restoring, setRestoring] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Reset fetch state whenever the modal opens/closes or the
  // selected item changes. Doing it on `visible` AND `item` is
  // idempotent — we just want a clean slate per-open.
  useEffect(() => {
    if (!visible) {
      setFetchState(initialFetchState);
      return;
    }
    if (!item) {
      setFetchState(initialFetchState);
      return;
    }
    if (item.kind === 'git') {
      setFetchState({ status: 'idle' });
      return;
    }
    if (!activeBuffer || !activeBuffer.filePath) {
      setFetchState({ status: 'error', message: 'No active buffer' });
      return;
    }
    setFetchState({ status: 'loading' });
    let cancelled = false;
    ipcBridge.localHistory.getEntryContent
      .invoke({ file_path: activeBuffer.filePath, entry_id: item.entry.id })
      .then((res) => {
        if (cancelled) return;
        if (res?.success && res.data && typeof res.data.content === 'string') {
          setFetchState({ status: 'ready', content: res.data.content });
        } else {
          setFetchState({ status: 'error', message: res?.msg ?? 'Failed to load snapshot' });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to load snapshot';
        setFetchState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [visible, item, activeBuffer]);

  // ---- Diff editor lifecycle ------------------------------------------------
  // Mount a fresh DiffEditor when `oldContent` is ready and `modified`
  // is the active buffer's content. We create two scratch models with
  // unique URIs (a model can only live in one editor at a time) and
  // dispose them when the modal closes, when the active buffer
  // changes, or when the user opens a different entry.
  useEffect(() => {
    if (!visible) return;
    if (fetchState.status !== 'ready') return;
    if (!activeBuffer || !activeBuffer.filePath) return;
    const container = containerRef.current;
    if (!container) return;

    const languageId = resolveMonacoLanguage(activeBuffer.fileName, activeBuffer.language);
    const baseUri = `aionui-timeline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const originalUri = monaco.Uri.parse(`${baseUri}-original://snapshot`);
    const modifiedUri = monaco.Uri.parse(`${baseUri}-modified://current`);

    const originalModel = monaco.editor.createModel(fetchState.content, languageId, originalUri);
    const modifiedModel = monaco.editor.createModel(activeBuffer.content, languageId, modifiedUri);
    originalModelRef.current = originalModel;
    modifiedModelRef.current = modifiedModel;

    const diffEditor = monaco.editor.createDiffEditor(container, {
      automaticLayout: true,
      // Match the surrounding modal chrome; the diff editor is the
      // main content so it can use a generic theme. The MonacoEditor
      // wrapper applies the app theme, but for a short-lived modal
      // `vs-dark` is a safe default that matches the timeline panel.
      theme: 'vs-dark',
      renderSideBySide: true,
      readOnly: true,
      originalEditable: false,
      renderIndicators: true,
    });
    diffEditor.setModel({ original: originalModel, modified: modifiedModel });
    diffEditorRef.current = diffEditor;

    return () => {
      // Detach models BEFORE disposing them so Monaco doesn't trip an
      // assertion about orphaned listeners.
      try {
        diffEditor.setModel(null);
      } catch {
        // Diff editor was already disposed (e.g. unmount racing with
        // a state update). The dispose below is still safe.
      }
      diffEditor.dispose();
      diffEditorRef.current = null;
      originalModel.dispose();
      modifiedModel.dispose();
      originalModelRef.current = null;
      modifiedModelRef.current = null;
    };
  }, [fetchState, activeBuffer, visible]);

  // ---- Action handlers ------------------------------------------------------
  const handleRestore = useCallback(async () => {
    if (!item || item.kind !== 'local') return;
    if (!activeBuffer || !activeBuffer.filePath) return;
    if (fetchState.status !== 'ready') return;
    setRestoring(true);
    try {
      // 1. Snapshot current state with source = 'save'.
      //    This is the checkpoint the user can rewind to if the
      //    restore turns out to be a mistake.
      await ipcBridge.localHistory.addSnapshot.invoke({
        file_path: activeBuffer.filePath,
        content: activeBuffer.content,
        source: 'save',
      });

      // 2. Write historical content to disk.
      const ok = await ipcBridge.fs.writeFile.invoke({
        path: activeBuffer.filePath,
        data: fetchState.content,
      });
      if (!ok) throw new Error('writeFile returned false');

      // 3. Reconcile the editor buffer. `applyExternalContent` updates
      //    both `content` and `originalContent` (clearing the dirty
      //    flag) AND snapshots the new restored state with `source = 'restore'`.
      //    The Monaco auto-sync effect picks up the new
      //    `content` and pushes it into the model.
      editor.applyExternalContent(activeBuffer.key, fetchState.content, 'restore');

      Message.success(t('common.saveSuccess', { defaultValue: 'Saved' }));
      onMutated();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Restore failed';
      Message.error(message);
    } finally {
      setRestoring(false);
    }
  }, [item, activeBuffer, fetchState, editor, onMutated, onClose, t]);

  const handleDelete = useCallback(async () => {
    if (!item || item.kind !== 'local') return;
    if (!activeBuffer || !activeBuffer.filePath) return;
    setDeleting(true);
    try {
      const res = await ipcBridge.localHistory.deleteEntry.invoke({
        file_path: activeBuffer.filePath,
        entry_id: item.entry.id,
      });
      if (!res?.success) throw new Error(res?.msg ?? 'Delete failed');
      Message.success(t('common.deleteSuccess', { defaultValue: 'Deleted' }));
      onMutated();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Delete failed';
      Message.error(message);
    } finally {
      setDeleting(false);
    }
  }, [item, activeBuffer, onMutated, onClose, t]);

  // Close on Escape — keep parity with the rest of the app's modals.
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

  if (!visible || !item) return null;

  const isLocal = item.kind === 'local';
  const canDiff = isLocal && fetchState.status === 'ready';

  // Portal so the modal escapes any overflow:hidden ancestors and
  // renders at the top of the DOM tree.
  const modalContent = (
    <div
      className={styles.backdrop}
      role='dialog'
      aria-modal='true'
      onClick={(e) => {
        // Click on the backdrop (not the panel) closes the modal.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.title}>
            {isLocal ? t('conversation.sider.timelineLocalSubject', { defaultValue: 'Local History' }) : t('conversation.sider.timelineGitTitle', { defaultValue: 'Git Commit' })}
            <span className={styles.subtitle}>
              {isLocal ? new Date(item.timestamp).toLocaleString() : item.entry.subject}
            </span>
          </div>
          <button
            type='button'
            className={styles.closeBtn}
            onClick={onClose}
            aria-label='Close'
          >
            ×
          </button>
        </div>
        <div className={styles.body}>
          {item.kind === 'git' ? (
            <div className={styles.empty}>
              <Empty
                description={t('conversation.sider.timelineGitUnsupported', {
                  defaultValue: 'Diff for git commits is not supported yet. Local history entries are restorable below.',
                })}
              />
            </div>
          ) : fetchState.status === 'loading' ? (
            <div className={styles.empty}>
              <Spin />
            </div>
          ) : fetchState.status === 'error' ? (
            <div className={styles.empty}>
              <Empty description={fetchState.message} />
            </div>
          ) : (
            <div ref={containerRef} className={styles.diffContainer} />
          )}
        </div>
        <div className={styles.footer}>
          <Button onClick={onClose} disabled={restoring || deleting}>
            {t('common.cancel', { defaultValue: 'Cancel' })}
          </Button>
          {isLocal && (
            <>
              <Button
                status='danger'
                onClick={handleDelete}
                loading={deleting}
                disabled={restoring}
              >
                {t('common.delete', { defaultValue: 'Delete' })}
              </Button>
              <Button
                type='primary'
                onClick={handleRestore}
                loading={restoring}
                disabled={deleting || !canDiff}
                title={t('conversation.sider.timelineRestoreBtn', { defaultValue: 'Restore this version' })}
              >
                {t('conversation.sider.timelineRestoreBtn', { defaultValue: 'Restore this version' })}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default TimelineDiffModal;
