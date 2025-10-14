/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// 复用现有的业务类型定义
import type { TChatConversation, IProvider, IMcpServer, IConfigStorageRefer } from '@/common/storage';
import type { TMessage } from '@/common/chatLib';

/**
 * ======================
 * 数据库专属类型 (新增功能)
 * ======================
 */

/**
 * User account (新增的账户系统)
 */
export interface IUser {
  id: string;
  username: string;
  email?: string;
  password_hash: string;
  avatar_path?: string;
  created_at: number;
  updated_at: number;
}

// Image metadata removed - images are stored in filesystem and referenced via message.resultDisplay

/**
 * ======================
 * 数据库查询辅助类型
 * ======================
 */

/**
 * Database query result wrapper
 */
export interface IQueryResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Paginated query result
 */
export interface IPaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * ======================
 * 数据库存储格式 (序列化后的格式)
 * ======================
 */

/**
 * Conversation stored in database (序列化后的格式)
 */
export interface IConversationRow {
  id: string;
  user_id: string;
  name: string;
  type: 'gemini' | 'acp' | 'codex';
  extra: string; // JSON string of extra data
  model?: string; // JSON string of TProviderWithModel (gemini type has this)
  status?: 'pending' | 'running' | 'finished';
  created_at: number;
  updated_at: number;
}

/**
 * Message stored in database (序列化后的格式)
 */
export interface IMessageRow {
  id: string;
  conversation_id: string;
  msg_id?: string; // 消息来源ID
  type: string; // TMessage['type']
  content: string; // JSON string of message content
  position?: 'left' | 'right' | 'center' | 'pop';
  status?: 'finish' | 'pending' | 'error' | 'work';
  created_at: number;
}

/**
 * Provider stored in database (序列化后的格式)
 */
export interface IProviderRow {
  id: string;
  user_id: string;
  platform: string;
  name: string;
  base_url: string;
  api_key: string;
  models: string; // JSON array string
  capabilities?: string; // JSON array string
  context_limit?: number;
  created_at: number;
  updated_at: number;
}

/**
 * MCP Server stored in database (序列化后的格式)
 */
export interface IMcpServerRow {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  enabled: boolean;
  transport: string; // JSON string of IMcpServerTransport
  tools?: string; // JSON array string
  status?: 'connected' | 'disconnected' | 'error' | 'testing';
  last_connected?: number;
  created_at: number;
  updated_at: number;
  original_json: string;
}

/**
 * Config stored in database (key-value)
 */
export interface IConfigRow {
  key: string;
  value: string; // JSON string
  updated_at: number;
}

/**
 * ======================
 * 类型转换函数
 * ======================
 */

/**
 * Convert TChatConversation to database row
 */
export function conversationToRow(conversation: TChatConversation, userId: string): IConversationRow {
  return {
    id: conversation.id,
    user_id: userId,
    name: conversation.name,
    type: conversation.type,
    extra: JSON.stringify(conversation.extra),
    model: 'model' in conversation ? JSON.stringify(conversation.model) : undefined,
    status: conversation.status,
    created_at: conversation.createTime,
    updated_at: conversation.modifyTime,
  };
}

/**
 * Convert database row to TChatConversation
 */
export function rowToConversation(row: IConversationRow): TChatConversation {
  const base = {
    id: row.id,
    name: row.name,
    desc: undefined as string | undefined,
    createTime: row.created_at,
    modifyTime: row.updated_at,
    status: row.status,
  };

  // Gemini type has model field
  if (row.type === 'gemini' && row.model) {
    return {
      ...base,
      type: 'gemini' as const,
      extra: JSON.parse(row.extra),
      model: JSON.parse(row.model),
    } as TChatConversation;
  }

  // ACP type
  if (row.type === 'acp') {
    return {
      ...base,
      type: 'acp' as const,
      extra: JSON.parse(row.extra),
    } as TChatConversation;
  }

  // Codex type
  return {
    ...base,
    type: 'codex' as const,
    extra: JSON.parse(row.extra),
  } as TChatConversation;
}

/**
 * Convert TMessage to database row
 */
export function messageToRow(message: TMessage): IMessageRow {
  return {
    id: message.id,
    conversation_id: message.conversation_id,
    msg_id: message.msg_id,
    type: message.type,
    content: JSON.stringify(message.content),
    position: message.position,
    status: message.status,
    created_at: message.createdAt || Date.now(),
  };
}

/**
 * Convert database row to TMessage
 */
export function rowToMessage(row: IMessageRow): TMessage {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    msg_id: row.msg_id,
    type: row.type as TMessage['type'],
    content: JSON.parse(row.content),
    position: row.position,
    status: row.status,
    createdAt: row.created_at,
  } as TMessage;
}

/**
 * Convert IProvider to database row
 */
export function providerToRow(provider: IProvider, userId: string): IProviderRow {
  return {
    id: provider.id,
    user_id: userId,
    platform: provider.platform,
    name: provider.name,
    base_url: provider.baseUrl,
    api_key: provider.apiKey,
    models: JSON.stringify(provider.model),
    capabilities: provider.capabilities ? JSON.stringify(provider.capabilities) : undefined,
    context_limit: provider.contextLimit,
    created_at: Date.now(),
    updated_at: Date.now(),
  };
}

/**
 * Convert database row to IProvider
 */
export function rowToProvider(row: IProviderRow): IProvider {
  return {
    id: row.id,
    platform: row.platform,
    name: row.name,
    baseUrl: row.base_url,
    apiKey: row.api_key,
    model: JSON.parse(row.models),
    capabilities: row.capabilities ? JSON.parse(row.capabilities) : undefined,
    contextLimit: row.context_limit,
  };
}

/**
 * Convert IMcpServer to database row
 */
export function mcpServerToRow(server: IMcpServer, userId: string): IMcpServerRow {
  return {
    id: server.id,
    user_id: userId,
    name: server.name,
    description: server.description,
    enabled: server.enabled,
    transport: JSON.stringify(server.transport),
    tools: server.tools ? JSON.stringify(server.tools) : undefined,
    status: server.status,
    last_connected: server.lastConnected,
    created_at: server.createdAt,
    updated_at: server.updatedAt,
    original_json: server.originalJson,
  };
}

/**
 * Convert database row to IMcpServer
 */
export function rowToMcpServer(row: IMcpServerRow): IMcpServer {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    transport: JSON.parse(row.transport),
    tools: row.tools ? JSON.parse(row.tools) : undefined,
    status: row.status,
    lastConnected: row.last_connected,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    originalJson: row.original_json,
  };
}

/**
 * ======================
 * 导出类型别名，方便使用
 * ======================
 */

export type {
  // 复用的业务类型
  TChatConversation,
  TMessage,
  IProvider,
  IMcpServer,
  IConfigStorageRefer,
};
