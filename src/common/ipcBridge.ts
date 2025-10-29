/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { bridge } from '@office-ai/platform';
import type { OpenDialogOptions } from 'electron';
import type { AcpBackend } from '../types/acpTypes';
import type { McpSource } from '../process/services/mcpServices/McpProtocol';
import type { IProvider, TChatConversation, TProviderWithModel, IMcpServer } from './storage';

export const shell = {
  openFile: bridge.buildProvider<void, string>('open-file'), // 使用系统默认程序打开文件
  showItemInFolder: bridge.buildProvider<void, string>('show-item-in-folder'), // 打开文件夹
  openExternal: bridge.buildProvider<void, string>('open-external'), // 使用系统默认程序打开外部链接
};

//通用会话能力
export const conversation = {
  create: bridge.buildProvider<TChatConversation, ICreateConversationParams>('create-conversation'), // 创建对话
  createWithConversation: bridge.buildProvider<TChatConversation, { conversation: TChatConversation }>('create-conversation-with-conversation'), // 通过历史会话创建新对话
  get: bridge.buildProvider<TChatConversation, { id: string }>('get-conversation'), // 获取对话信息
  getAssociateConversation: bridge.buildProvider<TChatConversation[], { conversation_id: string }>('get-associated-conversation'), // 获取关联对话
  remove: bridge.buildProvider<boolean, { id: string }>('remove-conversation'), // 删除对话
  update: bridge.buildProvider<boolean, { id: string; updates: Partial<TChatConversation> }>('update-conversation'), // 更新对话信息
  reset: bridge.buildProvider<void, IResetConversationParams>('reset-conversation'), // 重置对话
  stop: bridge.buildProvider<IBridgeResponse<{}>, { conversation_id: string }>('chat.stop.stream'), // 停止会话
  sendMessage: bridge.buildProvider<IBridgeResponse<{}>, ISendMessageParams>('chat.send.message'), // 发送消息（统一接口）
  confirmMessage: bridge.buildProvider<IBridgeResponse, IConfirmMessageParams>('conversation.confirm.message'), // 通用确认消息
  responseStream: bridge.buildEmitter<IResponseMessage>('chat.response.stream'), // 接收消息（统一接口）
  getWorkspace: bridge.buildProvider<IDirOrFile[], { conversation_id: string; workspace: string; path: string; search?: string }>('conversation.get-workspace'),
  responseSearchWorkSpace: bridge.buildProvider<void, { file: number; dir: number; match?: IDirOrFile }>('conversation.response.search.workspace'),
};

// Gemini对话相关接口 - 复用统一的conversation接口
export const geminiConversation = {
  sendMessage: conversation.sendMessage,
  confirmMessage: bridge.buildProvider<IBridgeResponse, IConfirmMessageParams>('input.confirm.message'),
  responseStream: conversation.responseStream,
};

export const application = {
  restart: bridge.buildProvider<void, void>('restart-app'), // 重启应用
  openDevTools: bridge.buildProvider<void, void>('open-dev-tools'), // 打开开发者工具
  systemInfo: bridge.buildProvider<{ cacheDir: string; workDir: string; platform: string; arch: string }, void>('system.info'), // 获取系统信息
  updateSystemInfo: bridge.buildProvider<IBridgeResponse, { cacheDir: string; workDir: string }>('system.update-info'), // 更新系统信息
};

export const dialog = {
  showOpen: bridge.buildProvider<string[] | undefined, { defaultPath?: string; properties?: OpenDialogOptions['properties'] } | undefined>('show-open'), // 打开文件/文件夹选择窗口
};
export const fs = {
  getFilesByDir: bridge.buildProvider<Array<IDirOrFile>, { dir: string; root: string }>('get-file-by-dir'), // 获取指定文件夹下所有文件夹和文件列表
  getImageBase64: bridge.buildProvider<string, { path: string }>('get-image-base64'), // 获取图片base64
  createTempFile: bridge.buildProvider<string, { fileName: string }>('create-temp-file'), // 创建临时文件
  writeFile: bridge.buildProvider<boolean, { path: string; data: Uint8Array }>('write-file'), // 写入文件
  getFileMetadata: bridge.buildProvider<IFileMetadata, { path: string }>('get-file-metadata'), // 获取文件元数据
};

export const googleAuth = {
  login: bridge.buildProvider<IBridgeResponse<{ account: string }>, { proxy?: string }>('google.auth.login'),
  logout: bridge.buildProvider<void, {}>('google.auth.logout'),
  status: bridge.buildProvider<IBridgeResponse<{ account: string }>, { proxy?: string }>('google.auth.status'),
};

