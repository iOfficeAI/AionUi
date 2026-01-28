/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Context } from 'grammy';
import type { Message, PhotoSize, User as TelegramUser } from 'grammy/types';
import type { IUnifiedIncomingMessage, IUnifiedMessageContent, IUnifiedOutgoingMessage, IUnifiedUser } from '../../types';

/**
 * TelegramAdapter - Converts between Telegram and Unified message formats
 *
 * Handles:
 * - Telegram Message → UnifiedIncomingMessage
 * - UnifiedOutgoingMessage → Telegram sendMessage parameters
 * - User info extraction
 * - Attachment handling
 */

// ==================== Incoming Message Conversion ====================

/**
 * Convert Telegram context to unified incoming message
 * Supports both regular messages and callback queries
 */
export function toUnifiedIncomingMessage(ctx: Context): IUnifiedIncomingMessage | null {
  // Handle callback query (button press)
  if (ctx.callbackQuery) {
    const callbackQuery = ctx.callbackQuery;
    const user = toUnifiedUser(callbackQuery.from);
    if (!user) return null;

    // Get chat ID from the original message or from the callback query
    const chatId = callbackQuery.message?.chat?.id?.toString() || callbackQuery.from.id.toString();

    return {
      id: callbackQuery.id,
      platform: 'telegram',
      chatId,
      user,
      content: {
        type: 'action',
        text: callbackQuery.data || '',
      },
      timestamp: Date.now(),
      raw: callbackQuery,
    };
  }

  // Handle regular message
  const message = ctx.message;
  if (!message) return null;

  const user = toUnifiedUser(message.from);
  if (!user) return null;

  const content = extractMessageContent(message);

  return {
    id: message.message_id.toString(),
    platform: 'telegram',
    chatId: message.chat.id.toString(),
    user,
    content,
    timestamp: message.date * 1000, // Convert to milliseconds
    replyToMessageId: message.reply_to_message?.message_id.toString(),
    raw: message,
  };
}

/**
 * Convert Telegram user to unified user format
 */
