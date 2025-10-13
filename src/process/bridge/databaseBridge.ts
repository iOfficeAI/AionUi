/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '../../common';
import { getDatabase } from '../database/export';
import { addOrUpdateMessage } from '../message';

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
      return result.data || [];
    } catch (error) {
      console.error('[DatabaseBridge] Error getting conversation messages:', error);
      return [];
    }
  });

  // Get user conversations from database
  ipcBridge.database.getUserConversations.provider(({ page = 0, pageSize = 10000 }) => {
    try {
      console.log(`[DatabaseBridge] Getting user conversations: page: ${page}, pageSize: ${pageSize}`);
      const db = getDatabase();
      const result = db.getUserConversations(undefined, page, pageSize);

      console.log(`[DatabaseBridge] Found ${result.data?.length || 0} conversations`);
      return result.data || [];
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