export const mode = {
  fetchModelList: bridge.buildProvider<IBridgeResponse<{ mode: Array<string>; fix_base_url?: string }>, { base_url?: string; api_key: string; try_fix?: boolean; platform?: string }>('mode.get-model-list'),
  saveModelConfig: bridge.buildProvider<IBridgeResponse, IProvider[]>('mode.save-model-config'),
  getModelConfig: bridge.buildProvider<IProvider[], void>('mode.get-model-config'),
};

// ACP对话相关接口 - 复用统一的conversation接口
export const acpConversation = {
  sendMessage: conversation.sendMessage,
  confirmMessage: bridge.buildProvider<IBridgeResponse, IConfirmMessageParams>('acp.input.confirm.message'),
  responseStream: conversation.responseStream,
  detectCliPath: bridge.buildProvider<IBridgeResponse<{ path?: string }>, { backend: AcpBackend }>('acp.detect-cli-path'),
  getAvailableAgents: bridge.buildProvider<IBridgeResponse<Array<{ backend: AcpBackend; name: string; cliPath?: string }>>, void>('acp.get-available-agents'),
  checkEnv: bridge.buildProvider<{ env: Record<string, string> }, void>('acp.check.env'),
  // clearAllCache: bridge.buildProvider<IBridgeResponse<{ details?: any }>, void>('acp.clear.all.cache'),
};

// MCP 服务相关接口
export const mcpService = {
  getAgentMcpConfigs: bridge.buildProvider<IBridgeResponse<Array<{ source: McpSource; servers: IMcpServer[] }>>, Array<{ backend: AcpBackend; name: string; cliPath?: string }>>('mcp.get-agent-configs'),
  testMcpConnection: bridge.buildProvider<IBridgeResponse<{ success: boolean; tools?: Array<{ name: string; description?: string }>; error?: string }>, IMcpServer>('mcp.test-connection'),
  syncMcpToAgents: bridge.buildProvider<IBridgeResponse<{ success: boolean; results: Array<{ agent: string; success: boolean; error?: string }> }>, { mcpServers: IMcpServer[]; agents: Array<{ backend: AcpBackend; name: string; cliPath?: string }> }>('mcp.sync-to-agents'),
  removeMcpFromAgents: bridge.buildProvider<IBridgeResponse<{ success: boolean; results: Array<{ agent: string; success: boolean; error?: string }> }>, { mcpServerName: string; agents: Array<{ backend: AcpBackend; name: string; cliPath?: string }> }>('mcp.remove-from-agents'),
};

// Codex 对话相关接口 - 复用统一的conversation接口
export const codexConversation = {
  sendMessage: conversation.sendMessage,
  confirmMessage: bridge.buildProvider<IBridgeResponse, IConfirmMessageParams>('codex.input.confirm.message'),
  responseStream: conversation.responseStream,
};

// Database operations
export const database = {
  getConversationMessages: bridge.buildProvider<import('@/common/chatLib').TMessage[], { conversation_id: string; page?: number; pageSize?: number }>('database.get-conversation-messages'),
  getUserConversations: bridge.buildProvider<import('@/common/storage').TChatConversation[], { page?: number; pageSize?: number }>('database.get-user-conversations'),
};

interface ISendMessageParams {
  input: string;
  msg_id: string;
  conversation_id: string;
  files?: string[];
  loading_id?: string;
}

// Unified confirm message params for all agents (Gemini, ACP, Codex)
export interface IConfirmMessageParams {
  confirmKey: string;
  msg_id: string;
  conversation_id: string;
  callId: string;
}

export interface ICreateConversationParams {
  type: 'gemini' | 'acp' | 'codex';
  id?: string;
  name?: string;
  model: TProviderWithModel;
  extra: { workspace?: string; defaultFiles?: string[]; backend?: AcpBackend; cliPath?: string; webSearchEngine?: 'google' | 'default' };
}
interface IResetConversationParams {
  id?: string;
  gemini?: {
    clearCachedCredentialFile?: boolean;
  };
}

// 获取文件夹或文件列表
export interface IDirOrFile {
  name: string;
  fullPath: string;
  relativePath: string;
  isDir: boolean;
  isFile: boolean;
  children?: Array<IDirOrFile>;
}

// 文件元数据接口
export interface IFileMetadata {
  name: string;
  path: string;
  size: number;
  type: string;
  lastModified: number;
}

export interface IResponseMessage {
  type: string;
  data: any;
  msg_id: string;
  conversation_id: string;
}

interface IBridgeResponse<D = {}> {
  success: boolean;
  data?: D;
  msg?: string;
}
