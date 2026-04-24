/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ConversationContextValue } from '@/renderer/hooks/context/ConversationContext';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import {
  findNewOfficeFiles,
  isOfficeAutoPreviewTriggerMessage,
  useAutoPreviewOfficeFilesEnabled,
} from '@/renderer/hooks/system/useAutoPreviewOfficeFilesEnabled';
import { getFileTypeInfo } from '@/renderer/utils/file/fileType';
import { useCallback, useEffect, useRef } from 'react';

const OFFICE_SCAN_DEBOUNCE_MS = 1500;
const OFFICE_OPEN_DELAY_MS = 1000;

/**
 * Auto-opens a preview tab when a new .pptx/.docx/.xlsx file appears in the
 * workspace during the current conversation.
 *
 * Instead of keeping a recursive fs watcher alive for the entire workspace,
 * this hook performs a debounced Office-file scan only after conversation tool
 * activity or turn completion. That avoids continuously watching large source
 * trees such as repositories containing node_modules.
 */
export const useAutoPreviewOfficeFiles = (
  conversation: Pick<ConversationContextValue, 'conversation_id' | 'workspace'> | null
) => {
  const enabled = useAutoPreviewOfficeFilesEnabled();
  const { findPreviewTab, openPreview } = usePreviewContext();
  const knownOfficeFilesRef = useRef<Set<string>>(new Set());
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const scanRequestIdRef = useRef(0);
  const workspace = conversation?.workspace?.trim() ? conversation.workspace : undefined;
  const conversation_id = conversation?.conversation_id;

  const clearPendingOpenTimers = useCallback(() => {
    for (const timer of openTimersRef.current.values()) {
      clearTimeout(timer);
    }
    openTimersRef.current.clear();
  }, []);

  const syncOfficeFiles = useCallback(
    async (openNewFiles: boolean) => {
      if (!enabled || !workspace || !conversation_id) return;

      const requestId = ++scanRequestIdRef.current;

      try {
        const currentFiles = await ipcBridge.workspaceOfficeWatch.scan.invoke({ workspace });
        if (requestId !== scanRequestIdRef.current) return;

        if (openNewFiles) {
          const newFiles = findNewOfficeFiles(currentFiles, knownOfficeFilesRef.current);

          for (const file_path of newFiles) {
            if (openTimersRef.current.has(file_path)) {
              continue;
            }

            const { contentType } = getFileTypeInfo(file_path);
            const file_name = file_path.split(/[\\/]/).pop() ?? file_path;

            const timer = setTimeout(() => {
              openTimersRef.current.delete(file_path);

              if (!findPreviewTab(contentType, '', { file_path, file_name })) {
                openPreview('', contentType, { file_path, file_name, title: file_name, workspace, editable: false });
              }
            }, OFFICE_OPEN_DELAY_MS);

            openTimersRef.current.set(file_path, timer);
          }
        }

        knownOfficeFilesRef.current = new Set(currentFiles);
      } catch {
        // Ignore scan failures and keep current baseline unchanged.
      }
    },
    [conversation_id, enabled, findPreviewTab, openPreview, workspace]
  );

  const scheduleOfficeScan = useCallback(() => {
    if (scanTimerRef.current) {
      clearTimeout(scanTimerRef.current);
    }

    scanTimerRef.current = setTimeout(() => {
      scanTimerRef.current = null;
      void syncOfficeFiles(true);
    }, OFFICE_SCAN_DEBOUNCE_MS);
  }, [syncOfficeFiles]);

  useEffect(() => {
    knownOfficeFilesRef.current = new Set();
    scanRequestIdRef.current += 1;
    clearPendingOpenTimers();

    if (scanTimerRef.current) {
      clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }

    if (!enabled || !workspace || !conversation_id) {
      return;
    }

    void syncOfficeFiles(false);

    const unsubscribeResponse = ipcBridge.conversation.responseStream.on((message) => {
      if (message.conversation_id !== conversation_id) return;
      if (!isOfficeAutoPreviewTriggerMessage(message)) return;

      scheduleOfficeScan();
    });

    const unsubscribeTurnCompleted = ipcBridge.conversation.turnCompleted.on((event) => {
      if (event.session_id !== conversation_id) return;
      if (event.status !== 'finished') return;

      scheduleOfficeScan();
    });

    return () => {
      unsubscribeResponse();
      unsubscribeTurnCompleted();

      if (scanTimerRef.current) {
        clearTimeout(scanTimerRef.current);
        scanTimerRef.current = null;
      }

      clearPendingOpenTimers();
      knownOfficeFilesRef.current.clear();
      scanRequestIdRef.current += 1;
    };
  }, [clearPendingOpenTimers, conversation_id, enabled, scheduleOfficeScan, syncOfficeFiles, workspace]);
};
