/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageAction, IUnifiedIncomingMessage, IUnifiedMessageContent, IUnifiedOutgoingMessage, IUnifiedUser } from '../../types';

/**
 * LarkAdapter - Converts between Lark and Unified message formats
 *
 * Handles:
 * - Lark Message Event → UnifiedIncomingMessage
 * - UnifiedOutgoingMessage → Lark send parameters
 * - User info extraction
 * - Card action handling
 */

// ==================== Constants ====================

/**
 * Lark message length limit (for text messages)
 */
export const LARK_MESSAGE_LIMIT = 4000;

// ==================== Incoming Message Conversion ====================

/**
 * Lark message event structure
 */
interface LarkMessageEvent {
  event?: {
    message?: {
      message_id?: string;
      chat_id?: string;
      chat_type?: string;
      content?: string;
      message_type?: string;
      create_time?: string;
    };
    sender?: {
      sender_id?: {
        user_id?: string;
        open_id?: string;
        union_id?: string;
      };
      sender_type?: string;
      tenant_key?: string;
    };
  };
}

/**
 * Lark card action event structure
 */
interface LarkCardActionEvent {
  event?: {
    action?: {
      value?: Record<string, unknown>;
      tag?: string;
      option?: string;
    };
    operator?: {
      user_id?: string;
      open_id?: string;
    };
    token?: string;
    open_message_id?: string;
    open_chat_id?: string;
  };
}

/**
 * Convert Lark event to unified incoming message
 */
export function toUnifiedIncomingMessage(event: LarkMessageEvent | LarkCardActionEvent, actionInfo?: IMessageAction): IUnifiedIncomingMessage | null {
  // Handle card action
  if (actionInfo && 'operator' in (event.event || {})) {
    const cardEvent = event as LarkCardActionEvent;
    const operator = cardEvent.event?.operator;

    if (!operator) return null;

    const userId = operator.user_id || operator.open_id || '';
    const chatId = cardEvent.event?.open_chat_id || userId;

    return {
      id: cardEvent.event?.token || Date.now().toString(),
      platform: 'lark',
      chatId,
      user: {
        id: userId,
        displayName: `User ${userId.slice(-6)}`,
      },
      content: {
        type: 'action',
        text: actionInfo.name,
      },
      action: actionInfo,
      timestamp: Date.now(),
      raw: event,
    };
  }

  // Handle regular message
  const msgEvent = event as LarkMessageEvent;
  const message = msgEvent.event?.message;
  const sender = msgEvent.event?.sender;

  if (!message || !sender) return null;

  const userId = sender.sender_id?.user_id || sender.sender_id?.open_id || '';
  if (!userId) return null;

  const user = toUnifiedUser(sender);
  if (!user) return null;

  const content = extractMessageContent(message);

  return {
    id: message.message_id || Date.now().toString(),
    platform: 'lark',
    chatId: message.chat_id || userId,
    user,
    content,
    timestamp: message.create_time ? parseInt(message.create_time, 10) : Date.now(),
    raw: event,
  };
}

/**
 * Convert Lark sender to unified user format
 */
export function toUnifiedUser(sender: LarkMessageEvent['event']['sender']): IUnifiedUser | null {
  if (!sender?.sender_id) return null;

  const userId = sender.sender_id.user_id || sender.sender_id.open_id || '';
  if (!userId) return null;

  return {
    id: userId,
    displayName: `User ${userId.slice(-6)}`, // Lark doesn't provide name in message event
  };
}

/**
 * Extract message content from Lark message
 */
