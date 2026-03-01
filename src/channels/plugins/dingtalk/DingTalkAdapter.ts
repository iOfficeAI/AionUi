/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageAction, IUnifiedIncomingMessage, IUnifiedMessageContent, IUnifiedOutgoingMessage, IUnifiedUser } from '../../types';

/**
 * DingTalkAdapter - Converts between DingTalk and Unified message formats
 *
 * Handles:
 * - DingTalk Stream callback data -> UnifiedIncomingMessage
 * - UnifiedOutgoingMessage -> DingTalk send parameters
 * - User info extraction
 * - Card action handling
 */

// ==================== Constants ====================

/**
 * DingTalk message length limit (for markdown messages)
 */
export const DINGTALK_MESSAGE_LIMIT = 4000;

// ==================== Types ====================

/**
 * DingTalk Stream callback message data
 */
export interface DingTalkStreamMessage {
  conversationId?: string;
  atUsers?: Array<{
    dingtalkId?: string;
    staffId?: string;
  }>;
  chatbotCorpId?: string;
  chatbotUserId?: string;
  msgId?: string;
  senderNick?: string;
  isAdmin?: boolean;
  senderStaffId?: string;
  sessionWebhookExpiredTime?: number;
  createAt?: number;
  senderCorpId?: string;
  conversationType?: string; // '1' = private, '2' = group
  msgtype?: string;
  text?: {
    content?: string;
  };
  richText?: {
    richTextList?: Array<{
      text?: string;
      type?: string;
    }>;
  };
  picture?: {
    downloadCode?: string;
    photoURL?: string;
  };
  audio?: {
    downloadCode?: string;
    duration?: string;
    recognition?: string;
  };
  video?: {
    downloadCode?: string;
    duration?: string;
    videoType?: string;
  };
  file?: {
    downloadCode?: string;
    fileName?: string;
    fileSize?: string;
  };
  sessionWebhook?: string;
  robotCode?: string;
}

/**
 * DingTalk card action callback data
 */
export interface DingTalkCardActionData {
  outTrackId?: string;
  userId?: string;
  content?: {
    cardPrivateData?: {
      actionIds?: string[];
      params?: Record<string, string>;
    };
  };
}

// ==================== Incoming Message Conversion ====================

/**
 * Encode chatId based on conversation type
 * Private chat: user:{senderStaffId}
 * Group chat: group:{conversationId}
 */
export function encodeChatId(data: DingTalkStreamMessage): string {
  if (data.conversationType === '1') {
    // Private chat
    return `user:${data.senderStaffId || data.chatbotUserId || ''}`;
  }
  // Group chat
  return `group:${data.conversationId || ''}`;
}

/**
 * Parse encoded chatId into type and id
 */
export function parseChatId(chatId: string): { type: 'user' | 'group'; id: string } {
  if (chatId.startsWith('user:')) {
    return { type: 'user', id: chatId.slice(5) };
  }
  if (chatId.startsWith('group:')) {
    return { type: 'group', id: chatId.slice(6) };
  }
  // Default to user
  return { type: 'user', id: chatId };
}

/**
 * Convert DingTalk Stream callback data to unified incoming message
 */
export function toUnifiedIncomingMessage(data: DingTalkStreamMessage, actionInfo?: IMessageAction): IUnifiedIncomingMessage | null {
  // Handle card action
  if (actionInfo) {
    const userId = data.senderStaffId || '';
    const chatId = encodeChatId(data);

    return {
      id: data.msgId || Date.now().toString(),
      platform: 'dingtalk',
      chatId,
      user: {
        id: userId,
        displayName: data.senderNick || `User ${userId.slice(-6)}`,
      },
      content: {
        type: 'action',
        text: actionInfo.name,
      },
      action: actionInfo,
      timestamp: data.createAt || Date.now(),
      raw: data,
    };
  }

  // Handle regular message
  if (!data.senderStaffId && !data.chatbotUserId) return null;

  const user = toUnifiedUser(data);
  if (!user) return null;

  const content = extractMessageContent(data);
  const chatId = encodeChatId(data);

  return {
    id: data.msgId || Date.now().toString(),
    platform: 'dingtalk',
    chatId,
    user,
    content,
    timestamp: data.createAt || Date.now(),
    raw: data,
  };
}

