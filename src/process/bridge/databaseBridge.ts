/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '../../common';
import { getDatabase } from '../database/export';
import { addOrUpdateMessage } from '../message';
import { ProcessChat, ProcessChatMessage } from '../initStorage';
import type { TChatConversation } from '@/common/storage';

/**
 * Migrate a conversation from file storage to database
 */
async function migrateConversationToDatabase(conversation: TChatConversation): Promise<void> {
  try {
    const db = getDatabase();

    // Check if already in database
    const existing = db.getConversation(conversation.id);
    if (existing.success && existing.data) {
      return;
    }

    // Create conversation in database
    const result = db.createConversation(conversation);
    if (!result.success) {
      console.error('[DatabaseBridge Migration] Failed to migrate conversation:', result.error);
      return;
    }

    // Migrate messages if they exist in file storage
    try {
      const messages = await ProcessChatMessage.get(conversation.id);
      if (messages && messages.length > 0) {
        console.log(`[DatabaseBridge Migration] Migrating ${messages.length} messages for conversation ${conversation.id}`);

        for (const message of messages) {
          const insertResult = db.insertMessage(message);
          if (!insertResult.success) {
            console.error('[DatabaseBridge Migration] Failed to migrate message:', insertResult.error);
          }
        }
      }
    } catch (error) {
      console.warn('[DatabaseBridge Migration] No messages to migrate:', error);
    }
  } catch (error) {
    console.error('[DatabaseBridge Migration] Failed to migrate conversation:', error);
  }
}

export function initDatabaseBridge(): void {
  console.log('[DatabaseBridge] Initializing database bridge...');

  // Get conversation messages from database
  ipcBridge.database.getConversationMessages.provider(({ conversation_id, page = 0, pageSize = 10000 }) => {
    try {
      console.log(`[DatabaseBridge] Getting messages for conversation: ${conversation_id}, page: ${page}, pageSize: ${pageSize}`);
      const db = getDatabase();
      const result = db.getConversationMessages(conversation_id, page, pageSize);

      console.log(`[DatabaseBridge] Found ${result.data?.length || 0} messages for conversation ${conversation_id}`);
      if (result.data && result.data.length > 0) {
        console.log(`[DatabaseBridge] First message:`, {
          id: result.data[0].id,
          type: result.data[0].type,
          conversation_id: result.data[0].conversation_id,
          contentPreview: JSON.stringify(result.data[0].content).substring(0, 100),
        });
      }
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
        console.log(`[DatabaseBridge] Lazy migrating conversations: ${fileConversations.length} in files, ${dbConversations.length} in database`);

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

  // Add or update a message in the database
  ipcBridge.database.addOrUpdateMessage.provider(({ conversation_id, message }) => {
    try {
      addOrUpdateMessage(conversation_id, message);
      return Promise.resolve(true);
    } catch (error) {
      console.error('[DatabaseBridge] Error adding/updating message:', error);
      return Promise.resolve(false);
    }
  });

  console.log('[DatabaseBridge] Database bridge initialized successfully');
}
