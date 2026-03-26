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
  // Strip tags first, then decode entities, then strip again.
  // Two-pass approach handles entity-encoded tags (&lt;script&gt; → <script>)
  // while the single-pass entity decoder prevents double-unescaping (&amp;lt; stays &lt;).
  const decoded = stripTags(html).replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (entity) => {
    if (entity === '&amp;') return '&';
    if (entity === '&lt;') return '<';
    if (entity === '&gt;') return '>';
    if (entity === '&quot;') return '"';
    if (entity === '&#39;') return "'";
    if (entity === '&nbsp;') return ' ';
    return entity;
  });
  return stripTags(decoded);
}

function stripTags(str: string): string {
  let result = str;
  let prev: string;
  do {
    prev = result;
    result = result.replace(/<[^>]*>/g, '');
  } while (result !== prev);
  return result;
}