export function toUnifiedUser(telegramUser: TelegramUser | undefined): IUnifiedUser | null {
  if (!telegramUser) return null;

  const displayName = [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ') || telegramUser.username || `User ${telegramUser.id}`;

  return {
    id: telegramUser.id.toString(),
    username: telegramUser.username,
    displayName,
    avatarUrl: undefined, // Telegram doesn't provide avatar URL directly
  };
}

/**
 * Extract message content from Telegram message
 */
function extractMessageContent(message: Message): IUnifiedMessageContent {
  // Check for different content types
  if (message.text) {
    return {
      type: 'text',
      text: message.text,
    };
  }

  if (message.photo) {
    // Get the largest photo size
    const photo = getLargestPhoto(message.photo);
    return {
      type: 'photo',
      text: message.caption || '',
      attachments: [
        {
          type: 'photo',
          fileId: photo.file_id,
          mimeType: 'image/jpeg', // Telegram photos are always JPEG
          size: photo.file_size,
        },
      ],
    };
  }

  if (message.document) {
    return {
      type: 'document',
      text: message.caption || '',
      attachments: [
        {
          type: 'document',
          fileId: message.document.file_id,
          fileName: message.document.file_name,
          mimeType: message.document.mime_type,
          size: message.document.file_size,
        },
      ],
    };
  }

  if (message.voice) {
    return {
      type: 'voice',
      text: '',
      attachments: [
        {
          type: 'voice',
          fileId: message.voice.file_id,
          mimeType: message.voice.mime_type || 'audio/ogg',
          size: message.voice.file_size,
          duration: message.voice.duration,
        },
      ],
    };
  }

  if (message.audio) {
    return {
      type: 'audio',
      text: message.caption || '',
      attachments: [
        {
          type: 'audio',
          fileId: message.audio.file_id,
          fileName: message.audio.file_name,
          mimeType: message.audio.mime_type,
          size: message.audio.file_size,
          duration: message.audio.duration,
        },
      ],
    };
  }

  if (message.video) {
    return {
      type: 'video',
      text: message.caption || '',
      attachments: [
        {
          type: 'video',
          fileId: message.video.file_id,
          fileName: message.video.file_name,
          mimeType: message.video.mime_type,
          size: message.video.file_size,
          duration: message.video.duration,
        },
      ],
    };
  }

  if (message.sticker) {
    return {
      type: 'sticker',
      text: message.sticker.emoji || '',
      attachments: [
        {
          type: 'sticker',
          fileId: message.sticker.file_id,
          mimeType: message.sticker.is_animated ? 'application/x-tgsticker' : 'image/webp',
        },
      ],
    };
  }

  // Default to text type for unsupported content
  return {
    type: 'text',
    text: '',
  };
}

/**
 * Get the largest photo from photo sizes array
 */
function getLargestPhoto(photos: PhotoSize[]): PhotoSize {
  return photos.reduce((largest, current) => {
    const largestSize = (largest.width || 0) * (largest.height || 0);
    const currentSize = (current.width || 0) * (current.height || 0);
    return currentSize > largestSize ? current : largest;
  }, photos[0]);
}

// ==================== Outgoing Message Conversion ====================

/**
 * Options for sending messages via Telegram
 */
export interface TelegramSendOptions {
  parse_mode?: 'HTML' | 'MarkdownV2' | 'Markdown';
  reply_markup?: any;
  reply_to_message_id?: number;
  disable_notification?: boolean;
  disable_web_page_preview?: boolean;
}

/**
 * Convert unified outgoing message to Telegram send parameters
 */
export function toTelegramSendParams(message: IUnifiedOutgoingMessage): {
  text: string;
  options: TelegramSendOptions;
} {
  const options: TelegramSendOptions = {
    parse_mode: message.parseMode || 'HTML',
    disable_notification: message.silent,
  };

  if (message.replyMarkup) {
    options.reply_markup = message.replyMarkup;
  }

  if (message.replyToMessageId) {
    options.reply_to_message_id = parseInt(message.replyToMessageId, 10);
  }

  return {
    text: message.text || '',
    options,
  };
}

// ==================== Text Formatting ====================

/**
 * Escape special characters for Telegram HTML format
 */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Escape special characters for Telegram MarkdownV2 format
 */
export function escapeMarkdownV2(text: string): string {
  // eslint-disable-next-line no-useless-escape
  return text.replace(/[_*\[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

/**
 * Convert Markdown to Telegram HTML
 * Basic conversion for common patterns
 */
export function markdownToTelegramHtml(text: string): string {
  let result = escapeHtml(text);

  // Bold: **text** or __text__
  result = result.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  result = result.replace(/__(.+?)__/g, '<b>$1</b>');

  // Italic: *text* or _text_
  result = result.replace(/\*(.+?)\*/g, '<i>$1</i>');
  result = result.replace(/_(.+?)_/g, '<i>$1</i>');

  // Code: `code`
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Code block: ```code```
  result = result.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

  // Links: [text](url)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  return result;
}

// ==================== Message Length Utilities ====================

/**
 * Telegram message length limit
 */
export const TELEGRAM_MESSAGE_LIMIT = 4096;

/**
 * Split long text into chunks that fit Telegram's message limit
 */
export function splitMessage(text: string, maxLength: number = TELEGRAM_MESSAGE_LIMIT): string[] {
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

// ==================== Callback Query Utilities ====================

/**
 * Parse callback query data
 */
export function parseCallbackData(data: string): { action: string; params: string[] } {
  const parts = data.split(':');
  return {
    action: parts[0],
    params: parts.slice(1),
  };
}

/**
 * Build callback data string
 */
export function buildCallbackData(action: string, ...params: string[]): string {
  return [action, ...params].join(':');
}