/**
 * Convert DingTalk sender info to unified user format
 */
export function toUnifiedUser(data: DingTalkStreamMessage): IUnifiedUser | null {
  const userId = data.senderStaffId || '';
  if (!userId) return null;

  return {
    id: userId,
    displayName: data.senderNick || `User ${userId.slice(-6)}`,
  };
}

/**
 * Extract message content from DingTalk message
 */
function extractMessageContent(data: DingTalkStreamMessage): IUnifiedMessageContent {
  const msgtype = data.msgtype;

  switch (msgtype) {
    case 'text': {
      let text = data.text?.content || '';
      // Remove @bot mentions in group chats
      if (data.conversationType === '2') {
        text = text.replace(/@\S+\s*/g, '').trim();
      }
      return { type: 'text', text };
    }

    case 'richText': {
      const textParts = (data.richText?.richTextList || []).filter((item) => item.type === 'text').map((item) => item.text || '');
      let text = textParts.join('');
      if (data.conversationType === '2') {
        text = text.replace(/@\S+\s*/g, '').trim();
      }
      return { type: 'text', text };
    }

    case 'picture':
      return {
        type: 'photo',
        text: '',
        attachments: [
          {
            type: 'photo',
            fileId: data.picture?.downloadCode || '',
          },
        ],
      };

    case 'audio':
      return {
        type: 'audio',
        text: data.audio?.recognition || '',
        attachments: [
          {
            type: 'audio',
            fileId: data.audio?.downloadCode || '',
            duration: data.audio?.duration ? parseInt(data.audio.duration, 10) : undefined,
          },
        ],
      };

    case 'video':
      return {
        type: 'video',
        text: '',
        attachments: [
          {
            type: 'video',
            fileId: data.video?.downloadCode || '',
            duration: data.video?.duration ? parseInt(data.video.duration, 10) : undefined,
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
            fileId: data.file?.downloadCode || '',
            fileName: data.file?.fileName,
            size: data.file?.fileSize ? parseInt(data.file.fileSize, 10) : undefined,
          },
        ],
      };

    default:
      return { type: 'text', text: '' };
  }
}

// ==================== Outgoing Message Conversion ====================

/**
 * DingTalk send content types
 */
export type DingTalkContentType = 'text' | 'markdown' | 'actionCard';

/**
 * Convert unified outgoing message to DingTalk send parameters
 */
export function toDingTalkSendParams(message: IUnifiedOutgoingMessage): {
  contentType: DingTalkContentType;
  content: Record<string, unknown>;
  rawText?: string;
} {
  // If message has replyMarkup (card), send as actionCard
  if (message.replyMarkup) {
    return {
      contentType: 'actionCard',
      content: message.replyMarkup as Record<string, unknown>,
    };
  }

  // If message has buttons, convert to actionCard
  if (message.buttons && message.buttons.length > 0) {
    const card = buildActionCard(message.text || '', message.buttons);
    return {
      contentType: 'actionCard',
      content: card,
    };
  }

  // Default to markdown message
  const text = message.text || '';
  return {
    contentType: 'markdown',
    content: {
      title: 'Message',
      text,
    },
    rawText: text,
  };
}

/**
 * Build an action card with buttons
 */
function buildActionCard(text: string, buttons: IUnifiedOutgoingMessage['buttons']): Record<string, unknown> {
  const markdownText = convertHtmlToDingTalkMarkdown(text);
  const btnList: Array<Record<string, unknown>> = [];

  if (buttons && buttons.length > 0) {
    buttons.forEach((row) => {
      row.forEach((button) => {
        btnList.push({
          title: button.label,
          actionURL: `dingtalk://dingtalkclient/action/openAppAction?action=${encodeURIComponent(button.action)}&params=${encodeURIComponent(JSON.stringify(button.params || {}))}`,
        });
      });
    });
  }

  return {
    title: 'Message',
    text: markdownText,
    btnOrientation: '1', // Horizontal layout
    btns: btnList,
  };
}

