/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { PreviewContentType } from '@/common/types/office/preview';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { getFileTypeInfo } from '@/renderer/utils/file/fileType';
import { useCallback, useEffect, useRef } from 'react';

const FILE_OPEN_DELAY_MS = 500;

/**
 * Content types that render from file path alone (no content string needed).
 * The viewer reads the file directly from disk.
 */
const PATH_ONLY_CONTENT_TYPES = new Set<PreviewContentType>(['pdf', 'ppt', 'word', 'excel', 'image']);

/**
 * Checks whether a file path looks like a renderable asset (has a recognized
 * file extension). Paths without a dotted extension (e.g. "Makefile",
 * ".gitignore") are skipped so we don't auto-open config or metadata files.
 */
const hasRecognizedExtension = (filePath: string): boolean => {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  if (!ext || ext === filePath.toLowerCase()) return false;
  const baseName = filePath.split(/[\\/]/).pop() || '';
  if (baseName.startsWith('.') && baseName.indexOf('.', 1) === -1) return false;
  return true;
};

/**
 * Auto-opens a preview tab when the AI agent creates or overwrites a file
 * in the workspace during the current conversation.
 *
 * Uses TWO signal sources:
 * 1. `fileStream.contentUpdate` — real-time push for tool-call file writes
 * 2. `conversation.responseStream` — for tool results like image generation
 *    where the file path appears in the tool output (POUNDING_IMG: marker).
 *
 * Debounces per file to avoid flashing during streaming writes.
 */
