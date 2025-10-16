/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '../../common';
import { getDatabase } from '@process/database';
import { ProcessChat } from '../initStorage';
import type { TChatConversation } from '@/common/storage';
import { migrateConversationToDatabase } from './migrationUtils';

export function initDatabaseBridge(): void {
  // Get conversation messages from database
  ipcBridge.database.getConversationMessages.provider(({ conversation_id, page = 0, pageSize = 10000 }) => {
    try {
      const db = getDatabase();
      const result = db.getConversationMessages(conversation_id, page, pageSize);
      return Promise.resolve(result.data || []);
    } catch (error) {
      console.error('[DatabaseBridge] Error getting conversation messages:', error);
      return Promise.resolve([]);
    }
  });

  // Get user conversations from database with lazy migration from file storage
  ipcBridge.database.getUserConversations.provider(async ({ page = 0, pageSize = 10000 }) => {
    try {
      const db = getDatabase();
      const result = db.getUserConversations(undefined, page, pageSize);
      const dbConversations = result.data || [];

      // Try to get conversations from file storage
      let fileConversations: TChatConversation[] = [];
      try {
        fileConversations = (await ProcessChat.get('chat.history')) || [];
      } catch (error) {
        console.warn('[DatabaseBridge] No file-based conversations found:', error);
      }

      // If database has fewer conversations than file storage, we need to migrate
      if (fileConversations.length > dbConversations.length) {
        // Migrate all file-based conversations in background
        void Promise.all(fileConversations.map((conv) => migrateConversationToDatabase(conv)));

        // Return file-based conversations immediately (migration happens in background)
        return fileConversations;
      }

      // Database is up to date, return database conversations
      return dbConversations;
    } catch (error) {
      console.error('[DatabaseBridge] Error getting user conversations:', error);
      return [];
    }
  });
}
