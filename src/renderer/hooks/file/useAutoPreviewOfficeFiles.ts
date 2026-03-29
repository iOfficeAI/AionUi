/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { joinPath } from '@/common/chat/chatLib';
import type { TMessage } from '@/common/chat/chatLib';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { getFileTypeInfo } from '@/renderer/utils/file/fileType';
import { useEffect } from 'react';

// Module-level set — persists across conversation navigation (component re-mounts).
// Ensures each tool call triggers auto-preview at most once per app session.
const firedSessionIds = new Set<string>();

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
 * Auto-opens a preview tab when an AI tool call produces a .pptx/.docx/.xlsx file.
 * Fires at most once per tool call per conversation session.
 *
 * Handles two message types:
 * - tool_group: Claude/Gemini/ACP mode (WriteFile + Bash tools)
 * - codex_tool_call: Claude Code mode (patch_apply + exec_command tools)
 *
 * Must be called inside both MessageListProvider and ConversationProvider scopes.
 */
export const useAutoPreviewOfficeFiles = (messages: TMessage[], workspace: string | undefined) => {
  const { findPreviewTab, openPreview } = usePreviewContext();

  useEffect(() => {
    for (const message of messages) {
      // --- tool_group: Claude / Gemini / ACP mode ---
      if (message.type === 'tool_group') {
        for (const tool of message.content) {
          if (tool.status !== 'Success') continue;

          const { callId, name, description, resultDisplay } = tool;
          if (firedSessionIds.has(callId)) continue;

          let filePath: string | null = null;

          if (
            name === 'WriteFile' &&
            resultDisplay !== null &&
            typeof resultDisplay === 'object' &&
            'fileName' in resultDisplay
          ) {
            // WriteFile: structured result carries the filename directly
            const fileName = (resultDisplay as { fileName: string }).fileName;
            if (OFFICE_EXTENSIONS.test(fileName)) {
              filePath = resolveFilePath(fileName, workspace);
            }
          } else if (typeof resultDisplay === 'string') {
            // Shell/Bash: try matching output text first
            const match = BASH_OUTPUT_REGEX.exec(resultDisplay);
            if (match) filePath = resolveFilePath(match[1], workspace);
          }

          // officecli command fallback: description contains the command text, e.g.
          // 'officecli create "Financial_Dashboard.xlsx"'. Only scan when "officecli"
          // appears in the description to avoid false positives from non-shell tools
          // that mention office formats in passing.
          // Takes the LAST match so "input.docx output.pptx" resolves to output.pptx.
          if (!filePath && description && description.toLowerCase().includes('officecli')) {
            const matches = [...description.matchAll(DESCRIPTION_OFFICE_RE)];
            const last = matches[matches.length - 1];
            if (last) filePath = resolveFilePath(last[1], workspace);
          }

          if (!filePath) continue;
          tryOpenPreview(callId, filePath, workspace, findPreviewTab, openPreview);
        }
        continue;
      }

      // --- codex_tool_call: Claude Code mode ---
      if (message.type === 'codex_tool_call') {
        const mc = message.content;
        if (mc.status !== 'success') continue;

        // Use message.id as dedup key — each logical tool call is one merged message
        const id = message.id;
        if (firedSessionIds.has(id)) continue;

        let filePath: string | null = null;

        // Patch operations: content items carry filePath for written files
        const diffItem = mc.content?.find((c) => c.filePath && OFFICE_EXTENSIONS.test(c.filePath));
        if (diffItem?.filePath) {
          filePath = diffItem.filePath;
        }

        // Exec operations: scan output content for office file references
        if (!filePath) {
          const outputItem = mc.content?.find((c) => c.type === 'output' && c.output);
          if (outputItem?.output) {
            const match = BASH_OUTPUT_REGEX.exec(outputItem.output);
            if (match) filePath = resolveFilePath(match[1], workspace);
          }
        }

        if (!filePath) continue;
        tryOpenPreview(id, filePath, workspace, findPreviewTab, openPreview);
      }
    }
  }, [messages, workspace, findPreviewTab, openPreview]);
};

function tryOpenPreview(
  id: string,
  filePath: string,
  workspace: string | undefined,
  findPreviewTab: ReturnType<typeof usePreviewContext>['findPreviewTab'],
  openPreview: ReturnType<typeof usePreviewContext>['openPreview']
): void {
  const { contentType } = getFileTypeInfo(filePath);
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath;
  const alreadyOpen = findPreviewTab(contentType, '', { filePath, fileName });

  firedSessionIds.add(id);

  if (!alreadyOpen) {
    openPreview('', contentType, { filePath, fileName, title: fileName, workspace, editable: false });
  }
}
