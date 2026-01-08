/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { bridge } from '@office-ai/platform';
import type { OpenDialogOptions } from 'electron';
import type { McpSource } from '../process/services/mcpServices/McpProtocol';
import type { AcpBackend } from '../types/acpTypes';
import type { IMcpServer, IProvider, TChatConversation, TProviderWithModel } from './storage';
import type { PreviewHistoryTarget, PreviewSnapshotInfo } from './types/preview';
import type { ProtocolDetectionRequest, ProtocolDetectionResponse } from './utils/protocolDetector';

export const shell = {
  openFile: bridge.buildProvider<void, string>('open-file'), // 使用系统默认程序打开文件
  showItemInFolder: bridge.buildProvider<void, string>('show-item-in-folder'), // 打开文件夹
  openExternal: bridge.buildProvider<void, string>('open-external'), // 使用系统默认程序打开外部链接
};

//通用会话能力
export const conversation = {
  create: bridge.buildProvider<TChatConversation, ICreateConversationParams>('create-conversation'), // 创建对话
  createWithConversation: bridge.buildProvider<TChatConversation, { conversation: TChatConversation; sourceConversationId?: string }>('create-conversation-with-conversation'), // Create new conversation from history (supports migration) / 通过历史会话创建新对话（支持迁移）
  get: bridge.buildProvider<TChatConversation, { id: string }>('get-conversation'), // 获取对话信息
  getAssociateConversation: bridge.buildProvider<TChatConversation[], { conversation_id: string }>('get-associated-conversation'), // 获取关联对话
  remove: bridge.buildProvider<boolean, { id: string }>('remove-conversation'), // 删除对话
  update: bridge.buildProvider<boolean, { id: string; updates: Partial<TChatConversation>; mergeExtra?: boolean }>('update-conversation'), // 更新对话信息
  reset: bridge.buildProvider<void, IResetConversationParams>('reset-conversation'), // 重置对话
  stop: bridge.buildProvider<IBridgeResponse<{}>, { conversation_id: string }>('chat.stop.stream'), // 停止会话
  sendMessage: bridge.buildProvider<IBridgeResponse<{}>, ISendMessageParams>('chat.send.message'), // 发送消息（统一接口）
  confirmMessage: bridge.buildProvider<IBridgeResponse, IConfirmMessageParams>('conversation.confirm.message'), // 通用确认消息
  responseStream: bridge.buildEmitter<IResponseMessage>('chat.response.stream'), // 接收消息（统一接口）
  getWorkspace: bridge.buildProvider<IDirOrFile[], { conversation_id: string; workspace: string; path: string; search?: string }>('conversation.get-workspace'),
  responseSearchWorkSpace: bridge.buildProvider<void, { file: number; dir: number; match?: IDirOrFile }>('conversation.response.search.workspace'),
  reloadContext: bridge.buildProvider<IBridgeResponse, { conversation_id: string }>('conversation.reload-context'),
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
  getZoomFactor: bridge.buildProvider<number, void>('app.get-zoom-factor'),
  setZoomFactor: bridge.buildProvider<number, { factor: number }>('app.set-zoom-factor'),
};

export const dialog = {
  showOpen: bridge.buildProvider<string[] | undefined, { defaultPath?: string; properties?: OpenDialogOptions['properties']; filters?: OpenDialogOptions['filters'] } | undefined>('show-open'), // 打开文件/文件夹选择窗口
};
export const fs = {
  getFilesByDir: bridge.buildProvider<Array<IDirOrFile>, { dir: string; root: string }>('get-file-by-dir'), // 获取指定文件夹下所有文件夹和文件列表
  getImageBase64: bridge.buildProvider<string, { path: string }>('get-image-base64'), // 获取图片base64
  fetchRemoteImage: bridge.buildProvider<string, { url: string }>('fetch-remote-image'), // 远程图片转base64
  readFile: bridge.buildProvider<string, { path: string }>('read-file'), // 读取文件内容（UTF-8）
  readFileBuffer: bridge.buildProvider<ArrayBuffer, { path: string }>('read-file-buffer'), // 读取二进制文件为 ArrayBuffer
  createTempFile: bridge.buildProvider<string, { fileName: string }>('create-temp-file'), // 创建临时文件
  writeFile: bridge.buildProvider<boolean, { path: string; data: Uint8Array | string }>('write-file'), // 写入文件
  getFileMetadata: bridge.buildProvider<IFileMetadata, { path: string }>('get-file-metadata'), // 获取文件元数据
  copyFilesToWorkspace: bridge.buildProvider<
    // 返回成功与部分失败的详细状态，便于前端提示用户 / Return details for successful and failed copies for better UI feedback
    IBridgeResponse<{ copiedFiles: string[]; failedFiles?: Array<{ path: string; error: string }> }>,
    { filePaths: string[]; workspace: string; sourceRoot?: string }
  >('copy-files-to-workspace'), // 复制文件到工作空间 (Copy files into workspace)
  removeEntry: bridge.buildProvider<IBridgeResponse, { path: string }>('remove-entry'), // 删除文件或文件夹
  renameEntry: bridge.buildProvider<IBridgeResponse<{ newPath: string }>, { path: string; newName: string }>('rename-entry'), // 重命名文件或文件夹
  readBuiltinRule: bridge.buildProvider<string, { fileName: string }>('read-builtin-rule'), // 读取内置 rules 文件
  // 助手规则文件操作 / Assistant rule file operations
  readAssistantRule: bridge.buildProvider<string, { assistantId: string; locale?: string }>('read-assistant-rule'), // 读取助手规则文件
  writeAssistantRule: bridge.buildProvider<boolean, { assistantId: string; content: string; locale?: string }>('write-assistant-rule'), // 写入助手规则文件
  deleteAssistantRule: bridge.buildProvider<boolean, { assistantId: string }>('delete-assistant-rule'), // 删除助手规则文件
};