// ==================== Text Formatting ====================

/**
 * Convert HTML to DingTalk markdown format
 * DingTalk supports a subset of markdown
 *
 * Security measures:
 * - Decodes only safe HTML entities
 * - Does NOT decode `<`, `>`, `&` to prevent tag injection
 * - Uses protocol whitelist for links
 * - Case-insensitive matching
 */
export function convertHtmlToDingTalkMarkdown(html: string): string {
  let result = html;

  // 1. Decode safe HTML entities
  result = result
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));

  // 2. Convert HTML tags to markdown (case-insensitive)
  result = result.replace(/<b>(.+?)<\/b>/gi, '**$1**');
  result = result.replace(/<strong>(.+?)<\/strong>/gi, '**$1**');
  result = result.replace(/<i>(.+?)<\/i>/gi, '*$1*');
  result = result.replace(/<em>(.+?)<\/em>/gi, '*$1*');
  result = result.replace(/<code>(.+?)<\/code>/gi, '`$1`');
  result = result.replace(/<pre><code>([\s\S]+?)<\/code><\/pre>/gi, '```\n$1\n```');

  // 3. Convert links with protocol whitelist
  result = result.replace(/<a href="([^"]+)">(.+?)<\/a>/gi, (_, url: string, text: string) => {
    const normalizedUrl = url.trim().toLowerCase();
    const isSafeUrl = /^(https?:\/\/|mailto:|\/)|^[^:]*$/.test(normalizedUrl);
    if (isSafeUrl) {
      return `[${text}](${url})`;
    }
    return text;
  });

  // 4. Remove all remaining HTML tags (loop until stable)
  let prevResult = '';
  while (prevResult !== result) {
    prevResult = result;
    result = result.replace(/<[^>]+>/g, '');
  }

  return result;
}

/**
 * Escape special characters for DingTalk markdown
 */
export function escapeDingTalkMarkdown(text: string): string {
  return text.replace(/[\\*_`[\]()~]/g, '\\$&');
}

// ==================== Message Length Utilities ====================

/**
 * Split long text into chunks that fit DingTalk's message limit
 */
export function splitMessage(text: string, maxLength: number = DINGTALK_MESSAGE_LIMIT): string[] {
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

    const newlineSearchStart = Math.floor(maxLength * 0.8);
    const lastNewline = remaining.lastIndexOf('\n', maxLength);
    if (lastNewline > newlineSearchStart) {
      splitIndex = lastNewline + 1;
    } else {
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

// ==================== Card Action Utilities ====================

/**
 * Build card action value object
 */
export function buildCardActionValue(action: string, params?: Record<string, string>): Record<string, string> {
  return {
    action,
    ...params,
  };
}

/**
 * Map action prefix to valid ActionCategory
 */
function mapToActionCategory(prefix: string): 'platform' | 'system' | 'chat' {
  if (prefix === 'pairing') return 'platform';
  if (prefix === 'chat') return 'chat';
  return 'system';
}

/**
 * Extract action info from DingTalk card callback
 */
export function extractCardAction(params: Record<string, string>): IMessageAction | null {
  const actionName = params.action || '';
  if (!actionName) return null;

  // Parse action name and params
  // Format: "category.action" or "category.action:param1=value1"
  const [fullAction, paramsStr] = actionName.split(':');
  const [prefix, name] = fullAction.includes('.') ? fullAction.split('.') : ['system', fullAction];

  const actionParams: Record<string, string> = {};
  if (paramsStr) {
    paramsStr.split(',').forEach((param) => {
      const [key, val] = param.split('=');
      if (key && val) {
        actionParams[key] = val;
      }
    });
  }

  // Merge with other action values
  Object.entries(params).forEach(([key, val]) => {
    if (key !== 'action' && typeof val === 'string') {
      actionParams[key] = val;
    }
  });

  return {
    type: mapToActionCategory(prefix),
    name: `${prefix}.${name}`,
    params: actionParams,
  };
}
