/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '../../common';
import { getDatabase } from '@process/database';
import { addOrUpdateMessage } from '../message';

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

  // Get user conversations from database
  ipcBridge.database.getUserConversations.provider(({ page = 0, pageSize = 10000 }) => {
    try {
      const db = getDatabase();
      const result = db.getUserConversations(undefined, page, pageSize);
      return Promise.resolve(result.data || []);
    } catch (error) {
      console.error('[DatabaseBridge] Error getting user conversations:', error);
      return Promise.resolve([]);
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
}
