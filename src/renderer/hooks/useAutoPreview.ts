/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef } from 'react';
import { ipcBridge } from '@/common';
import { joinPath } from '@/common/chatLib';
import type { TChatConversation } from '@/common/storage';
import type { PreviewContentType } from '@/common/types/preview';
import { ASSISTANT_PRESETS } from '@/common/presets/assistantPresets';
import { usePreviewContext } from '@/renderer/pages/conversation/preview';

type PreviewConfig = {
  autoOpen?: boolean;
  file?: string;
  contentType?: string;
  title?: string;
};

/**
 * Resolve preview config for a conversation.
 * Checks conversation.extra.preview first, then falls back to ASSISTANT_PRESETS.
 */
function resolvePreviewConfig(conversation: TChatConversation): PreviewConfig | null {
  const extra = conversation.extra as {
    preview?: PreviewConfig;
    presetAssistantId?: string;
    customAgentId?: string;
  };

  // 1. Direct preview config from conversation extra (set during creation from assistant.json)
  if (extra?.preview) {
    return extra.preview;
  }

  // 2. Fall back to built-in preset lookup
  const presetId = (extra?.presetAssistantId || extra?.customAgentId || '').replace('builtin-', '');
  if (presetId) {
    const preset = ASSISTANT_PRESETS.find((p) => p.id === presetId);
    if (preset?.preview) {
      return preset.preview;
    }
  }

  return null;
}

/**
 * Auto-open preview sidebar based on assistant configuration.
 *
 * When a conversation has a preview config with `autoOpen: true`,
 * this hook will automatically open the preview sidebar with the
 * specified file on first mount.
 *
 * Supports configuration from:
 * - assistant.json `preview` field (stored in conversation.extra.preview)
 * - Built-in preset `preview` field (from ASSISTANT_PRESETS)
 *
 * @param conversation - The current conversation object
 */
export function useAutoPreview(conversation: TChatConversation | undefined): void {
  const { openPreview } = usePreviewContext();
  const hasAutoOpenedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!conversation) return;

    // Avoid re-opening preview when the same conversation re-renders
    if (hasAutoOpenedRef.current === conversation.id) return;

    const previewConfig = resolvePreviewConfig(conversation);
    if (!previewConfig?.autoOpen || !previewConfig.file) return;

    const workspace = (conversation.extra as { workspace?: string })?.workspace;
    if (!workspace) return;

    // Mark as opened to prevent repeated triggers
    hasAutoOpenedRef.current = conversation.id;

    const contentType = (previewConfig.contentType || 'html') as PreviewContentType;
    const filePath = joinPath(workspace, previewConfig.file);
    const title = previewConfig.title || previewConfig.file;
    const fileName = previewConfig.file;

    // Try to read the file, fall back to placeholder if it doesn't exist yet
    ipcBridge.fs.readFile
      .invoke({ path: filePath })
      .then((content: string) => {
        openPreview(content, contentType, {
          title,
          fileName,
          filePath,
          workspace,
          editable: true,
        });
      })
      .catch(() => {
        // File doesn't exist yet (workspace template just created),
        // open with placeholder so the panel is ready for streaming updates
        if (contentType === 'html') {
          openPreview(defaultHtmlPlaceholder(title), contentType, {
            title,
            fileName,
            filePath,
            workspace,
            editable: true,
          });
        }
      });
  }, [conversation, openPreview]);
}

/**
 * Generate a minimal HTML placeholder when the file hasn't been created yet.
 */
function defaultHtmlPlaceholder(title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      font-family: system-ui, sans-serif;
      background: #1a1a2e;
      color: #e0e0e0;
    }
    .placeholder {
      text-align: center;
      opacity: 0.6;
    }
    .placeholder p {
      font-size: 14px;
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <div class="placeholder">
    <h2>${title}</h2>
    <p>Waiting for content...</p>
  </div>
</body>
</html>`;
}
