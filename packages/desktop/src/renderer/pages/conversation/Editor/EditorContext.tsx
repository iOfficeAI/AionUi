/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { mutate } from 'swr';
import { isEditorAccessibleInLayoutMode } from '@renderer/utils/layout/layoutModeStorage';
import { EDITOR_MAX_EDITABLE_BYTES, getEditorFileName, inferEditorLanguage } from './editorLanguage';
import { requestEditorRevealInTree } from './editorReveal';
import { writeEditorTabs, type PersistedEditorTabEntry } from './editorTabsPersistence';
import type {
  EditorBufferViewState,
  EditorContextValue,
  EditorGroup,
  EditorNotice,
  EditorOpenRequest,
  EditorPendingAction,
  EditorRevealRequest,
  EditorSaveOptions,
  EditorState,
  OpenBuffer,
  SplitDirection,
} from './types';

const UNTITLED_BASE = 'Untitled';
const UNTITLED_EXT = '.txt';
const FILE_CHANGE_POLL_MS = 2500;
const TABS_PERSIST_DEBOUNCE_MS = 400;

const EditorContext = createContext<EditorContextValue | null>(null);

const DEFAULT_GROUP_ID = 'g-primary';
/** Phase 2 cap: a single editor row stays legible up to four panes. */
const MAX_EDITOR_GROUPS = 4;
let groupCounter = 0;
const genGroupId = (): string => `g-${(groupCounter += 1)}`;

const initialState: EditorState = {
  isOpen: false,
  isCollapsed: false,
  buffers: [],
  groups: [{ id: DEFAULT_GROUP_ID, bufferKeys: [], activeKey: null }],
  activeGroupId: DEFAULT_GROUP_ID,
  activeKey: null,
  pendingAction: null,
  notice: null,
};

let noticeId = 0;
let untitledCounter = 0;

const createNotice = (kind: EditorNotice['kind'], key: string, values?: EditorNotice['values']): EditorNotice => ({
  id: (noticeId += 1),
  kind,
  key,
  values,
});

const bufferKeyFor = (request: EditorOpenRequest): string => `${request.workspace ?? ''}::${request.path}`;

// ---- Untitled Backup Debouncer -------------------------------------------
const backupTimers = new Map<string, number>();

export const scheduleUntitledBackup = (
  backupId: string,
  content: string,
  meta: { fileName: string; language: string }
): void => {
  if (typeof window === 'undefined') return;
  const existing = backupTimers.get(backupId);
  if (existing) window.clearTimeout(existing);
  const timer = window.setTimeout(() => {
    backupTimers.delete(backupId);
    // The IPC meta payload requires `backupId`; the local signature only
    // carries the user-visible fields, so splice the id in at fire time.
    ipcBridge.untitledBackup.write.invoke({ backupId, content, meta: { ...meta, backupId } }).catch((err) => {
      console.error('[UntitledBackup] write failed:', err);
    });
  }, 1000);
  backupTimers.set(backupId, timer);
};

export const cancelUntitledBackup = (backupId: string): void => {
  const existing = backupTimers.get(backupId);
  if (existing) {
    window.clearTimeout(existing);
    backupTimers.delete(backupId);
  }
};
// --------------------------------------------------------------------------