export const fileWatch = {
  startWatch: bridge.buildProvider<IBridgeResponse, { filePath: string }>('file-watch-start'), // 开始监听文件变化
  stopWatch: bridge.buildProvider<IBridgeResponse, { filePath: string }>('file-watch-stop'), // 停止监听文件变化
  stopAllWatches: bridge.buildProvider<IBridgeResponse, void>('file-watch-stop-all'), // 停止所有文件监听
  fileChanged: bridge.buildEmitter<{ filePath: string; eventType: string }>('file-changed'), // 文件变化事件
};

// 文件流式更新（Agent 写入文件时实时推送内容）/ File streaming updates (real-time content push when agent writes)
export const fileStream = {
  contentUpdate: bridge.buildEmitter<{
    filePath: string; // 文件绝对路径 / Absolute file path
    content: string; // 新内容 / New content
    workspace: string; // 工作空间根目录 / Workspace root directory
    relativePath: string; // 相对路径 / Relative path
    operation: 'write' | 'delete'; // 操作类型 / Operation type
  }>('file-stream-content-update'), // Agent 写入文件时的流式内容更新 / Streaming content update when agent writes file
};

export const googleAuth = {
  login: bridge.buildProvider<IBridgeResponse<{ account: string }>, { proxy?: string }>('google.auth.login'),
  logout: bridge.buildProvider<void, {}>('google.auth.logout'),
  status: bridge.buildProvider<IBridgeResponse<{ account: string }>, { proxy?: string }>('google.auth.status'),
};

// 订阅状态查询：用于动态决定是否展示 gemini-3-pro-preview / subscription check for Gemini models
export const gemini = {
  subscriptionStatus: bridge.buildProvider<IBridgeResponse<{ isSubscriber: boolean; tier?: string; lastChecked: number; message?: string }>, { proxy?: string }>('gemini.subscription-status'),
};

export const mode = {
  fetchModelList: bridge.buildProvider<IBridgeResponse<{ mode: Array<string>; fix_base_url?: string }>, { base_url?: string; api_key: string; try_fix?: boolean; platform?: string }>('mode.get-model-list'),
  saveModelConfig: bridge.buildProvider<IBridgeResponse, IProvider[]>('mode.save-model-config'),
  getModelConfig: bridge.buildProvider<IProvider[], void>('mode.get-model-config'),
  /** 协议检测接口 - 自动检测 API 端点使用的协议类型 / Protocol detection - auto-detect API protocol type */
  detectProtocol: bridge.buildProvider<IBridgeResponse<ProtocolDetectionResponse>, ProtocolDetectionRequest>('mode.detect-protocol'),
};

// ACP对话相关接口 - 复用统一的conversation接口
export const acpConversation = {
  sendMessage: conversation.sendMessage,
  confirmMessage: bridge.buildProvider<IBridgeResponse, IConfirmMessageParams>('acp.input.confirm.message'),
  responseStream: conversation.responseStream,
  detectCliPath: bridge.buildProvider<IBridgeResponse<{ path?: string }>, { backend: AcpBackend }>('acp.detect-cli-path'),
  getAvailableAgents: bridge.buildProvider<
    IBridgeResponse<
      Array<{
        backend: AcpBackend;
        name: string;
        cliPath?: string;
        customAgentId?: string;
        isPreset?: boolean;
        context?: string;
        avatar?: string;
        presetAgentType?: 'gemini' | 'claude' | 'codex';
      }>
    >,
    void
  >('acp.get-available-agents'),
  checkEnv: bridge.buildProvider<{ env: Record<string, string> }, void>('acp.check.env'),
  refreshCustomAgents: bridge.buildProvider<IBridgeResponse, void>('acp.refresh-custom-agents'),
  // clearAllCache: bridge.buildProvider<IBridgeResponse<{ details?: any }>, void>('acp.clear.all.cache'),
};

