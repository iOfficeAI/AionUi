/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDatabase } from '@process/services/database';
import type { IConversationRepository, PaginatedResult } from './IConversationRepository';
import type { TChatConversation } from '@/common/config/storage';
import type { TMessage } from '@/common/chat/chatLib';
import type { IMessageSearchResponse } from '@/common/types/database';

/**
 * SQLite-backed implementation of IConversationRepository.
 * Delegates to the AionUIDatabase singleton via getDatabase().
 * Methods are async because getDatabase() returns a Promise.
 */
export class SqliteConversationRepository implements IConversationRepository {
  private getDb() {
    return getDatabase();
  }

  async getConversation(id: string): Promise<TChatConversation | undefined> {
    const db = await this.getDb();
    const result = db.getConversation(id);
    return result.success ? (result.data ?? undefined) : undefined;
  }

  async createConversation(conversation: TChatConversation): Promise<void> {
    const db = await this.getDb();
    db.createConversation(conversation);
  }

  async updateConversation(id: string, updates: Partial<TChatConversation>): Promise<void> {
    const db = await this.getDb();
    db.updateConversation(id, updates);
  }

  async deleteConversation(id: string): Promise<void> {
    const db = await this.getDb();
    db.deleteConversation(id);
  }

  async getMessages(
    id: string,
    page: number,
    pageSize: number,
    order?: 'ASC' | 'DESC'
  ): Promise<PaginatedResult<TMessage>> {
    const db = await this.getDb();
    const result = db.getConversationMessages(id, page, pageSize, order);
    return {
      data: result.data ?? [],
      total: result.total ?? 0,
      hasMore: result.hasMore ?? false,
    };
  }

  async insertMessage(message: TMessage): Promise<void> {
    const db = await this.getDb();
    db.insertMessage(message);
  }

  /**
   * The underlying DB getUserConversations accepts (userId?, page, pageSize).
   * The interface accepts (cursor?, offset?, limit?) for forward compatibility.
   * We map offset/limit → page/pageSize, ignoring cursor (not supported by SQLite impl).
   */
  async getUserConversations(
    _cursor?: string,
    offset?: number,
    limit?: number
  ): Promise<PaginatedResult<TChatConversation>> {
    const db = await this.getDb();
    const pageSize = limit ?? 50;
    const page = offset !== undefined && pageSize > 0 ? Math.floor(offset / pageSize) : 0;
    const result = db.getUserConversations(undefined, page, pageSize);
    return {
      data: result.data ?? [],
      total: result.total ?? 0,
      hasMore: result.hasMore ?? false,
    };
  }

  async listAllConversations(): Promise<TChatConversation[]> {
    const db = await this.getDb();
    const result = db.getUserConversations(undefined, 0, 10000);
    return result.data ?? [];
  }

  async searchMessages(keyword: string, page: number, pageSize: number): Promise<IMessageSearchResponse> {
    const db = await this.getDb();
    return db.searchConversationMessages(keyword, undefined, page, pageSize);
  }
}