const newUntitledBuffer = (): OpenBuffer => {
  untitledCounter += 1;
  const suffix = untitledCounter === 1 ? '' : `-${untitledCounter}`;
  const backupId = `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    key: `untitled:${untitledCounter}`,
    filePath: null,
    backupId,
    workspace: undefined,
    fileName: `${UNTITLED_BASE}${suffix}${UNTITLED_EXT}`,
    content: '',
    originalContent: '',
    language: 'plaintext',
    lastModified: null,
    diskChanged: false,
    loading: false,
    saving: false,
    viewState: null,
  };
};

const updateBuffer = (
  buffers: OpenBuffer[],
  key: string,
  patch: Partial<OpenBuffer> | ((prev: OpenBuffer) => Partial<OpenBuffer>)
): OpenBuffer[] =>
  buffers.map((b) => {
    if (b.key !== key) return b;
    const merged = typeof patch === 'function' ? patch(b) : patch;
    return { ...b, ...merged };
  });

const findBuffer = (buffers: OpenBuffer[], key: string | null): OpenBuffer | null =>
  key ? (buffers.find((b) => b.key === key) ?? null) : null;

const isBufferDirty = (b: OpenBuffer): boolean => b.content !== b.originalContent;

const findGroup = (groups: EditorGroup[], id: string | null): EditorGroup | null =>
  id ? (groups.find((g) => g.id === id) ?? null) : null;

/**
 * Re-derive a consistent group/active view from the shared buffer pool:
 *   - prune dead buffer keys from every group
 *   - keep each group's `activeKey` valid (fall back to last tab, then null)
 *   - guarantee at least one group exists
 *   - re-home buffers referenced by no group into the primary group
 *   - drop empty groups when more than one remains
 *   - keep `activeGroupId` valid and mirror its `activeKey` to the top-level
 *     `activeKey` so single-group consumers keep working unchanged
 */
const normalizeGroups = (state: EditorState): EditorState => {
  const validKeys = new Set(state.buffers.map((b) => b.key));

  let groups: EditorGroup[] = state.groups.map((g) => {
    const bufferKeys = g.bufferKeys.filter((k) => validKeys.has(k));
    const activeKey = g.activeKey && bufferKeys.includes(g.activeKey) ? g.activeKey : (bufferKeys.at(-1) ?? null);
    return { ...g, bufferKeys, activeKey };
  });

  if (groups.length === 0) {
    groups = [{ id: DEFAULT_GROUP_ID, bufferKeys: state.buffers.map((b) => b.key), activeKey: state.activeKey }];
  }

  // Re-home orphaned buffers (in the pool but referenced by no group) into the
  // primary group so a file is never invisible.
  const referenced = new Set(groups.flatMap((g) => g.bufferKeys));
  const orphans = state.buffers.map((b) => b.key).filter((k) => !referenced.has(k));
  if (orphans.length > 0) {
    groups = groups.map((g, i) =>
      i === 0
        ? { ...g, bufferKeys: [...g.bufferKeys, ...orphans], activeKey: g.activeKey ?? orphans.at(-1) ?? null }
        : g
    );
  }

  // Drop empty groups when more than one remains; never drop the last group.
  if (groups.length > 1) {
    const nonEmpty = groups.filter((g) => g.bufferKeys.length > 0);
    groups = nonEmpty.length > 0 ? nonEmpty : [groups[0]];
  }

  let activeGroupId = state.activeGroupId;
  if (!groups.some((g) => g.id === activeGroupId)) activeGroupId = groups[0].id;

  const focused = findGroup(groups, activeGroupId) ?? groups[0];
  const activeKey = focused?.activeKey ?? null;

  return { ...state, groups, activeGroupId, activeKey };
};

/** Remap a buffer key across the pool's groups (used by Save As key changes). */
const remapGroupKey = (groups: EditorGroup[], fromKey: string, toKey: string): EditorGroup[] =>
  groups.map((g) => ({
    ...g,
    bufferKeys: g.bufferKeys.map((k) => (k === fromKey ? toKey : k)),
    activeKey: g.activeKey === fromKey ? toKey : g.activeKey,
  }));

/** Append `key` to a group's tab list (no dupes) and make it the active tab. */
const addKeyToGroup = (groups: EditorGroup[], groupId: string, key: string): EditorGroup[] =>
  groups.map((g) =>
    g.id === groupId
      ? { ...g, bufferKeys: g.bufferKeys.includes(key) ? g.bufferKeys : [...g.bufferKeys, key], activeKey: key }
      : g
  );

export const EditorProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<EditorState>(initialState);
  const [revealRequest, setRevealRequest] = useState<EditorRevealRequest | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const activeBuffer = findBuffer(state.buffers, state.activeKey);
  const isDirty = activeBuffer ? isBufferDirty(activeBuffer) : false;
  const hasAnyDirty = state.buffers.some(isBufferDirty);

  // Reset reveal request when the editor is no longer accessible (e.g. the
  // user toggled back to chat layout mode). The request is only meaningful
  // while the editor pane could be on screen.
  useEffect(() => {
    if (!isEditorAccessibleInLayoutMode() && revealRequest !== null) {
      setRevealRequest(null);
    }
  }, [revealRequest]);

  // Whenever the active buffer changes, dispatch a reveal request so the
  // file tree can highlight + scroll to the file. Untitled buffers have
  // no path to reveal, so they're skipped.
  useEffect(() => {
    if (!activeBuffer || !activeBuffer.filePath) return;
    if (!isEditorAccessibleInLayoutMode()) return;
    setRevealRequest({
      workspace: activeBuffer.workspace ?? '',
      filePath: activeBuffer.filePath,
    });
  }, [activeBuffer?.key, activeBuffer?.filePath, activeBuffer?.workspace]);

  // Persist per-workspace tab sets whenever the buffer list changes.
  // File-backed buffers persist by path; untitled buffers with a
  // `backupId` persist by `backupId` + `untitledMeta` so they can be
  // rehydrated from the main-process untitled-backup store. Untitled
  // buffers without a `backupId` (never edited) are still dropped.
  // The debounce coalesces rapid edits / reorders into a single write.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const timer = window.setTimeout(() => {
      // Group buffers by workspace root. An empty workspace string is
      // treated as its own bucket (covers files opened without a
      // workspace context, e.g. an OS file picker). Untitled buffers
      // (no workspace) naturally land in the `''` bucket.
      const byWorkspace = new Map<string, OpenBuffer[]>();
      for (const b of state.buffers) {
        if (!b.filePath && !b.backupId) continue;
        const wsKey = b.workspace ?? '';
        const arr = byWorkspace.get(wsKey) ?? [];
        arr.push(b);
        byWorkspace.set(wsKey, arr);
      }
      for (const [wsKey, buffers] of byWorkspace) {
        const entries: PersistedEditorTabEntry[] = buffers
          .filter((b) => Boolean(b.filePath) || Boolean(b.backupId))
          .map((b) => {
            if (b.filePath) {
              const entry: PersistedEditorTabEntry = { path: b.filePath };
              if (b.workspace) entry.workspace = b.workspace;
              return entry;
            }
            // Untitled hot-exit entry. `backupId` and `b` are guaranteed
            // non-null by the surrounding filter.
            const entry: PersistedEditorTabEntry = {
              backupId: b.backupId as string,
              untitledMeta: { fileName: b.fileName, language: b.language },
            };
            return entry;
          });
        const activeBuffer = state.activeKey ? buffers.find((b) => b.key === state.activeKey) : undefined;
        // Serialize split groups (by file path) scoped to this workspace bucket.
        // Untitled buffers have no path, so they're naturally excluded from
        // the persisted group layout — they rehydrate into the focused group.
        const pathForKey = (key: string): string | null =>
          state.buffers.find((b) => b.key === key && (b.workspace ?? '') === wsKey)?.filePath ?? null;
        const groups = state.groups
          .map((g) => {
            const entryPaths = g.bufferKeys.map(pathForKey).filter((p): p is string => Boolean(p));
            const activePath = g.activeKey ? pathForKey(g.activeKey) : null;
            return { entryPaths, activePath };
          })
          .filter((g) => g.entryPaths.length > 0);
        writeEditorTabs(wsKey, {
          entries,
          ...(activeBuffer?.filePath ? { activePath: activeBuffer.filePath } : {}),
          ...(groups.length > 1 ? { groups } : {}),
        });
      }
    }, TABS_PERSIST_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [state.buffers, state.activeKey, state.groups]);

  // ---- Reveal request wiring ---------------------------------------------
  const requestRevealInTree = useCallback((filePath?: string, workspace?: string) => {
    const active = stateRef.current.buffers.find((b) => b.key === stateRef.current.activeKey);
    const targetPath = filePath ?? active?.filePath ?? null;
    if (!targetPath) return;
    // Prefer the explicit argument, then the buffer that owns this path,
    // then the active buffer's workspace, then empty string.
    const ownerBuffer = stateRef.current.buffers.find((b) => b.filePath === targetPath);
    const targetWorkspace = workspace ?? ownerBuffer?.workspace ?? active?.workspace ?? '';
    setRevealRequest({ workspace: targetWorkspace, filePath: targetPath });
    requestEditorRevealInTree({ workspace: targetWorkspace, filePath: targetPath });
  }, []);

  const clearRevealRequest = useCallback(() => {
    setRevealRequest((prev) => (prev === null ? prev : null));
  }, []);

  // ---------------------------------------------------------------------------
  // Buffer mutators
  // ---------------------------------------------------------------------------

  const upsertBuffer = useCallback((buffer: OpenBuffer): void => {
    setState((prev) => {
      const existingIndex = prev.buffers.findIndex((b) => b.key === buffer.key);
      const buffers =
        existingIndex >= 0 ? prev.buffers.map((b, i) => (i === existingIndex ? buffer : b)) : [...prev.buffers, buffer];
      return normalizeGroups({
        ...prev,
        isOpen: true,
        isCollapsed: false,
        buffers,
        groups: addKeyToGroup(prev.groups, prev.activeGroupId, buffer.key),
        pendingAction: null,
      });
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Open / read flow
  // ---------------------------------------------------------------------------

  const executeOpenFile = useCallback(async (request: EditorOpenRequest): Promise<boolean> => {
    if (!isEditorAccessibleInLayoutMode()) return false;

    const key = bufferKeyFor(request);

    // If already open, just activate the tab in the focused group.
    if (stateRef.current.buffers.some((b) => b.key === key)) {
      setState((prev) =>
        normalizeGroups({
          ...prev,
          isOpen: true,
          isCollapsed: false,
          groups: addKeyToGroup(prev.groups, prev.activeGroupId, key),
          pendingAction: null,
        })
      );
      return true;
    }

    setState((prev) =>
      normalizeGroups({
        ...prev,
        isOpen: true,
        isCollapsed: false,
        pendingAction: null,
        buffers: [
          ...prev.buffers,
          {
            key,
            filePath: request.path,
            backupId: null,
            workspace: request.workspace,
            fileName: getEditorFileName(request.path),
            content: '',
            originalContent: '',
            language: inferEditorLanguage(request.path),
            lastModified: null,
            diskChanged: false,
            loading: true,
            saving: false,
            viewState: null,
          },
        ],
        groups: addKeyToGroup(prev.groups, prev.activeGroupId, key),
      })
    );

    try {
      const metadata = await ipcBridge.fs.getFileMetadata.invoke({ path: request.path, workspace: request.workspace });
      if (metadata?.isDirectory) {
        setState((prev) =>
          normalizeGroups({
            ...prev,
            buffers: prev.buffers.filter((b) => b.key !== key),
            notice: createNotice('error', 'conversation.editor.openFailed'),
          })
        );
        return false;
      }

      if (metadata?.size && metadata.size > EDITOR_MAX_EDITABLE_BYTES) {
        setState((prev) =>
          normalizeGroups({
            ...prev,
            buffers: prev.buffers.filter((b) => b.key !== key),
            notice: createNotice('warning', 'conversation.editor.largeFileBlocked'),
          })
        );
        return false;
      }

      const content = await ipcBridge.fs.readFile.invoke({ path: request.path, workspace: request.workspace });
      if (content == null) throw new Error('read failed');

      setState((prev) => ({
        ...prev,
        buffers: updateBuffer(prev.buffers, key, {
          content,
          originalContent: content,
          loading: false,
          lastModified: metadata?.lastModified ?? null,
          diskChanged: false,
        }),
      }));
      return true;
    } catch {
      setState((prev) =>
        normalizeGroups({
          ...prev,
          buffers: prev.buffers.filter((b) => b.key !== key),
          notice: createNotice('error', 'conversation.editor.openFailed'),
        })
      );
      return false;
    }
  }, []);

  const openEditorFile = useCallback(
    async (request: EditorOpenRequest): Promise<boolean> => {
      if (!isEditorAccessibleInLayoutMode()) return false;
      const key = bufferKeyFor(request);
      if (stateRef.current.buffers.some((b) => b.key === key)) {
        return executeOpenFile(request);
      }
      const active = findBuffer(stateRef.current.buffers, stateRef.current.activeKey);
      if (active && isBufferDirty(active)) {
        setState((prev) => ({ ...prev, pendingAction: { type: 'open-file', request } }));
        return false;
      }
      return executeOpenFile(request);
    },
    [executeOpenFile]
  );

  const executeNewFile = useCallback(() => {
    if (!isEditorAccessibleInLayoutMode()) return;
    const buffer = newUntitledBuffer();
    upsertBuffer(buffer);
  }, [upsertBuffer]);

  const openUntitledEditor = useCallback(() => {
    executeNewFile();
  }, [executeNewFile]);

  /**
   * Restore a hot-exit untitled buffer from the main-process backup
   * store. Allocates a fresh `untitled:<counter>` key (mirroring
   * {@link newUntitledBuffer}) so it never collides with an existing
   * buffer, then hands the buffer to {@link upsertBuffer} which adds
   * it to the currently-focused group and makes it active.
   *
   * `originalContent` is intentionally empty (not the backup content)
   * so the dirty flag is true — the user can see their unsaved work
   * and `Save` writes it to a real path on disk.
   */
  const restoreUntitledBuffer = useCallback(
    (backupId: string, content: string, meta: { fileName: string; language: string }): void => {
      untitledCounter += 1;
      const buffer: OpenBuffer = {
        key: `untitled:${untitledCounter}`,
        filePath: null,
        backupId,
        workspace: undefined,
        fileName: meta.fileName,
        content,
        originalContent: '',
        language: meta.language,
        lastModified: null,
        diskChanged: false,
        loading: false,
        saving: false,
        viewState: null,
      };
      upsertBuffer(buffer);
    },
    [upsertBuffer]
  );

  const chooseAndOpenFile = useCallback(async (): Promise<boolean> => {
    if (!isEditorAccessibleInLayoutMode()) return false;
    const files = await ipcBridge.dialog.showOpen.invoke({ properties: ['openFile'] });
    const filePath = files?.[0];
    if (!filePath) return false;
    return openEditorFile({ path: filePath });
  }, [openEditorFile]);

  // ---------------------------------------------------------------------------
  // Save flow (operates on active buffer)
  // ---------------------------------------------------------------------------

  const saveEditorFileAs = useCallback(async (): Promise<boolean> => {
    const current = findBuffer(stateRef.current.buffers, stateRef.current.activeKey);
    if (!current) return false;

    const filePath = await ipcBridge.dialog.showSave.invoke({ defaultPath: current.filePath ?? current.fileName });
    if (!filePath) return false;

    // Race mitigation: cancel pending backup, delete the backup, and do not
    // start tracking Local History until AFTER the file has its real path.
    if (current.filePath === null && current.backupId) {
      cancelUntitledBackup(current.backupId);
      ipcBridge.untitledBackup.delete.invoke({ backupId: current.backupId }).catch(() => {});
    }

    setState((prev) => ({ ...prev, buffers: updateBuffer(prev.buffers, current.key, { saving: true }) }));
    try {
      const ok = await ipcBridge.fs.writeFile.invoke({ path: filePath, data: current.content });
      if (!ok) throw new Error('write failed');
      const metadata = await ipcBridge.fs.getFileMetadata.invoke({ path: filePath });
      const newKey = `::${filePath}`;
      setState((prev) =>
        normalizeGroups({
          ...prev,
          buffers: prev.buffers.map((b) =>
            b.key === current.key
              ? {
                  ...b,
                  key: newKey,
                  filePath,
                  backupId: null,
                  workspace: undefined,
                  fileName: getEditorFileName(filePath),
                  originalContent: b.content,
                  language: inferEditorLanguage(filePath),
                  saving: false,
                  lastModified: metadata?.lastModified ?? null,
                  diskChanged: false,
                }
              : b
          ),
          groups: remapGroupKey(prev.groups, current.key, newKey),
          notice: createNotice('success', 'common.saveSuccess'),
        })
      );
      return true;
    } catch {
      setState((prev) => ({
        ...prev,
        buffers: updateBuffer(prev.buffers, current.key, { saving: false }),
        notice: createNotice('error', 'common.saveFailed'),
      }));
      return false;
    }
  }, []);

  // Inner helper: shared write path used by `saveEditorFile`. Always
  // writes `current.content` (the latest model state) to disk and updates
  // the buffer's `originalContent` so the dirty flag clears.
  const writeBufferToDisk = useCallback(async (current: OpenBuffer, isAutoSave = false): Promise<boolean> => {
    if (!current.filePath) return false;
    setState((prev) => ({ ...prev, buffers: updateBuffer(prev.buffers, current.key, { saving: true }) }));
    try {
      const ok = await ipcBridge.fs.writeFile.invoke({ path: current.filePath, data: current.content });
      if (!ok) throw new Error('write failed');
      const metadata = await ipcBridge.fs.getFileMetadata.invoke({
        path: current.filePath,
        workspace: current.workspace,
      });

      // VS Code Local History semantics: snapshot the new content AFTER a successful save.
      // (Deduping handles back-to-back saves with no changes).
      ipcBridge.localHistory.addSnapshot
        .invoke({
          file_path: current.filePath,
          content: current.content,
          source: isAutoSave ? 'autosave' : 'save',
        })
        .then(() => {
          // Invalidate timeline cache so the UI updates instantly
          const wsKey = current.workspace ?? '';
          mutate(`sider.timeline.${wsKey}.${current.filePath}`).catch(() => {});
        })
        .catch((err) => console.error('[LocalHistory] save snapshot failed:', err));

      setState((prev) => ({
        ...prev,
        buffers: updateBuffer(prev.buffers, current.key, (b) => ({
          originalContent: b.content,
          saving: false,
          lastModified: metadata?.lastModified ?? b.lastModified,
          diskChanged: false,
        })),
        notice: createNotice('success', 'common.saveSuccess'),
      }));
      return true;
    } catch {
      setState((prev) => ({
        ...prev,
        buffers: updateBuffer(prev.buffers, current.key, { saving: false }),
        notice: createNotice('error', 'common.saveFailed'),
      }));
      return false;
    }
  }, []);

  const saveEditorFile = useCallback(
    async (options?: EditorSaveOptions): Promise<boolean> => {
      const current = findBuffer(stateRef.current.buffers, stateRef.current.activeKey);
      if (!current) return false;
      if (!current.filePath) {
        // Auto-save strictly skips untitled files (no prompt).
        if (options?.isAutoSave) return false;
        return saveEditorFileAs();
      }

      // Optional pre-save formatter (e.g. `monacoRef.formatDocument()`).
      // We always run it before the write — caller decides whether to wire
      // it to `formatOnSave` or call it explicitly.
      if (options?.format) {
        try {
          await options.format();
        } catch {
          /* formatter failure is non-fatal — proceed to write */
        }
        // Pull the post-format content back into state so the write
        // actually persists the formatted buffer (not the pre-format
        // snapshot stored in `current`).
        const refreshed = findBuffer(stateRef.current.buffers, current.key);
        if (!refreshed) return false;
        return await writeBufferToDisk(refreshed, options.isAutoSave);
      }

      return await writeBufferToDisk(current, options?.isAutoSave);
    },
    [saveEditorFileAs, writeBufferToDisk]
  );

  // ---------------------------------------------------------------------------
  // Close flow (per-tab + close-all)
  // ---------------------------------------------------------------------------

  /**
   * Remove a buffer key from one group. The buffer leaves the shared pool
   * only when no other group still references it (VS Code "close to the
   * side keeps the other pane" behaviour). Empty groups are dropped by
   * `normalizeGroups` when more than one remains; the editor closes when no
   * buffers remain anywhere.
   */
  const removeBufferFromGroup = useCallback((groupId: string, key: string) => {
    setState((prev) => {
      const buffer = prev.buffers.find((b) => b.key === key);
      const groups = prev.groups.map((g) =>
        g.id === groupId ? { ...g, bufferKeys: g.bufferKeys.filter((k) => k !== key) } : g
      );
      const stillReferenced = groups.some((g) => g.bufferKeys.includes(key));
      if (!stillReferenced && buffer?.filePath === null && buffer.backupId) {
        cancelUntitledBackup(buffer.backupId);
        ipcBridge.untitledBackup.delete.invoke({ backupId: buffer.backupId }).catch(() => {});
      }
      const buffers = stillReferenced ? prev.buffers : prev.buffers.filter((b) => b.key !== key);
      const next = normalizeGroups({ ...prev, buffers, groups });
      return { ...next, isOpen: next.buffers.length > 0 };
    });
  }, []);

  // Back-compat: close a buffer from the focused group.
  const removeBuffer = useCallback(
    (key: string) => {
      removeBufferFromGroup(stateRef.current.activeGroupId, key);
    },
    [removeBufferFromGroup]
  );

  const closeEditorWithoutPrompt = useCallback(() => {
    stateRef.current.buffers.forEach((b) => {
      if (b.filePath === null && b.backupId) {
        cancelUntitledBackup(b.backupId);
        ipcBridge.untitledBackup.delete.invoke({ backupId: b.backupId }).catch(() => {});
      }
    });
    setState({
      ...initialState,
      groups: [{ id: DEFAULT_GROUP_ID, bufferKeys: [], activeKey: null }],
      activeGroupId: DEFAULT_GROUP_ID,
    });
  }, []);

  const requestCloseBufferInGroup = useCallback(
    (groupId: string, key?: string) => {
      const group = findGroup(stateRef.current.groups, groupId);
      const targetKey = key ?? group?.activeKey ?? null;
      if (!targetKey) return;
      const target = findBuffer(stateRef.current.buffers, targetKey);
      if (!target) return;
      // Only prompt when closing the LAST reference to a dirty buffer.
      const refCount = stateRef.current.groups.filter((g) => g.bufferKeys.includes(targetKey)).length;
      if (isBufferDirty(target) && refCount <= 1) {
        setState((prev) => ({ ...prev, pendingAction: { type: 'close-buffer', bufferKey: targetKey, groupId } }));
        return;
      }
      removeBufferFromGroup(groupId, targetKey);
    },
    [removeBufferFromGroup]
  );

  const requestCloseBuffer = useCallback(
    (key?: string) => {
      requestCloseBufferInGroup(stateRef.current.activeGroupId, key);
    },
    [requestCloseBufferInGroup]
  );

  const requestCloseEditor = useCallback(() => {
    if (stateRef.current.buffers.some(isBufferDirty)) {
      setState((prev) => ({ ...prev, pendingAction: { type: 'close-all' } }));
      return;
    }
    closeEditorWithoutPrompt();
  }, [closeEditorWithoutPrompt]);

  // ---------------------------------------------------------------------------
  // Tab navigation
  // ---------------------------------------------------------------------------

  const setActiveBufferInGroup = useCallback((groupId: string, key: string) => {
    if (!isEditorAccessibleInLayoutMode()) return;
    setState((prev) => {
      if (!prev.buffers.some((b) => b.key === key)) return prev;
      const groups = prev.groups.map((g) =>
        g.id === groupId
          ? { ...g, activeKey: key, bufferKeys: g.bufferKeys.includes(key) ? g.bufferKeys : [...g.bufferKeys, key] }
          : g
      );
      return normalizeGroups({ ...prev, groups, activeGroupId: groupId, isOpen: true, isCollapsed: false });
    });
  }, []);

  const setActiveBuffer = useCallback(
    (key: string) => {
      setActiveBufferInGroup(stateRef.current.activeGroupId, key);
    },
    [setActiveBufferInGroup]
  );

  const reorderWithinGroup = useCallback((groupId: string, fromKey: string, toKey: string) => {
    if (fromKey === toKey) return;
    setState((prev) => {
      const groups = prev.groups.map((g) => {
        if (g.id !== groupId) return g;
        const fromIdx = g.bufferKeys.indexOf(fromKey);
        const toIdx = g.bufferKeys.indexOf(toKey);
        if (fromIdx < 0 || toIdx < 0) return g;
        const bufferKeys = g.bufferKeys.slice();
        const [moved] = bufferKeys.splice(fromIdx, 1);
        bufferKeys.splice(toIdx, 0, moved);
        return { ...g, bufferKeys };
      });
      return { ...prev, groups };
    });
  }, []);

  const reorderBuffers = useCallback(
    (fromKey: string, toKey: string) => {
      reorderWithinGroup(stateRef.current.activeGroupId, fromKey, toKey);
    },
    [reorderWithinGroup]
  );

  // ---------------------------------------------------------------------------
  // Split editor (Epic C)
  // ---------------------------------------------------------------------------

  const focusGroup = useCallback((groupId: string) => {
    setState((prev) => {
      if (prev.activeGroupId === groupId || !prev.groups.some((g) => g.id === groupId)) return prev;
      return normalizeGroups({ ...prev, activeGroupId: groupId });
    });
  }, []);

  const splitEditor = useCallback((_direction: SplitDirection = 'right') => {
    if (!isEditorAccessibleInLayoutMode()) return;
    setState((prev) => {
      const source = findGroup(prev.groups, prev.activeGroupId) ?? prev.groups[0];
      if (!source) return prev;
      // Cap the pane count; once at the cap, a split cycles focus to the next
      // pane instead of stacking an unusable sliver.
      if (prev.groups.length >= MAX_EDITOR_GROUPS) {
        const idx = prev.groups.findIndex((g) => g.id === prev.activeGroupId);
        const next = prev.groups[(idx + 1) % prev.groups.length];
        return next ? normalizeGroups({ ...prev, activeGroupId: next.id }) : prev;
      }
      const seedKey = source.activeKey;
      const newGroup: EditorGroup = {
        id: genGroupId(),
        bufferKeys: seedKey ? [seedKey] : [],
        activeKey: seedKey,
      };
      // Insert the new pane immediately after the source pane for intuitive
      // left-to-right placement.
      const idx = prev.groups.findIndex((g) => g.id === source.id);
      const groups = [...prev.groups.slice(0, idx + 1), newGroup, ...prev.groups.slice(idx + 1)];
      return normalizeGroups({
        ...prev,
        isOpen: true,
        isCollapsed: false,
        groups,
        activeGroupId: newGroup.id,
      });
    });
  }, []);

  const moveBufferToGroup = useCallback((bufferKey: string, fromGroupId: string, toGroupId: string, index?: number) => {
    if (fromGroupId === toGroupId) {
      // Same-group drop is a reorder, handled by `reorderWithinGroup`.
      return;
    }
    setState((prev) => {
      if (!prev.buffers.some((b) => b.key === bufferKey)) return prev;
      if (!findGroup(prev.groups, fromGroupId) || !findGroup(prev.groups, toGroupId)) return prev;
      const groups = prev.groups.map((g) => {
        if (g.id === fromGroupId) {
          return { ...g, bufferKeys: g.bufferKeys.filter((k) => k !== bufferKey) };
        }
        if (g.id === toGroupId) {
          if (g.bufferKeys.includes(bufferKey)) return { ...g, activeKey: bufferKey };
          const keys = g.bufferKeys.slice();
          const at = typeof index === 'number' && index >= 0 && index <= keys.length ? index : keys.length;
          keys.splice(at, 0, bufferKey);
          return { ...g, bufferKeys: keys, activeKey: bufferKey };
        }
        return g;
      });
      // Buffer stays in the shared pool (still referenced by the target), so
      // its dirty state / content are preserved across the move.
      return normalizeGroups({ ...prev, groups, activeGroupId: toGroupId });
    });
  }, []);

  const setSplitLayout = useCallback((layout: Array<{ bufferKeys: string[]; activeKey: string | null }>) => {
    if (layout.length === 0) return;
    setState((prev) => {
      const groups: EditorGroup[] = layout.map((g, i) => ({
        id: i === 0 ? DEFAULT_GROUP_ID : genGroupId(),
        bufferKeys: g.bufferKeys.slice(),
        activeKey: g.activeKey,
      }));
      return normalizeGroups({ ...prev, groups, activeGroupId: groups[0].id });
    });
  }, []);

  const closeGroup = useCallback((groupId: string) => {
    setState((prev) => {
      if (prev.groups.length <= 1) {
        // Closing the only group closes the editor entirely.
        return {
          ...initialState,
          groups: [{ id: DEFAULT_GROUP_ID, bufferKeys: [], activeKey: null }],
          activeGroupId: DEFAULT_GROUP_ID,
        };
      }
      const groups = prev.groups.filter((g) => g.id !== groupId);
      // Buffers referenced only by the closed group leave the pool.
      const referenced = new Set(groups.flatMap((g) => g.bufferKeys));
      const buffers = prev.buffers.filter((b) => referenced.has(b.key));
      const activeGroupId = prev.activeGroupId === groupId ? groups[0].id : prev.activeGroupId;
      const next = normalizeGroups({ ...prev, buffers, groups, activeGroupId });
      return { ...next, isOpen: next.buffers.length > 0 };
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Panel toggle / collapse
  // ---------------------------------------------------------------------------

  const collapseEditor = useCallback(() => {
    if (!isEditorAccessibleInLayoutMode()) return;
    setState((prev) => ({ ...prev, isCollapsed: true }));
  }, []);

  const expandEditor = useCallback(() => {
    if (!isEditorAccessibleInLayoutMode()) return;
    setState((prev) => ({ ...prev, isOpen: true, isCollapsed: false }));
  }, []);

  const hideEditor = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false, isCollapsed: false }));
  }, []);

  const toggleEditor = useCallback(() => {
    if (!isEditorAccessibleInLayoutMode()) return;
    const current = stateRef.current;
    if (!current.isOpen) {
      executeNewFile();
      return;
    }
    setState((prev) => ({ ...prev, isCollapsed: !prev.isCollapsed }));
  }, [executeNewFile]);

  // ---------------------------------------------------------------------------
  // Content / view-state setters
  // ---------------------------------------------------------------------------

  const setEditorContent = useCallback((content: string) => {
    setState((prev) =>
      prev.activeKey ? { ...prev, buffers: updateBuffer(prev.buffers, prev.activeKey, { content }) } : prev
    );
  }, []);

  // Per-group content write: each split pane's editor targets its own bound
  // buffer key (not the focused group's `activeKey`), so typing in either
  // pane updates the correct shared-pool buffer.
  const setBufferContentByKey = useCallback((key: string, content: string) => {
    setState((prev) => {
      const buffer = prev.buffers.find((b) => b.key === key);
      if (buffer?.filePath === null && buffer.backupId) {
        scheduleUntitledBackup(buffer.backupId, content, {
          fileName: buffer.fileName,
          language: buffer.language,
        });
      }
      return buffer ? { ...prev, buffers: updateBuffer(prev.buffers, key, { content }) } : prev;
    });
  }, []);

  const setBufferViewState = useCallback((key: string, viewState: EditorBufferViewState | null) => {
    setState((prev) => ({ ...prev, buffers: updateBuffer(prev.buffers, key, { viewState }) }));
  }, []);

  /**
   * Apply externally-written content to a buffer (e.g. the agent's live
   * `fileStream.contentUpdate` push). Updates both `content` and
   * `originalContent` so the dirty flag clears — the file on disk now
   * matches the buffer. No-op if the buffer key isn't open.
   *
   * The caller is responsible for pushing the new text into the underlying
   * Monaco model with `suppressChangeRef` set; this helper only reconciles
   * the EditorContext state. Splitting the two concerns keeps the model
   * push co-located with the editor ref (in `MonacoEditor.tsx`).
   */
  const applyExternalContent = useCallback(
    (key: string, content: string, source: 'agent' | 'restore' = 'agent'): void => {
      setState((prev) => {
        const buffer = prev.buffers.find((b) => b.key === key);
        if (!buffer) return prev;

        // Agent/external write (or Timeline Restore). Snapshot the NEW content that was just written to disk.
        if (buffer.filePath) {
          ipcBridge.localHistory.addSnapshot
            .invoke({
              file_path: buffer.filePath,
              content,
              source,
            })
            .then(() => {
              const wsKey = buffer.workspace ?? '';
              mutate(`sider.timeline.${wsKey}.${buffer.filePath}`).catch(() => {});
            })
            .catch((err) => console.error('[LocalHistory] agent snapshot failed:', err));
        }

        return {
          ...prev,
          buffers: updateBuffer(prev.buffers, key, { content, originalContent: content, diskChanged: false }),
        };
      });
    },
    []
  );

  const revertEditorFile = useCallback(() => {
    setState((prev) => {
      if (!prev.activeKey) return prev;
      return {
        ...prev,
        buffers: updateBuffer(prev.buffers, prev.activeKey, (b) => ({
          content: b.originalContent,
          diskChanged: false,
        })),
      };
    });
  }, []);

  // ---------------------------------------------------------------------------
  // Pending-action resolution
  // ---------------------------------------------------------------------------

  const executePendingAction = useCallback(
    async (pendingAction: EditorPendingAction | null): Promise<void> => {
      if (!pendingAction) return;
      if (pendingAction.type === 'close-buffer') {
        removeBufferFromGroup(pendingAction.groupId ?? stateRef.current.activeGroupId, pendingAction.bufferKey);
        return;
      }
      if (pendingAction.type === 'close-all') {
        closeEditorWithoutPrompt();
        return;
      }
      if (pendingAction.type === 'new-file') {
        executeNewFile();
        return;
      }
      await executeOpenFile(pendingAction.request);
    },
    [closeEditorWithoutPrompt, executeNewFile, executeOpenFile, removeBufferFromGroup]
  );

  const confirmPendingActionWithSave = useCallback(async () => {
    const pendingAction = stateRef.current.pendingAction;
    const saved = await saveEditorFile(undefined);
    if (saved) await executePendingAction(pendingAction);
  }, [executePendingAction, saveEditorFile]);

  const discardPendingAction = useCallback(async () => {
    const pendingAction = stateRef.current.pendingAction;
    await executePendingAction(pendingAction);
  }, [executePendingAction]);

  const cancelPendingAction = useCallback(() => {
    setState((prev) => ({ ...prev, pendingAction: null }));
  }, []);

  const clearNotice = useCallback((id: number) => {
    setState((prev) => (prev.notice?.id === id ? { ...prev, notice: null } : prev));
  }, []);

  // ---------------------------------------------------------------------------
  // Disk-change polling (iterates all open buffers)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const interval = window.setInterval(() => {
      const current = stateRef.current;
      if (!current.isOpen || current.isCollapsed) return;
      for (const buffer of current.buffers) {
        if (!buffer.filePath || buffer.loading || buffer.saving) continue;
        const { key, filePath, workspace, lastModified } = buffer;
        void ipcBridge.fs.getFileMetadata
          .invoke({ path: filePath, workspace })
          .then((metadata) => {
            if (!metadata || metadata.lastModified === lastModified) return;
            const latest = findBuffer(stateRef.current.buffers, key);
            if (!latest) return;
            if (isBufferDirty(latest)) {
              setState((prev) => ({
                ...prev,
                buffers: updateBuffer(prev.buffers, key, {
                  lastModified: metadata.lastModified,
                  diskChanged: true,
                }),
                notice:
                  prev.activeKey === key
                    ? createNotice('warning', 'conversation.editor.fileChangedOnDisk')
                    : prev.notice,
              }));
              return;
            }
            void ipcBridge.fs.readFile.invoke({ path: filePath, workspace }).then((content) => {
              if (content == null) return;
              setState((prev) => ({
                ...prev,
                buffers: updateBuffer(prev.buffers, key, {
                  content,
                  originalContent: content,
                  lastModified: metadata.lastModified,
                  diskChanged: false,
                }),
              }));
            });
          })
          .catch((): void => undefined);
      }
    }, FILE_CHANGE_POLL_MS);
    return () => window.clearInterval(interval);
  }, []);

  const value = useMemo<EditorContextValue>(
    () => ({
      ...state,
      activeBuffer,
      isDirty,
      hasAnyDirty,
      openEditorFile,
      openUntitledEditor,
      restoreUntitledBuffer,
      chooseAndOpenFile,
      saveEditorFile,
      saveEditorFileAs,
      requestCloseBuffer,
      requestCloseEditor,
      closeEditorWithoutPrompt,
      setActiveBuffer,
      reorderBuffers,
      splitEditor,
      closeGroup,
      focusGroup,
      setActiveBufferInGroup,
      reorderWithinGroup,
      moveBufferToGroup,
      requestCloseBufferInGroup,
      setBufferContentByKey,
      setSplitLayout,
      collapseEditor,
      expandEditor,
      hideEditor,
      toggleEditor,
      setEditorContent,
      setBufferViewState,
      applyExternalContent,
      revertEditorFile,
      confirmPendingActionWithSave,
      discardPendingAction,
      cancelPendingAction,
      clearNotice,
      revealRequest,
      requestRevealInTree,
      clearRevealRequest,
    }),
    [
      state,
      activeBuffer,
      isDirty,
      hasAnyDirty,
      openEditorFile,
      openUntitledEditor,
      restoreUntitledBuffer,
      chooseAndOpenFile,
      saveEditorFile,
      saveEditorFileAs,
      requestCloseBuffer,
      requestCloseEditor,
      closeEditorWithoutPrompt,
      setActiveBuffer,
      reorderBuffers,
      splitEditor,
      closeGroup,
      focusGroup,
      setActiveBufferInGroup,
      reorderWithinGroup,
      moveBufferToGroup,
      requestCloseBufferInGroup,
      setBufferContentByKey,
      setSplitLayout,
      collapseEditor,
      expandEditor,
      hideEditor,
      toggleEditor,
      setEditorContent,
      setBufferViewState,
      applyExternalContent,
      revertEditorFile,
      confirmPendingActionWithSave,
      discardPendingAction,
      cancelPendingAction,
      clearNotice,
      revealRequest,
      requestRevealInTree,
      clearRevealRequest,
    ]
  );

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
};

export function useEditorContext(): EditorContextValue {
  const context = useContext(EditorContext);
  if (!context) throw new Error('useEditorContext must be used within EditorProvider');
  return context;
}

export function useEditorContextSafe(): EditorContextValue | null {
  return useContext(EditorContext);
}