function extractMessageContent(message: LarkMessageEvent['event']['message']): IUnifiedMessageContent {
  if (!message) {
    return { type: 'text', text: '' };
  }

  const messageType = message.message_type;
  let content: string;

  try {
    content = message.content ? JSON.parse(message.content) : {};
  } catch {
    content = message.content || '';
  }

  switch (messageType) {
    case 'text':
      return {
        type: 'text',
        text: typeof content === 'object' ? (content as any).text || '' : String(content),
      };

    case 'image':
      return {
        type: 'photo',
        text: '',
        attachments: [
          {
            type: 'photo',
            fileId: typeof content === 'object' ? (content as any).image_key || '' : '',
          },
        ],
      };

    case 'file':
      return {
        type: 'document',
        text: '',
        attachments: [
          {
            type: 'document',
            fileId: typeof content === 'object' ? (content as any).file_key || '' : '',
            fileName: typeof content === 'object' ? (content as any).file_name || '' : '',
          },
        ],
      };

    case 'audio':
      return {
        type: 'audio',
        text: '',
        attachments: [
          {
            type: 'audio',
            fileId: typeof content === 'object' ? (content as any).file_key || '' : '',
            duration: typeof content === 'object' ? (content as any).duration || 0 : 0,
          },
        ],
      };

    default:
      return {
        type: 'text',
        text: typeof content === 'object' ? JSON.stringify(content) : String(content),
      };
  }
}

// ==================== Card Action Handling ====================

/**
 * Map action prefix to valid ActionCategory
 * Actions are named like 'category.action' (e.g., 'agent.select', 'session.new')
 * But valid categories are only: 'platform', 'system', 'chat'
 */
function mapToActionCategory(prefix: string): 'platform' | 'system' | 'chat' {
  // Platform-specific actions
  if (prefix === 'pairing') return 'platform';
  // Chat-related actions
  if (prefix === 'chat') return 'chat';
  // Everything else is system actions (session, help, settings, agent, error, confirm, etc.)
  return 'system';
}

/**
 * Extract action info from Lark card action
 */
export function extractCardAction(action: LarkCardActionEvent['event']['action']): IMessageAction | null {
  if (!action?.value) {
    return null;
  }

  const value = action.value as Record<string, string>;
  const actionName = value.action || '';

  if (!actionName) {
    return null;
  }

  // Parse action name and params
  // Format: "category.action" or "category.action:param1=value1"
  const [fullAction, paramsStr] = actionName.split(':');
  const [prefix, name] = fullAction.includes('.') ? fullAction.split('.') : ['system', fullAction];

  const params: Record<string, string> = {};
  if (paramsStr) {
    paramsStr.split(',').forEach((param) => {
      const [key, val] = param.split('=');
      if (key && val) {
        params[key] = val;
      }
    });
  }

  // Merge with other action values
  Object.entries(value).forEach(([key, val]) => {
    if (key !== 'action' && typeof val === 'string') {
      params[key] = val;
    }
  });

  // Map prefix to valid category, keep the full action name
  return {
    type: mapToActionCategory(prefix),
    name: `${prefix}.${name}`, // Keep original action name like 'agent.select'
    params,
  };
}

// ==================== Outgoing Message Conversion ====================

/**
 * Lark message content types
 */
export type LarkContentType = 'text' | 'interactive' | 'image' | 'file';

/**
 * Convert unified outgoing message to Lark send parameters
 * Note: For text messages, returns raw text (not JSON stringified)
 * The caller is responsible for formatting as needed
 */
export function toLarkSendParams(message: IUnifiedOutgoingMessage): {
  contentType: LarkContentType;
  content: string | Record<string, unknown>;
  rawText?: string; // Original text for text messages
} {
  // If message has replyMarkup (card), send as interactive
  if (message.replyMarkup) {
    return {
      contentType: 'interactive',
      content: message.replyMarkup as Record<string, unknown>,
    };
  }

  // If message has buttons, convert to interactive card
  if (message.buttons && message.buttons.length > 0) {
    const card = buildInteractiveCard(message.text || '', message.buttons);
    return {
      contentType: 'interactive',
      content: card,
    };
  }

  // Default to text message - return raw text, caller will format
  const text = message.text || '';
  return {
    contentType: 'text',
    content: { text }, // Return object, not JSON string
    rawText: text,
  };
}

/**
 * Build an interactive card with buttons
 */
