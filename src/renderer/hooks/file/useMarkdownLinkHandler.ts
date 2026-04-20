/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import { usePreviewContextSafe } from '@/renderer/pages/conversation/Preview/context';
import {
  openMarkdownLinkPreview,
  resolveMarkdownLinkFallbackHref,
  type MarkdownLinkPreviewContext,
} from '@/renderer/utils/file/markdownLinkPreview';
import { openExternalUrl } from '@/renderer/utils/platform';
import type React from 'react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

export const useMarkdownLinkHandler = ({ workspace: workspaceOverride, baseDir }: MarkdownLinkPreviewContext = {}) => {
  const { t } = useTranslation();
  const conversationContext = useConversationContextSafe();
  const previewContext = usePreviewContextSafe();
  const workspace = workspaceOverride ?? conversationContext?.workspace;
  const openPreview = previewContext?.openPreview;

  return useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const rawHref = event.currentTarget.getAttribute('href')?.trim();
      if (!rawHref) {
        return;
      }

      const fallbackHref = resolveMarkdownLinkFallbackHref(rawHref, event.currentTarget.href, { workspace, baseDir });

      void (async () => {
        const handled = await openMarkdownLinkPreview({
          href: rawHref,
          workspace,
          baseDir,
          openPreview,
        });

        if (!handled) {
          await openExternalUrl(fallbackHref);
        }
      })().catch((error: unknown) => {
        console.error(t('messages.openLinkFailed'), error);
      });
    },
    [baseDir, openPreview, t, workspace]
  );
};
