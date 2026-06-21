/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ConversationContextValue } from '@/renderer/hooks/context/ConversationContext';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { useAutoPreviewOfficeFilesEnabled } from '@/renderer/hooks/system/useAutoPreviewOfficeFilesEnabled';
import { getFileTypeInfo } from '@/renderer/utils/file/fileType';
import { useCallback, useEffect, useRef } from 'react';

const OFFICE_OPEN_DELAY_MS = 1000;
// 'html' is included for the Guided Onboarding S3 step-screen bonus only. The proven
// PRIMARY path for an EVE-authored onboarding.html is the click chain (FileChangesPanel
// -> launchPreview -> HTMLRenderer), which needs no change here. Auto-open is a
// best-effort BONUS and is inert in this worktree (no backend watcher emits fileAdded).
const OFFICE_CONTENT_TYPES = new Set(['ppt', 'word', 'excel', 'html']);

// Marker-gate for the html auto-open bonus: only auto-open HTML files that follow the
// generated step-screen naming convention (onboarding.html / onboarding-<step>.html).
// This keeps arbitrary user/agent HTML from being auto-surfaced — those still open via
// the explicit preview-click chain. Gating on the filename keeps this hook synchronous
// and side-effect-free (no file read). Marker constant lives next to the template in
// runtimeBootstrapCore (COMMAND_EVE_ONBOARDING_STEP_MARKER) for the in-content marker;
// here we gate on the filename so no async read is needed in the watch path.
const ONBOARDING_STEP_FILE_RE = /(^|[\\/])onboarding(?:-[a-z0-9-]+)?\.html$/i;

// Exported (additive, pure) so the S3 marker-gate is unit-testable without mounting
// the DOM hook. The hook's behaviour is unchanged; this is only the eligibility predicate.
export const isAutoOpenEligible = (file_path: string, contentType: string): boolean => {
  if (contentType !== 'html') return OFFICE_CONTENT_TYPES.has(contentType);
  // html: bonus auto-open ONLY for generated onboarding step-screens.
  return ONBOARDING_STEP_FILE_RE.test(file_path);
};

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
      if (!isAutoOpenEligible(file_path, contentType)) return;

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
            .filter((file_path) => isAutoOpenEligible(file_path, getFileTypeInfo(file_path).contentType))
        );
      } catch {
        // Ignore watcher/bootstrap failures; the hook should stay inert rather than noisy.
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
  }, [clearPendingOpenTimers, enabled, normalizedWorkspace, openOfficePreview, workspace]);
};
