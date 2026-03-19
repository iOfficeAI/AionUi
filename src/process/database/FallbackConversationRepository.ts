/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IConversationRepository, PaginatedResult } from './IConversationRepository';
import type { TChatConversation } from '@/common/storage';
import type { TMessage } from '@/common/chatLib';

/**
 * Decorator that delegates all IConversationRepository methods to an inner repository.
 * The ProcessChat file-storage fallback is handled via lazy migration in databaseBridge,
 * not here — keeping this class purely synchronous and testable.
 */
export class FallbackConversationRepository implements IConversationRepository {
  constructor(private readonly db: IConversationRepository) {}

  getConversation(id: string): TChatConversation | undefined {
    return this.db.getConversation(id);
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
    return this.db.getMessages(id, page, pageSize);
  }

  insertMessage(message: TMessage): void {
    this.db.insertMessage(message);
  }

  getUserConversations(cursor?: string, offset?: number, limit?: number): PaginatedResult<TChatConversation> {
    return this.db.getUserConversations(cursor, offset, limit);
  }

  listAllConversations(): TChatConversation[] {
    return this.db.listAllConversations();
  }
}
