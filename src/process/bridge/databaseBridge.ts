/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '../../common';
import { getDatabase } from '../database/export';

export function initDatabaseBridge(): void {
  console.log('[DatabaseBridge] Initializing database bridge...');

  // Get conversation messages from database
  ipcBridge.database.getConversationMessages.provider(async ({ conversation_id, page = 0, pageSize = 10000 }) => {
    try {
      console.log(`[DatabaseBridge] Getting messages for conversation: ${conversation_id}, page: ${page}, pageSize: ${pageSize}`);
      const db = getDatabase();
      const result = db.getConversationMessages(conversation_id, page, pageSize);

      console.log(`[DatabaseBridge] Found ${result.data?.length || 0} messages`);
      return result.data || [];
    } catch (error) {
      console.error('[DatabaseBridge] Error getting conversation messages:', error);
      return [];
    }
  });

  console.log('[DatabaseBridge] Database bridge initialized successfully');
}
