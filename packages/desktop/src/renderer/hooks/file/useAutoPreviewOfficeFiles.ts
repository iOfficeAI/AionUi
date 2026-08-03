/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { ConversationContextValue } from '@/renderer/hooks/context/ConversationContext';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { useAutoPreviewOfficeFilesEnabled } from '@/renderer/hooks/system/useAutoPreviewOfficeFilesEnabled';
import { getFileTypeInfo } from '@/renderer/utils/file/fileType';
import { Message } from '@arco-design/web-react';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

const OFFICE_OPEN_DELAY_MS = 1000;
const OFFICE_CONTENT_TYPES = new Set(['ppt', 'word', 'excel']);

/**
 * Backend error code (HTTP 503) when the file-watch service is disabled — e.g.
 * the OS inotify instance/watch quota is exhausted (ARM Linux, EMFILE/ENFILE).
 * The backend now degrades gracefully (watcher off, backend still starts), so
 * the front end must degrade too: auto-preview silently stops working, and we
 * surface ONE accurate, actionable hint — never a "reinstall / missing
 * resources" prompt, which does not fix a quota problem (ELECTRON-2PM).
 */
const FILE_WATCH_UNAVAILABLE_CODE = 'FILE_WATCH_UNAVAILABLE';

// Session-scoped guard: the hook remounts on every conversation/workspace
// switch, but the hint must fire at most once per app session (not per mount).
let fileWatchUnavailableWarned = false;

const normalizeWatchPath = (value: string): string => {
  const normalized = value.replaceAll('\\', '/');

  if (normalized === '/private/var') return '/var';
  if (normalized.startsWith('/private/var/')) return normalized.slice('/private'.length);
  if (normalized === '/private/tmp') return '/tmp';
  if (normalized.startsWith('/private/tmp/')) return normalized.slice('/private'.length);

  return normalized;
};

/**
 * Auto-opens a preview tab when a new .pptx/.docx/.xlsx file appears in the
 * workspace during the current conversation.
 *
 * The backend keeps a workspace watcher and emits `workspaceOfficeWatch.fileAdded`
 * when a matching file is created. This hook captures the initial baseline once,
 * then opens previews only for newly added Office files.
 */
export const useAutoPreviewOfficeFiles = (
  conversation: Pick<ConversationContextValue, 'conversation_id' | 'workspace'> | null
) => {
  const enabled = useAutoPreviewOfficeFilesEnabled();
  const { t } = useTranslation();
  const { findPreviewTab, openPreview } = usePreviewContext();
  const knownOfficeFilesRef = useRef<Set<string>>(new Set());
  const openTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const workspace = conversation?.workspace?.trim() ? conversation.workspace : undefined;
  const normalizedWorkspace = workspace ? normalizeWatchPath(workspace) : undefined;

  const clearPendingOpenTimers = useCallback(() => {
    for (const timer of openTimersRef.current.values()) {
      clearTimeout(timer);
    }
    openTimersRef.current.clear();
  }, []);

  const openOfficePreview = useCallback(
    (file_path: string) => {
      if (!workspace) return;
      const normalizedFilePath = normalizeWatchPath(file_path);
      if (openTimersRef.current.has(normalizedFilePath)) return;

      const { contentType } = getFileTypeInfo(file_path);
      if (!OFFICE_CONTENT_TYPES.has(contentType)) return;

      const file_name = file_path.split(/[\\/]/).pop() ?? file_path;
      const timer = setTimeout(() => {
        openTimersRef.current.delete(normalizedFilePath);

        if (!findPreviewTab(contentType, '', { file_path, file_name })) {
          openPreview('', contentType, { file_path, file_name, title: file_name, workspace, editable: false });
        }
      }, OFFICE_OPEN_DELAY_MS);

      openTimersRef.current.set(normalizedFilePath, timer);
    },
    [findPreviewTab, openPreview, workspace]
  );

  useEffect(() => {
    knownOfficeFilesRef.current = new Set();
    clearPendingOpenTimers();

    if (!enabled || !workspace) {
      return;
    }

    let cancelled = false;
    const primeOfficeWatch = async () => {
      try {
        await ipcBridge.workspaceOfficeWatch.start.invoke({ workspace });
        const currentFiles = await ipcBridge.fs.listWorkspaceFiles.invoke({ root: workspace });
        if (cancelled) return;
        knownOfficeFilesRef.current = new Set(
          currentFiles
            .map((file) => file.fullPath)
            .map((file_path) => normalizeWatchPath(file_path))
            .filter((file_path) => OFFICE_CONTENT_TYPES.has(getFileTypeInfo(file_path).contentType))
        );
      } catch (error) {
        // File-watch unavailable (503 FILE_WATCH_UNAVAILABLE): the OS watch quota
        // is exhausted. Auto-preview just stops working — surface ONE accurate,
        // actionable hint, never a "reinstall / missing resources" prompt.
        if (
          !cancelled &&
          !fileWatchUnavailableWarned &&
          isBackendHttpError(error) &&
          error.code === FILE_WATCH_UNAVAILABLE_CODE
        ) {
          fileWatchUnavailableWarned = true;
          const errno = (error.details as { errno?: number } | undefined)?.errno;
          if (errno !== undefined) {
            console.warn(`[useAutoPreviewOfficeFiles] file watch unavailable (errno ${errno}); auto-preview disabled`);
          }
          Message.warning(
            t('conversation.officePreview.fileWatchUnavailable', {
              defaultValue:
                'Live file watching is unavailable — the system may have run out of file-watch handles (inotify). Auto-preview of new Office files is disabled. Raise fs.inotify.max_user_instances or close programs holding many file watches.',
            })
          );
        }
        // Any other failure: stay inert rather than noisy.
      }
    };

    void primeOfficeWatch();

    const unsubscribeFileAdded = ipcBridge.workspaceOfficeWatch.fileAdded.on((event) => {
      try {
        const normalizedEventWorkspace = normalizeWatchPath(event.workspace);
        if (normalizedEventWorkspace !== normalizedWorkspace) return;

        const normalizedFilePath = normalizeWatchPath(event.file_path);
        if (knownOfficeFilesRef.current.has(normalizedFilePath)) return;

        knownOfficeFilesRef.current.add(normalizedFilePath);
        openOfficePreview(event.file_path);
      } catch (error) {
        console.error('[useAutoPreviewOfficeFiles] failed to process fileAdded event', error, event);
      }
    });

    return () => {
      cancelled = true;
      unsubscribeFileAdded();
      clearPendingOpenTimers();
      knownOfficeFilesRef.current.clear();
      void ipcBridge.workspaceOfficeWatch.stop.invoke({ workspace }).catch(() => {});
    };
  }, [clearPendingOpenTimers, enabled, normalizedWorkspace, openOfficePreview, t, workspace]);
};
