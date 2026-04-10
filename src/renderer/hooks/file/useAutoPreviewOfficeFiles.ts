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
  conversation: Pick<ConversationContextValue, 'conversationId' | 'workspace'> | null
) => {
  const enabled = useAutoPreviewOfficeFilesEnabled();
  const { findPreviewTab, openPreview } = usePreviewContext();
  const knownOfficeFilesRef = useRef<Set<string>>(new Set());
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const scanRequestIdRef = useRef(0);
  const workspace = conversation?.workspace?.trim() ? conversation.workspace : undefined;
  const conversationId = conversation?.conversationId;

  const clearPendingOpenTimers = useCallback(() => {
    for (const timer of openTimersRef.current.values()) {
      clearTimeout(timer);
    }
    openTimersRef.current.clear();
  }, []);

  const syncOfficeFiles = useCallback(
    async (openNewFiles: boolean) => {
      if (!enabled || !workspace || !conversationId) return;

      const requestId = ++scanRequestIdRef.current;

      try {
        const currentFiles = await ipcBridge.workspaceOfficeWatch.scan.invoke({ workspace });
        if (requestId !== scanRequestIdRef.current) return;

        if (openNewFiles) {
          const newFiles = findNewOfficeFiles(currentFiles, knownOfficeFilesRef.current);

          for (const filePath of newFiles) {
            if (openTimersRef.current.has(filePath)) {
              continue;
            }

            const { contentType } = getFileTypeInfo(filePath);
            const fileName = filePath.split(/[\\/]/).pop() ?? filePath;

            const timer = setTimeout(() => {
              openTimersRef.current.delete(filePath);

              if (!findPreviewTab(contentType, '', { filePath, fileName })) {
                openPreview('', contentType, { filePath, fileName, title: fileName, workspace, editable: false });
              }
            }, OFFICE_OPEN_DELAY_MS);

            openTimersRef.current.set(filePath, timer);
          }
        }

        knownOfficeFilesRef.current = new Set(currentFiles);
      } catch {
        // Ignore scan failures and keep current baseline unchanged.
      }
    },
    [conversationId, enabled, findPreviewTab, openPreview, workspace]
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

    if (!enabled || !workspace || !conversationId) {
      return;
    }

    void syncOfficeFiles(false);

    const unsubscribeResponse = ipcBridge.conversation.responseStream.on((message) => {
      if (message.conversation_id !== conversationId) return;
      if (!isOfficeAutoPreviewTriggerMessage(message)) return;

      scheduleOfficeScan();
    });

    const unsubscribeTurnCompleted = ipcBridge.conversation.turnCompleted.on((event) => {
      if (event.sessionId !== conversationId) return;
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
  }, [clearPendingOpenTimers, conversationId, enabled, scheduleOfficeScan, syncOfficeFiles, workspace]);
};
