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

      // Use database conversations as the primary source while backfilling missing ones from file storage
      // 以数据库结果为主，只补充文件中尚未迁移的会话，避免删除后出现“只剩更早记录”的问题
      // Build a map for fast lookup to avoid duplicates when merging
      const dbConversationMap = new Map(dbConversations.map((conv) => [conv.id, conv] as const));

      // Filter out conversations that already exist in database
      // 只保留文件里数据库没有的会话，确保不会重复
      const fileOnlyConversations = fileConversations.filter((conv) => !dbConversationMap.has(conv.id));

      // If there are conversations that only exist in file storage, migrate them in background
      // 对剩余会话做懒迁移，保证后续刷新直接使用数据库
      if (fileOnlyConversations.length > 0) {
        void Promise.all(fileOnlyConversations.map((conv) => migrateConversationToDatabase(conv)));
      }

      // Combine database conversations (source of truth) with any remaining file-only conversations
      // 返回数据库结果 + 未迁移会话，这样“今天”与“更早”记录都能稳定展示
      return [...dbConversations, ...fileOnlyConversations];
    } catch (error) {
      console.error('[DatabaseBridge] Error getting user conversations:', error);
      return [];
    }
  });
}
