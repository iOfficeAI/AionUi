/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { MessageCursorPage } from '@/common/adapter/ipcBridge';
import type { TMessage } from '@/common/chat/chatLib';

export type MessageContentMode = 'compact' | 'full';

export type LoadConversationMessagePageOptions = {
  limit?: number;
  before?: string;
  after?: string;
  anchorMessageId?: string;
  contentMode?: MessageContentMode;
};

export const DEFAULT_MESSAGE_PAGE_LIMIT = 50;
export const MAX_MESSAGE_PAGE_LIMIT = 200;

export async function loadConversationMessagePage(
  conversationId: string,
  options: LoadConversationMessagePageOptions = {}
): Promise<MessageCursorPage<TMessage>> {
  return ipcBridge.database.getConversationMessages.invoke({
    conversation_id: conversationId,
    limit: options.limit ?? DEFAULT_MESSAGE_PAGE_LIMIT,
    ...(options.before ? { before: options.before } : {}),
    ...(options.after ? { after: options.after } : {}),
    ...(options.anchorMessageId ? { anchor_message_id: options.anchorMessageId } : {}),
    content_mode: options.contentMode ?? 'compact',
  });
}

export function loadLatestConversationMessages(
  conversationId: string,
  options: Pick<LoadConversationMessagePageOptions, 'limit' | 'contentMode'> = {}
): Promise<MessageCursorPage<TMessage>> {
  return loadConversationMessagePage(conversationId, options);
}

export function loadConversationAnchorWindow(
  conversationId: string,
  messageId: string,
  options: Pick<LoadConversationMessagePageOptions, 'limit' | 'contentMode'> = {}
): Promise<MessageCursorPage<TMessage>> {
  return loadConversationMessagePage(conversationId, {
    ...options,
    anchorMessageId: messageId,
  });
}

export async function loadAllConversationMessagesPaged(
  conversationId: string,
  options: Pick<LoadConversationMessagePageOptions, 'limit' | 'contentMode'> = {}
): Promise<TMessage[]> {
  const limit = options.limit ?? MAX_MESSAGE_PAGE_LIMIT;
  const contentMode = options.contentMode ?? 'full';
  const latest = await loadConversationMessagePage(conversationId, { limit, contentMode });
  const pages: TMessage[][] = [latest.items];
  let before = latest.oldest_cursor ?? undefined;
  let hasMoreBefore = latest.has_more_before;

  while (hasMoreBefore && before) {
    const page = await loadConversationMessagePage(conversationId, {
      limit,
      before,
      contentMode,
    });
    pages.unshift(page.items);
    before = page.oldest_cursor ?? undefined;
    hasMoreBefore = page.has_more_before;
  }

  return pages.flat();
}
