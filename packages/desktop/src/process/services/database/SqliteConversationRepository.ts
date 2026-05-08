/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IConversationRepository, PaginatedResult } from './IConversationRepository';
import type { TChatConversation } from '@/common/config/storage';
import type { TMessage } from '@/common/chat/chatLib';
import type { IMessageSearchResponse } from '@/common/types/database';

/**
 * Backend-backed implementation of IConversationRepository.
 * Kept under the legacy filename to minimize import churn while the
 * Electron-side SQLite repository is being removed.
 */
export class SqliteConversationRepository implements IConversationRepository {
  async getConversation(id: string): Promise<TChatConversation | undefined> {
    return ipcBridge.conversation.get.invoke({ id });
  }

  async createConversation(conversation: TChatConversation): Promise<void> {
    await ipcBridge.conversation.createWithConversation.invoke({ conversation });
  }

  async updateConversation(id: string, updates: Partial<TChatConversation>): Promise<void> {
    await ipcBridge.conversation.update.invoke({ id, updates });
  }

  async deleteConversation(id: string): Promise<void> {
    await ipcBridge.conversation.remove.invoke({ id });
  }

  async getMessages(
    id: string,
    page: number,
    page_size: number,
    order?: 'ASC' | 'DESC'
  ): Promise<PaginatedResult<TMessage>> {
    const result = await ipcBridge.database.getConversationMessages.invoke({
      conversation_id: id,
      page: page + 1,
      page_size,
      order,
    });
    return {
      data: result.items ?? [],
      total: result.total ?? 0,
      has_more: result.has_more ?? false,
    };
  }

  async insertMessage(_message: TMessage): Promise<void> {
    throw new Error('insertMessage is no longer supported in Electron; backend owns message persistence');
  }

  /**
   * The underlying DB getUserConversations accepts (user_id?, page, page_size).
   * The interface accepts (cursor?, offset?, limit?) for forward compatibility.
   * We map offset/limit → page/page_size, ignoring cursor (not supported by SQLite impl).
   */
  async getUserConversations(
    cursor?: string,
    _offset?: number,
    limit?: number
  ): Promise<PaginatedResult<TChatConversation>> {
    const result = await ipcBridge.database.getUserConversations.invoke({ cursor, limit });
    return {
      data: result.items ?? [],
      total: result.total ?? 0,
      has_more: result.has_more ?? false,
    };
  }

  async listAllConversations(): Promise<TChatConversation[]> {
    const conversations: TChatConversation[] = [];
    let cursor: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const page = await ipcBridge.database.getUserConversations.invoke({ cursor, limit: 200 });
      conversations.push(...(page.items ?? []));
      hasMore = page.has_more;
      cursor = page.items.at(-1)?.id;
    }

    return conversations;
  }

  async searchMessages(keyword: string, page: number, page_size: number): Promise<IMessageSearchResponse> {
    const result = await ipcBridge.database.searchConversationMessages.invoke({
      keyword,
      page: page + 1,
      page_size,
    });
    return {
      items: result.items,
      total: result.total,
      page: page + 1,
      page_size,
      has_more: result.has_more,
    };
  }

  async getConversationsByCronJob(cron_job_id: string): Promise<TChatConversation[]> {
    return ipcBridge.conversation.listByCronJob.invoke({ cron_job_id });
  }
}