// MCP 服务相关接口
export const mcpService = {
  getAgentMcpConfigs: bridge.buildProvider<IBridgeResponse<Array<{ source: McpSource; servers: IMcpServer[] }>>, Array<{ backend: AcpBackend; name: string; cliPath?: string }>>('mcp.get-agent-configs'),
  testMcpConnection: bridge.buildProvider<IBridgeResponse<{ success: boolean; tools?: Array<{ name: string; description?: string }>; error?: string; needsAuth?: boolean; authMethod?: 'oauth' | 'basic'; wwwAuthenticate?: string }>, IMcpServer>('mcp.test-connection'),
  syncMcpToAgents: bridge.buildProvider<IBridgeResponse<{ success: boolean; results: Array<{ agent: string; success: boolean; error?: string }> }>, { mcpServers: IMcpServer[]; agents: Array<{ backend: AcpBackend; name: string; cliPath?: string }> }>('mcp.sync-to-agents'),
  removeMcpFromAgents: bridge.buildProvider<IBridgeResponse<{ success: boolean; results: Array<{ agent: string; success: boolean; error?: string }> }>, { mcpServerName: string; agents: Array<{ backend: AcpBackend; name: string; cliPath?: string }> }>('mcp.remove-from-agents'),
  // OAuth 相关接口
  checkOAuthStatus: bridge.buildProvider<IBridgeResponse<{ isAuthenticated: boolean; needsLogin: boolean; error?: string }>, IMcpServer>('mcp.check-oauth-status'),
  loginMcpOAuth: bridge.buildProvider<IBridgeResponse<{ success: boolean; error?: string }>, { server: IMcpServer; config?: any }>('mcp.login-oauth'),
  logoutMcpOAuth: bridge.buildProvider<IBridgeResponse, string>('mcp.logout-oauth'),
  getAuthenticatedServers: bridge.buildProvider<IBridgeResponse<string[]>, void>('mcp.get-authenticated-servers'),
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

export const previewHistory = {
  list: bridge.buildProvider<PreviewSnapshotInfo[], { target: PreviewHistoryTarget }>('preview-history.list'),
  save: bridge.buildProvider<PreviewSnapshotInfo, { target: PreviewHistoryTarget; content: string }>('preview-history.save'),
  getContent: bridge.buildProvider<{ snapshot: PreviewSnapshotInfo; content: string } | null, { target: PreviewHistoryTarget; snapshotId: string }>('preview-history.get-content'),
};

// 预览面板相关接口 / Preview panel API
export const preview = {
  // Agent 触发打开预览（如 chrome-devtools 导航到 URL）/ Agent triggers open preview (e.g., chrome-devtools navigates to URL)
  open: bridge.buildEmitter<{
    content: string; // URL 或内容 / URL or content
    contentType: import('./types/preview').PreviewContentType; // 内容类型 / Content type
    metadata?: {
      title?: string;
      fileName?: string;
    };
  }>('preview.open'),
};

export const document = {
  convert: bridge.buildProvider<import('./types/conversion').DocumentConversionResponse, import('./types/conversion').DocumentConversionRequest>('document.convert'),
};

// 窗口控制相关接口 / Window controls API
export const windowControls = {
  minimize: bridge.buildProvider<void, void>('window-controls:minimize'),
  maximize: bridge.buildProvider<void, void>('window-controls:maximize'),
  unmaximize: bridge.buildProvider<void, void>('window-controls:unmaximize'),
  close: bridge.buildProvider<void, void>('window-controls:close'),
  isMaximized: bridge.buildProvider<boolean, void>('window-controls:is-maximized'),
  maximizedChanged: bridge.buildEmitter<{ isMaximized: boolean }>('window-controls:maximized-changed'),
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
  extra: {
    workspace?: string;
    customWorkspace?: boolean;
    defaultFiles?: string[];
    backend?: AcpBackend;
    cliPath?: string;
    webSearchEngine?: 'google' | 'default';
    agentName?: string;
    customAgentId?: string;
    context?: string;
    contextFileName?: string; // For gemini preset agents
    /**
     * Preset context/rules to inject into the first message.
     * Used by smart assistants to provide custom prompts/rules.
     * For Gemini: injected via contextContent
     * For ACP/Codex: injected via <system_instruction> tag in first message
     */
    presetContext?: string;
  };
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
  isDirectory?: boolean;
}

export interface IResponseMessage {
  type: string;
  data: unknown;
  msg_id: string;
  conversation_id: string;
}

interface IBridgeResponse<D = {}> {
  success: boolean;
  data?: D;
  msg?: string;
}
