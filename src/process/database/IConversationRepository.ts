/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// src/process/database/IConversationRepository.ts
// All methods are synchronous (better-sqlite3 driver).
// The service layer is async to allow future migration.

import type { TChatConversation } from '@/common/storage';
import type { TMessage } from '@/common/chatLib';

export type PaginatedResult<T> = {
  data: T[];
  total: number;
  hasMore: boolean;
};

export interface IConversationRepository {
  getConversation(id: string): TChatConversation | undefined;
  createConversation(conversation: TChatConversation): void;
  updateConversation(id: string, updates: Partial<TChatConversation>): void;
  deleteConversation(id: string): void;
  getMessages(id: string, page: number, pageSize: number): PaginatedResult<TMessage>;
  insertMessage(message: TMessage): void;
  /**
   * If cursor is provided, offset is ignored.
   * If neither is provided, returns from the beginning.
   */
  getUserConversations(cursor?: string, offset?: number, limit?: number): PaginatedResult<TChatConversation>;
}
