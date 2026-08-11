/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { ProcessChat } from '@process/utils/initStorage';
import type { TChatConversation } from '@/common/config/storage';
import { migrateConversationToDatabase } from './migrationUtils';
import type { IConversationRepository } from '@process/services/database/IConversationRepository';
import { getDatabase } from '@process/services/database';

export function initDatabaseBridge(repo: IConversationRepository): void {
  // Get conversation messages from database
  ipcBridge.database.getConversationMessages.provider(async (_params) => {
    const { conversation_id, page = 0, pageSize = 10000, order } = _params ?? {};
    try {
      const result = await repo.getMessages(conversation_id, page, pageSize, order);
      return result.data;
    } catch (error) {
      console.error('[DatabaseBridge] Error getting conversation messages:', error);
      return [];
    }
  });

  // Get user conversations from database with lazy migration from file storage
  ipcBridge.database.getUserConversations.provider(async (_params) => {
    const { page = 0, pageSize = 10000 } = _params ?? {};
    try {
      const result = await repo.getUserConversations(undefined, page * pageSize, pageSize);
      const dbConversations = result.data;

      // Try to get conversations from file storage
      let fileConversations: TChatConversation[] = [];
      try {
        fileConversations = (await ProcessChat.get('chat.history')) || [];
      } catch (error) {
        console.warn('[DatabaseBridge] No file-based conversations found:', error);
      }

      // Use database conversations as the primary source while backfilling missing ones from file storage
      // 以数据库结果为主，只补充文件中尚未迁移的会话，避免删除后出现"只剩更早记录"的问题
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
      // 返回数据库结果 + 未迁移会话，这样"今天"与"更早"记录都能稳定展示
      const allConversations = [...dbConversations, ...fileOnlyConversations];
      // Re-sort by modifyTime (or createTime as fallback) to maintain correct order
      allConversations.sort((a, b) => (b.modifyTime || b.createTime || 0) - (a.modifyTime || a.createTime || 0));
      return allConversations;
    } catch (error) {
      console.error('[DatabaseBridge] Error getting user conversations:', error);
      return [];
    }
  });

  ipcBridge.database.getApiConfig.provider(async () => {
    try {
      const db = await getDatabase();
      const result = db.getApiConfig();
      return result.success ? (result.data ?? null) : null;
    } catch (error) {
      console.error('[DatabaseBridge] Error getting API config:', error);
      return null;
    }
  });

  ipcBridge.database.updateApiEnabled.provider(async ({ enabled }) => {
    try {
      const db = await getDatabase();
      const result = db.updateApiEnabled(enabled);
      return {
        success: !!result.success,
        error: result.success ? undefined : result.error,
      };
    } catch (error) {
      console.error('[DatabaseBridge] Error updating API enabled:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  ipcBridge.database.saveApiConfig.provider(async (config) => {
    try {
      const db = await getDatabase();
      const result = db.saveApiConfig(config);
      return {
        success: !!result.success,
        error: result.success ? undefined : result.error,
      };
    } catch (error) {
      console.error('[DatabaseBridge] Error saving API config:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  ipcBridge.database.searchConversationMessages.provider(async (_params) => {
    const { keyword, page = 0, pageSize = 20 } = _params ?? {};
    try {
      const result = await repo.searchMessages(keyword, page, pageSize);
      return result;
    } catch (error) {
      console.error('[DatabaseBridge] Error searching conversation messages:', error);
      return {
        items: [],
        total: 0,
        page,
        pageSize,
        hasMore: false,
      };
    }
  });

  ipcBridge.database.searchManagedConversations.provider(async (_params) => {
    const { category = 'all', workspaceKeyword = '', keyword = '', page = 0, pageSize = 20 } = _params ?? {};
    try {
      return await repo.searchConversationsForManagement({
        category,
        workspaceKeyword,
        keyword,
        page,
        pageSize,
      });
    } catch (error) {
      console.error('[DatabaseBridge] Error searching managed conversations:', error);
      return {
        items: [],
        total: 0,
        page,
        pageSize,
        hasMore: false,
      };
    }
  });
}
