/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/storage';
import { getDatabase } from '@process/database';
import { ProcessChatMessage } from '../initStorage';

/**
 * Migrate a conversation from file storage to database
 * This is a lazy migration - only migrate when needed
 */
export async function migrateConversationToDatabase(conversation: TChatConversation): Promise<void> {
  try {
    const db = getDatabase();

    // Check if already in database
    const existing = db.getConversation(conversation.id);
    if (existing.success && existing.data) {
      // Already migrated, just update modifyTime
      db.updateConversation(conversation.id, { modifyTime: Date.now() });
      return;
    }

    // Create conversation in database
    const result = db.createConversation(conversation);
    if (!result.success) {
      console.error('[Migration] Failed to migrate conversation:', result.error);
      return;
    }

    // Migrate messages if they exist in file storage
    try {
      const messages = await ProcessChatMessage.get(conversation.id);
      if (messages && messages.length > 0) {
        // Batch insert messages
        for (const message of messages) {
          const insertResult = db.insertMessage(message);
          if (!insertResult.success) {
            console.error('[Migration] Failed to migrate message:', insertResult.error);
          }
        }
      }
    } catch (error) {
      console.warn('[Migration] No messages to migrate:', error);
    }
  } catch (error) {
    console.error('[Migration] Failed to migrate conversation:', error);
  }
}