function buildInteractiveCard(text: string, buttons: IUnifiedOutgoingMessage['buttons']): Record<string, unknown> {
  const elements: Array<Record<string, unknown>> = [];

  // Add text content
  if (text) {
    elements.push({
      tag: 'markdown',
      content: convertHtmlToLarkMarkdown(text),
    });
  }

  // Add button actions
  if (buttons && buttons.length > 0) {
    const actions: Array<Record<string, unknown>> = [];

    buttons.forEach((row) => {
      row.forEach((button) => {
        actions.push({
          tag: 'button',
          text: {
            tag: 'plain_text',
            content: button.label,
          },
          type: 'primary',
          value: {
            action: button.action,
            ...button.params,
          },
        });
      });
    });

    elements.push({
      tag: 'action',
      actions,
    });
  }

  return {
    config: {
      wide_screen_mode: true,
    },
    elements,
  };
}

// ==================== Text Formatting ====================

/**
 * Convert HTML to Lark markdown format
 * Lark supports a subset of markdown
 *
 * Security measures:
 * - Decodes only safe HTML entities (quotes and numeric)
 * - Does NOT decode `<`, `>`, `&` so tags cannot be reintroduced via entities
 * - Uses protocol whitelist for links (not blacklist)
 * - Case-insensitive matching for tags and protocols
 */
export function convertHtmlToLarkMarkdown(html: string): string {
  let result = html;

  // 1. Decode a SAFE subset of HTML entities.
  //    We intentionally do NOT decode &lt; &gt; &amp; so that HTML tags
  //    cannot be smuggled in via entities (and to avoid double-unescaping issues).

  result = result
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));

  // 2. Convert allowed HTML tags to markdown (case-insensitive)
  result = result.replace(/<b>(.+?)<\/b>/gi, '**$1**');
  result = result.replace(/<strong>(.+?)<\/strong>/gi, '**$1**');
  result = result.replace(/<i>(.+?)<\/i>/gi, '*$1*');
  result = result.replace(/<em>(.+?)<\/em>/gi, '*$1*');
  result = result.replace(/<code>(.+?)<\/code>/gi, '`$1`');
  result = result.replace(/<pre><code>([\s\S]+?)<\/code><\/pre>/gi, '```\n$1\n```');

  // 3. Convert links - use protocol whitelist (not blacklist) for security
  result = result.replace(/<a href="([^"]+)">(.+?)<\/a>/gi, (_, url: string, text: string) => {
    const normalizedUrl = url.trim().toLowerCase();
    // Only allow safe protocols: http, https, mailto, relative paths, or no protocol
    const isSafeUrl = /^(https?:\/\/|mailto:|\/)|^[^:]*$/.test(normalizedUrl);
    if (isSafeUrl) {
      return `[${text}](${url})`;
    }
    return text; // Dangerous protocol: keep text only
  });

  // 4. Remove ALL remaining HTML tags (loop until stable to handle nested patterns like <scr<script>ipt>)
  let prevResult = '';
  while (prevResult !== result) {
    prevResult = result;
    result = result.replace(/<[^>]+>/g, '');
  }

  return result;
}

/**
 * Escape special characters for Lark markdown
 */
export function escapeLarkMarkdown(text: string): string {
  return text.replace(/[\\*_`[\]()~]/g, '\\$&');
}

// ==================== Message Length Utilities ====================

/**
 * Split long text into chunks that fit Lark's message limit
 */
export function splitMessage(text: string, maxLength: number = LARK_MESSAGE_LIMIT): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Find a good split point (prefer newline, then space)
    let splitIndex = maxLength;

    // Look for newline within the last 20% of the chunk
    const newlineSearchStart = Math.floor(maxLength * 0.8);
    const lastNewline = remaining.lastIndexOf('\n', maxLength);
    if (lastNewline > newlineSearchStart) {
      splitIndex = lastNewline + 1;
    } else {
      // Look for space
      const lastSpace = remaining.lastIndexOf(' ', maxLength);
      if (lastSpace > newlineSearchStart) {
        splitIndex = lastSpace + 1;
      }
    }

    chunks.push(remaining.slice(0, splitIndex).trim());
    remaining = remaining.slice(splitIndex).trim();
  }

  return chunks;
}

// ==================== Callback Data Utilities ====================

/**
 * Build card action value object
 */
export function buildCardActionValue(action: string, params?: Record<string, string>): Record<string, string> {
  return {
    action,
    ...params,
  };
}
