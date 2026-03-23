/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ChatRequest, ChatResponse } from 'weixin-agent-sdk';
import type { AttachmentType, IUnifiedIncomingMessage, IUnifiedOutgoingMessage, MessageContentType } from '../../types';

// ==================== Inbound ====================

/**
 * Convert SDK ChatRequest to unified incoming message format
 */
export function toUnifiedIncomingMessage(request: ChatRequest): IUnifiedIncomingMessage {
  const { conversationId, text, media } = request;

  const contentType = mediaTypeToContentType(media?.type);
  const attachments = media
    ? [
        {
          type: mediaTypeToAttachmentType(media.type),
          fileId: media.filePath,
          mimeType: media.mimeType,
          fileName: media.fileName,
        },
      ]
    : undefined;

  return {
    id: conversationId,
    platform: 'weixin',
    chatId: conversationId,
    user: {
      id: conversationId,
      displayName: conversationId.slice(-6),
    },
    content: {
      type: contentType,
      text: text || '',
      attachments,
    },
    timestamp: Date.now(),
  };
}

function mediaTypeToContentType(type?: string): MessageContentType {
  switch (type) {
    case 'image':
      return 'photo';
    case 'audio':
      return 'audio';
    case 'video':
      return 'video';
    case 'file':
      return 'document';
    default:
      return 'text';
  }
}

function mediaTypeToAttachmentType(type: string): AttachmentType {
  switch (type) {
    case 'image':
      return 'photo';
    case 'audio':
      return 'audio';
    case 'video':
      return 'video';
    default:
      return 'document';
  }
}

// ==================== Outbound ====================

/**
 * Convert unified outgoing message to SDK ChatResponse format.
 * Buttons and replyMarkup are ignored (iLink Bot does not support interactive cards).
 */
export function toChatResponse(message: IUnifiedOutgoingMessage): ChatResponse {
  const response: ChatResponse = {};

  if (message.text) {
    response.text = message.text;
  }

  if (message.type === 'image' && message.imageUrl) {
    response.media = { type: 'image', url: message.imageUrl };
  } else if (message.type === 'file' && message.fileUrl) {
    response.media = { type: 'file', url: message.fileUrl, fileName: message.fileName };
  }

  return response;
}
