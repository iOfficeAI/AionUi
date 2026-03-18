/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDatabase } from '@process/database';
import type { IConversationRepository, PaginatedResult } from './IConversationRepository';
import type { TChatConversation } from '@/common/storage';
import type { TMessage } from '@/common/chatLib';

/**
 * SQLite-backed implementation of IConversationRepository.
 * Delegates to the AionUIDatabase singleton via getDatabase().
 * All methods are synchronous (better-sqlite3 driver).
 */
export class SqliteConversationRepository implements IConversationRepository {
  private get db() {
    return getDatabase();
  }

  getConversation(id: string): TChatConversation | undefined {
    const result = this.db.getConversation(id);
    return result.success ? (result.data ?? undefined) : undefined;
  }

  createConversation(conversation: TChatConversation): void {
    this.db.createConversation(conversation);
  }

  updateConversation(id: string, updates: Partial<TChatConversation>): void {
    this.db.updateConversation(id, updates);
  }

  deleteConversation(id: string): void {
    this.db.deleteConversation(id);
  }

  getMessages(id: string, page: number, pageSize: number): PaginatedResult<TMessage> {
    const result = this.db.getConversationMessages(id, page, pageSize);
    return {
      data: result.data ?? [],
      total: result.total ?? 0,
      hasMore: result.hasMore ?? false,
    };
  }

  insertMessage(message: TMessage): void {
    this.db.insertMessage(message);
  }

  /**
   * The underlying DB getUserConversations accepts (userId?, page, pageSize).
   * The interface accepts (cursor?, offset?, limit?) for forward compatibility.
   * We map offset/limit → page/pageSize, ignoring cursor (not supported by SQLite impl).
   */
  getUserConversations(_cursor?: string, offset?: number, limit?: number): PaginatedResult<TChatConversation> {
    const pageSize = limit ?? 50;
    const page = offset !== undefined && pageSize > 0 ? Math.floor(offset / pageSize) : 0;
    const result = this.db.getUserConversations(undefined, page, pageSize);
    return {
      data: result.data ?? [],
      total: result.total ?? 0,
      hasMore: result.hasMore ?? false,
    };
  }
}
