/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { joinPath } from '@/common/chat/chatLib';
import type { TMessage } from '@/common/chat/chatLib';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { getFileTypeInfo } from '@/renderer/utils/file/fileType';
import { useEffect, useRef } from 'react';

const OFFICE_EXTENSIONS = /\.(pptx|docx|xlsx)$/i;

const BASH_OUTPUT_REGEX = /(?:Saved to|Generated|officecli\S*)\s+(\S+\.(?:pptx|docx|xlsx))/i;

// Matches office filenames in officecli command descriptions.
// Takes the LAST match so "input.docx output.pptx" resolves to the output file.
const DESCRIPTION_OFFICE_RE = /["']?([A-Za-z0-9][^"'\s]*\.(?:pptx|docx|xlsx))["']?/gi;

function resolveFilePath(raw: string, workspace: string | undefined): string {
  const isAbsolute = raw.startsWith('/') || /^[A-Za-z]:/.test(raw);
  return isAbsolute || !workspace ? raw : joinPath(workspace, raw);
}

/**
 * Auto-opens a preview tab when an AI tool call produces a .pptx/.docx/.xlsx file,
 * but ONLY when the user is watching the generation happen live.
 *
 * A tool call only triggers auto-preview if we observed it in a non-Success state
 * (Executing / Pending / Confirming) during this component's mount lifetime before
 * it completed. Historical tool calls that arrive already-Success at mount time
 * are never triggered.
 *
 * Handles two message types:
 * - tool_group: Claude/Gemini/ACP mode (WriteFile + Bash tools)
 * - codex_tool_call: Claude Code mode (patch_apply + exec_command tools)
 */
export const useAutoPreviewOfficeFiles = (messages: TMessage[], workspace: string | undefined) => {
  const { findPreviewTab, openPreview } = usePreviewContext();

  // callIds we have seen in an in-progress state during this mount.
  // Only these are eligible to trigger auto-preview when they reach Success.
  const seenInProgress = useRef<Set<string>>(new Set());

  // callIds for which we have already fired auto-preview (dedup).
  const fired = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const message of messages) {
      // --- tool_group: Claude / Gemini / ACP mode ---
      if (message.type === 'tool_group') {
        for (const tool of message.content) {
          const { callId, status } = tool;

          // Track any non-terminal state so we know the user watched it run.
          if (status === 'Executing' || status === 'Pending' || status === 'Confirming') {
            seenInProgress.current.add(callId);
            continue;
          }

          if (status !== 'Success') continue;
          if (!seenInProgress.current.has(callId)) continue; // historical — skip
          if (fired.current.has(callId)) continue;

          const { name, description, resultDisplay } = tool;
          let filePath: string | null = null;

          if (
            name === 'WriteFile' &&
            resultDisplay !== null &&
            typeof resultDisplay === 'object' &&
            'fileName' in resultDisplay
          ) {
            const fileName = (resultDisplay as { fileName: string }).fileName;
            if (OFFICE_EXTENSIONS.test(fileName)) {
              filePath = resolveFilePath(fileName, workspace);
            }
          } else if (typeof resultDisplay === 'string') {
            const match = BASH_OUTPUT_REGEX.exec(resultDisplay);
            if (match) filePath = resolveFilePath(match[1], workspace);
          }

          // officecli command fallback: only when "officecli" appears in the description.
          // Takes the LAST filename so "input.docx output.pptx" resolves to output.pptx.
          if (!filePath && description && description.toLowerCase().includes('officecli')) {
            const matches = [...description.matchAll(DESCRIPTION_OFFICE_RE)];
            const last = matches[matches.length - 1];
            if (last) filePath = resolveFilePath(last[1], workspace);
          }

          if (!filePath) continue;
          openOfficePreview(callId, filePath, workspace, fired, findPreviewTab, openPreview);
        }
        continue;
      }

      // --- codex_tool_call: Claude Code mode ---
      // codex messages don't surface an intermediate Executing state in the message list;
      // use message.id presence before success as the proxy for "in progress".
      if (message.type === 'codex_tool_call') {
        const mc = message.content;
        const id = message.id;

        if (mc.status !== 'success') {
          // Still running — mark as seen in progress.
          seenInProgress.current.add(id);
          continue;
        }

        if (!seenInProgress.current.has(id)) continue; // historical — skip
        if (fired.current.has(id)) continue;

        let filePath: string | null = null;

        const diffItem = mc.content?.find((c) => c.filePath && OFFICE_EXTENSIONS.test(c.filePath));
        if (diffItem?.filePath) {
          filePath = diffItem.filePath;
        }

        if (!filePath) {
          const outputItem = mc.content?.find((c) => c.type === 'output' && c.output);
          if (outputItem?.output) {
            const match = BASH_OUTPUT_REGEX.exec(outputItem.output);
            if (match) filePath = resolveFilePath(match[1], workspace);
          }
        }

        if (!filePath) continue;
        openOfficePreview(id, filePath, workspace, fired, findPreviewTab, openPreview);
      }
    }
  }, [messages, workspace, findPreviewTab, openPreview]);
};

function openOfficePreview(
  id: string,
  filePath: string,
  workspace: string | undefined,
  fired: React.RefObject<Set<string>>,
  findPreviewTab: ReturnType<typeof usePreviewContext>['findPreviewTab'],
  openPreview: ReturnType<typeof usePreviewContext>['openPreview']
): void {
  fired.current.add(id);

  const { contentType } = getFileTypeInfo(filePath);
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath;

  if (!findPreviewTab(contentType, '', { filePath, fileName })) {
    openPreview('', contentType, { filePath, fileName, title: fileName, workspace, editable: false });
  }
}
