/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { WeixinChatRequest } from './WeixinMonitor';
import type { IUnifiedIncomingMessage } from '../../types';

// ==================== Inbound ====================

/**
 * Convert a WeixinChatRequest to the unified incoming message format.
 * Text-only: media attachments are not supported in this iteration.
 */
export function toUnifiedIncomingMessage(request: WeixinChatRequest): IUnifiedIncomingMessage {
  const { conversationId, text } = request;
  return {
    id: conversationId,
    platform: 'weixin',
    chatId: conversationId,
    user: {
      id: conversationId,
      displayName: conversationId.slice(-6),
    },
    content: {
      type: 'text',
      text: text ?? '',
    },
    timestamp: Date.now(),
  };
}

// ==================== Text Formatting ====================

/**
 * Strip HTML tags and decode common HTML entities to plain text.
 * WeChat does not support HTML markup, so all outgoing text must be plain.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]*>/g, '');
}
