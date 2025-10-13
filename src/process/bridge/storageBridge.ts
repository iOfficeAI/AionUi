/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { bridge } from '@office-ai/platform';
import { getDatabase } from '../database/export';

const MAX_PAGE_SIZE = 200;
const DEFAULT_CONVERSATION_PAGE_SIZE = 50;
const DEFAULT_MESSAGE_PAGE_SIZE = 100;

const normalizePage = (value: number | undefined): number => {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
};

const normalizePageSize = (value: number | undefined, fallback: number): number => {
  const base = typeof value === 'number' && !Number.isNaN(value) ? Math.floor(value) : fallback;
  const positive = base < 1 ? 1 : base;
  return positive > MAX_PAGE_SIZE ? MAX_PAGE_SIZE : positive;
};

/**
 * 通用的 bridge 订阅包装器
 * Generic bridge subscription wrapper with error handling
 */
const subscribe = (eventName: string, handler: (data: any) => Promise<any> | any) => {
  bridge.subscribe(eventName, async (data: any) => {
    try {
      return await handler(data);
    } catch (error) {
      console.error(`[StorageBridge] ${eventName} error:`, error);
      throw error;
    }
  });
};

/**
 * 初始化存储桥接 - 使用数据库 API
 * Initialize storage bridge - direct database API usage
 *
 * 使用 SQLite 数据库
 * use SQLite database
 */
export function initStorageBridge(): void {
  console.log('[StorageBridge] Initializing storage bridge with direct database API...');

  const db = getDatabase();

  // ==================== 对话历史相关 API ====================
  // Conversation APIs

  subscribe('conversations.list', ({ page = 0, pageSize = DEFAULT_CONVERSATION_PAGE_SIZE } = {}) => {
    return db.getUserConversations(undefined, normalizePage(page), normalizePageSize(pageSize, DEFAULT_CONVERSATION_PAGE_SIZE));
  });

  subscribe('conversation.get', (conversationId: string) => db.getConversation(conversationId));

  subscribe('conversation.create', (conversation: any) => db.createConversation(conversation));

  subscribe('conversation.update', ({ id, updates }: { id: string; updates: any }) => db.updateConversation(id, updates));

  subscribe('conversation.delete', (conversationId: string) => db.deleteConversation(conversationId));

  // ==================== 消息相关 API ====================
  // Message APIs

  subscribe('messages.list', ({ conversationId, page = 0, pageSize = DEFAULT_MESSAGE_PAGE_SIZE }: { conversationId: string; page?: number; pageSize?: number }) => {
    return db.getConversationMessages(conversationId, normalizePage(page), normalizePageSize(pageSize, DEFAULT_MESSAGE_PAGE_SIZE));
  });

  subscribe('message.update', ({ id, message }: { id: string; message: any }) => db.updateMessage(id, message));

  subscribe('message.delete', (messageId: string) => db.deleteMessage(messageId));

  // ==================== 配置相关 API ====================
  // Config APIs

  subscribe('config.get', (key: string) => db.getConfig(key));

  subscribe('config.set', ({ key, value }: { key: string; value: any }) => db.setConfig(key, value));

  subscribe('config.delete', (key: string) => db.deleteConfig(key));

  console.log('[StorageBridge] ✓ Storage bridge initialized successfully');
  console.log('[StorageBridge] ✓ All APIs use SQLite database');
  console.log('[StorageBridge] ✓ Available APIs: conversations.*, messages.*, config.*');
}