export const useAutoPreviewFiles = (params: { conversationId?: string; workspace?: string }) => {
  const { conversationId, workspace } = params;
  const { findPreviewTab, openPreview } = usePreviewContext();
  const openTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const autoOpenedRef = useRef<Set<string>>(new Set());

  const clearPendingTimers = useCallback(() => {
    for (const timer of openTimersRef.current.values()) {
      clearTimeout(timer);
    }
    openTimersRef.current.clear();
  }, []);

  const openFilePreview = useCallback(
    async (file_path: string, absolutePath: string, content: string, _relative_path: string) => {
      if (openTimersRef.current.has(absolutePath)) return;

      const { contentType, editable } = getFileTypeInfo(file_path);
      const file_name = file_path.split(/[\\/]/).pop() ?? file_path;
      const title = file_name;

      const timer = setTimeout(async () => {
        openTimersRef.current.delete(absolutePath);

        if (findPreviewTab(contentType, content, { file_path: absolutePath, file_name })) return;

        console.log(`[useAutoPreviewFiles] auto-opening preview: ${file_name} (${contentType})`);

        let previewContent = content;

        // Read actual file content for types that need it.
        // Images must be read as base64 (the viewer renders from data URI).
        // Text/code files use the event content if available; otherwise read from disk.
        if (contentType === 'image') {
          try {
            const base64 = await ipcBridge.fs.getImageBase64.invoke({
              path: absolutePath,
              workspace: workspace || undefined,
            });
            if (base64) {
              previewContent = base64;
            }
          } catch {
            // If read fails, pass empty content — the viewer will show an error state
            previewContent = '';
          }
        } else if (
          contentType === 'code' ||
          contentType === 'markdown' ||
          contentType === 'html' ||
          contentType === 'diff'
        ) {
          if (!previewContent || previewContent.length < 10) {
            try {
              const readContent = await ipcBridge.fs.readFile.invoke({
                path: absolutePath,
                workspace: workspace || undefined,
              });
              if (readContent != null) {
                previewContent = readContent;
              }
            } catch {
              // Keep the existing (possibly empty) content
            }
          }
        }
        // PDF, Word, Excel, PPT: pass empty content — viewers use file_path

        openPreview(previewContent, contentType, {
          file_path: absolutePath,
          file_name,
          title,
          workspace: workspace || undefined,
          editable: contentType === 'image' ? false : editable,
        });
      }, FILE_OPEN_DELAY_MS);

      openTimersRef.current.set(absolutePath, timer);
    },
    [findPreviewTab, openPreview, workspace]
  );

  // ── Signal 1: fileStream.contentUpdate ──────────────────────────────────
  useEffect(() => {
    console.log('[useAutoPreviewFiles] Signal1 mounted — listening for contentUpdate events');
    autoOpenedRef.current = new Set();
    clearPendingTimers();

    const unsubscribe = ipcBridge.fileStream.contentUpdate.on((event) => {
      try {
        console.log('[useAutoPreviewFiles] contentUpdate event:', {
          operation: event.operation,
          relative_path: event.relative_path,
          file_path: event.file_path,
          workspace: event.workspace,
          contentLen: event.content?.length ?? 0,
        });

        if (event.operation !== 'write') return;
        if (!event.relative_path) return;
        if (!hasRecognizedExtension(event.relative_path)) return;

        const { file_path, content, workspace: eventWorkspace } = event;
        if (!file_path) return;

        // Only auto-open in the conversation that owns this workspace
        if (workspace && eventWorkspace && workspace !== eventWorkspace) {
          return;
        }

        if (autoOpenedRef.current.has(file_path)) return;

        const { contentType } = getFileTypeInfo(event.relative_path);

        // For text/code files, skip if content is too short (streaming not done)
        if (!PATH_ONLY_CONTENT_TYPES.has(contentType) && content.length < 10) {
          console.log('[useAutoPreviewFiles] skipping: content too short for text file');
          return;
        }

        autoOpenedRef.current.add(file_path);
        const ws = eventWorkspace || workspace || '';
        // Resolve absolute path: use file_path if absolute, otherwise join with workspace
        const absolutePath = file_path.startsWith('/') ? file_path : `${ws}/${event.relative_path}`;
        openFilePreview(event.relative_path, absolutePath, content, event.relative_path);
      } catch (error) {
        console.error('[useAutoPreviewFiles] error in contentUpdate handler', error, event);
      }
    });

    return () => {
      unsubscribe();
      clearPendingTimers();
      autoOpenedRef.current.clear();
    };
  }, [clearPendingTimers, openFilePreview, workspace]);

  // ── Signal 2: Parse file paths from tool call results ───────────────────
  useEffect(() => {
    console.log('[useAutoPreviewFiles] Signal2 mounted — listening for responseStream tool events');
    let msgCount = 0;
    const unsubscribe = ipcBridge.conversation.responseStream.on((msg) => {
      try {
        msgCount++;
        if (msgCount % 20 === 0) {
          console.log(`[useAutoPreviewFiles] Signal2 received ${msgCount} total msgs, last type: ${msg.type}`);
        }

        // Only auto-open in the conversation that produced this tool call
        if (conversationId && msg.conversation_id && msg.conversation_id !== conversationId) return;

        if (msg.type !== 'tool_call' && msg.type !== 'acp_tool_call' && msg.type !== 'tool_group') return;

        const data = msg.data as Record<string, unknown> | undefined;
        if (!data) return;

        const resultDisplay = data.result_display;

        let filePath: string | null = null;

        // Case 1: Structured object (image generation returns { img_url, relative_path })
        if (typeof resultDisplay === 'object' && resultDisplay !== null) {
          const obj = resultDisplay as Record<string, unknown>;
          if (typeof obj.relative_path === 'string' && obj.relative_path) {
            filePath = obj.relative_path;
          }
        }

        // Case 2: String output with POUNDING_IMG marker or "Generated image saved to:" line
        if (!filePath && typeof resultDisplay === 'string') {
          const imgMatch = resultDisplay.match(/<!--\s*POUNDING_IMG:(.+?)\s*-->/);
          if (imgMatch) {
            filePath = imgMatch[1].trim();
          } else {
            const savedMatch = resultDisplay.match(/Generated image saved to:\s*(.+)$/m);
            if (savedMatch) filePath = savedMatch[1].trim();
          }
        }

        // Case 3: Check data.output as fallback string source
        if (!filePath && typeof data.output === 'string') {
          const imgMatch = data.output.match(/<!--\s*POUNDING_IMG:(.+?)\s*-->/);
          if (imgMatch) {
            filePath = imgMatch[1].trim();
          } else {
            const savedMatch = data.output.match(/Generated image saved to:\s*(.+)$/m);
            if (savedMatch) filePath = savedMatch[1].trim();
          }
        }

        if (!filePath) return;
        if (autoOpenedRef.current.has(filePath)) return;
        if (!hasRecognizedExtension(filePath)) return;

        // Resolve workspace: prefer tool input workspace_dir, fallback to hook param
        const inputWorkspace =
          typeof data.input === 'object' && data.input !== null
            ? ((data.input as Record<string, unknown>).workspace_dir as string | undefined)
            : undefined;
        const resolvedWs = (inputWorkspace || workspace || '').replace(/\/+$/, '');

        // Resolve to absolute path
        let absolutePath: string;
        if (filePath.startsWith('/')) {
          absolutePath = filePath;
        } else if (resolvedWs) {
          absolutePath = filePath.startsWith(resolvedWs) ? filePath : `${resolvedWs}/${filePath}`;
        } else {
          absolutePath = filePath; // no workspace — keep as-is, best-effort
        }
        autoOpenedRef.current.add(filePath);

        console.log(`[useAutoPreviewFiles] tool output file detected: ${filePath} → ${absolutePath}`);

        openFilePreview(filePath, absolutePath, '', filePath);
      } catch (error) {
        // Best-effort — don't spam console on parse failures
      }
    });

    return () => {
      unsubscribe();
    };
  }, [workspace, conversationId, openFilePreview]);
};
