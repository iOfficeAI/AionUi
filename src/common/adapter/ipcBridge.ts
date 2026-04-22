/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * IPC Bridge → HTTP/WS adapter.
 *
 * This file replaces the original IPC bridge calls with HTTP REST and WebSocket
 * calls routed to aionui-backend. Electron-native operations (window controls,
 * native dialogs, auto-update, devtools, zoom, CDP, deep links) remain as IPC.
 */

import type { IConfirmation } from '@/common/chat/chatLib';
import { bridge } from '@office-ai/platform';
import type { OpenDialogOptions } from 'electron';
import type { McpSource } from '../../process/services/mcpServices/McpProtocol';
import type { AgentBackend, AcpModelInfo } from '../types/acpTypes';
import type { SlashCommandItem } from '../chat/slash/types';
import type { IMcpServer, IProvider, TChatConversation, TProviderWithModel, ICssTheme } from '../config/storage';
import type { PreviewHistoryTarget, PreviewSnapshotInfo } from '../types/preview';
import type {
  UpdateCheckRequest,
  UpdateCheckResult,
  UpdateDownloadProgressEvent,
  UpdateDownloadRequest,
  UpdateDownloadResult,
  AutoUpdateStatus,
} from '../update/updateTypes';
import type { ProtocolDetectionRequest, ProtocolDetectionResponse } from '../utils/protocolDetector';
import type { SpeechToTextRequest, SpeechToTextResult } from '../types/speech';
import {
  httpGet,
  httpPost,
  httpPut,
  httpPatch,
  httpDelete,
  wsEmitter,
  stubProvider,
  stubEmitter,
} from './httpBridge';

// ---------------------------------------------------------------------------
// Shell — routed to POST /api/shell/*
// ---------------------------------------------------------------------------

export const shell = {
  openFile: httpPost<void, string>('/api/shell/open-file', (path) => ({ path })),
  showItemInFolder: httpPost<void, string>('/api/shell/show-item-in-folder', (path) => ({ path })),
  openExternal: httpPost<void, string>('/api/shell/open-external', (url) => ({ url })),
  checkToolInstalled: httpPost<boolean, { tool: string }>('/api/shell/check-tool-installed'),
  openFolderWith: httpPost<void, { folderPath: string; tool: 'vscode' | 'terminal' | 'explorer' }>(
    '/api/shell/open-folder-with',
  ),
};

// ---------------------------------------------------------------------------
// Conversation — REST + WS
// ---------------------------------------------------------------------------

export const conversation = {
  create: httpPost<TChatConversation, ICreateConversationParams>('/api/conversations'),
  createWithConversation: httpPost<
    TChatConversation,
    { conversation: TChatConversation; sourceConversationId?: string; migrateCron?: boolean }
  >('/api/conversations/clone'),
  get: httpGet<TChatConversation, { id: string }>((p) => `/api/conversations/${p.id}`),
  getAssociateConversation: httpGet<TChatConversation[], { conversation_id: string }>(
    (p) => `/api/conversations/${p.conversation_id}/associated`,
  ),
  listByCronJob: httpGet<TChatConversation[], { cronJobId: string }>(
    (p) => `/api/cron/jobs/${p.cronJobId}/conversations`,
  ),
  remove: httpDelete<boolean, { id: string }>((p) => `/api/conversations/${p.id}`),
  update: httpPatch<boolean, { id: string; updates: Partial<TChatConversation>; mergeExtra?: boolean }>(
    (p) => `/api/conversations/${p.id}`,
    (p) => ({ updates: p.updates, mergeExtra: p.mergeExtra }),
  ),
  reset: httpPost<void, IResetConversationParams>(
    (p) => `/api/conversations/${p.id}/reset`,
    (p) => ({ gemini: p.gemini }),
  ),
  warmup: httpPost<void, { conversation_id: string }>((p) => `/api/conversations/${p.conversation_id}/warmup`),
  stop: httpPost<void, { conversation_id: string }>(
    (p) => `/api/conversations/${p.conversation_id}/stop`,
  ),
  sendMessage: httpPost<void, ISendMessageParams>(
    (p) => `/api/conversations/${p.conversation_id}/messages`,
    (p) => ({ input: p.input, msg_id: p.msg_id, files: p.files, loading_id: p.loading_id, injectSkills: p.injectSkills }),
  ),
  getSlashCommands: httpGet<
    { commands: SlashCommandItem[] },
    { conversation_id: string }
  >((p) => `/api/conversations/${p.conversation_id}/slash-commands`),
  askSideQuestion: httpPost<
    ConversationSideQuestionResult,
    { conversation_id: string; question: string }
  >(
    (p) => `/api/conversations/${p.conversation_id}/side-question`,
    (p) => ({ question: p.question }),
  ),
  confirmMessage: httpPost<void, IConfirmMessageParams>(
    (p) => `/api/conversations/${p.conversation_id}/confirmations/${p.callId}/confirm`,
    (p) => ({ confirmKey: p.confirmKey, msg_id: p.msg_id }),
  ),
  responseStream: wsEmitter<IResponseMessage>('message.stream'),
  turnCompleted: wsEmitter<IConversationTurnCompletedEvent>('turn.completed'),
  listChanged: wsEmitter<IConversationListChangedEvent>('conversation.listChanged'),
  getWorkspace: httpGet<
    IDirOrFile[],
    { conversation_id: string; workspace: string; path: string; search?: string }
  >((p) => `/api/conversations/${p.conversation_id}/workspace?workspace=${encodeURIComponent(p.workspace)}&path=${encodeURIComponent(p.path)}${p.search ? `&search=${encodeURIComponent(p.search)}` : ''}`),
  responseSearchWorkSpace: stubProvider<void, { file: number; dir: number; match?: IDirOrFile }>(
    'responseSearchWorkSpace',
    undefined as unknown as void,
  ),
  reloadContext: httpPost<void, { conversation_id: string }>(
    (p) => `/api/conversations/${p.conversation_id}/reload-context`,
  ),
  setConfig: httpPost<
    void,
    {
      conversation_id: string;
      config: { model?: string; thinking?: string; thinking_budget?: number; effort?: string };
    }
  >(
    (p) => `/api/conversations/${p.conversation_id}/config`,
    (p) => p.config,
  ),
  confirmation: {
    add: wsEmitter<IConfirmation<unknown> & { conversation_id: string }>('confirmation.add'),
    update: wsEmitter<IConfirmation<unknown> & { conversation_id: string }>('confirmation.update'),
    confirm: httpPost<
      void,
      { conversation_id: string; msg_id: string; data: unknown; callId: string }
    >(
      (p) => `/api/conversations/${p.conversation_id}/confirmations/${p.callId}/confirm`,
      (p) => ({ msg_id: p.msg_id, data: p.data }),
    ),
    list: httpGet<IConfirmation<unknown>[], { conversation_id: string }>(
      (p) => `/api/conversations/${p.conversation_id}/confirmations`,
    ),
    remove: wsEmitter<{ conversation_id: string; id: string }>('confirmation.remove'),
  },
  approval: {
    check: httpGet<boolean, { conversation_id: string; action: string; commandType?: string }>(
      (p) => `/api/conversations/${p.conversation_id}/approvals/check?action=${encodeURIComponent(p.action)}${p.commandType ? `&commandType=${encodeURIComponent(p.commandType)}` : ''}`,
    ),
  },
};

// Gemini — reuses unified conversation interface
export const geminiConversation = {
  sendMessage: conversation.sendMessage,
  confirmMessage: conversation.confirmMessage,
  responseStream: conversation.responseStream,
};

// ---------------------------------------------------------------------------
// CDP status / config types (used by application, stays IPC)
// ---------------------------------------------------------------------------

export interface ICdpStatus {
  enabled: boolean;
  port: number | null;
  startupEnabled: boolean;
  instances: Array<{
    pid: number;
    port: number;
    cwd: string;
    startTime: number;
  }>;
  configEnabled: boolean;
  isDevMode: boolean;
}

export interface ICdpConfig {
  enabled?: boolean;
  port?: number;
}

export interface IStartOnBootStatus {
  supported: boolean;
  enabled: boolean;
  isPackaged: boolean;
  platform: string;
}

// ---------------------------------------------------------------------------
// Application — stays IPC (Electron-native)
// ---------------------------------------------------------------------------

export const application = {
  restart: bridge.buildProvider<void, void>('restart-app'),
  openDevTools: bridge.buildProvider<boolean, void>('open-dev-tools'),
  isDevToolsOpened: bridge.buildProvider<boolean, void>('is-dev-tools-opened'),
  systemInfo: httpGet<
    { cacheDir: string; workDir: string; logDir: string; platform: string; arch: string },
    void
  >('/api/system/info'),
  getPath: bridge.buildProvider<string, { name: 'desktop' | 'home' | 'downloads' }>('app.get-path'),
  updateSystemInfo: httpPost<void, { cacheDir: string; workDir: string }>(
    '/api/system/info',
    (p) => p,
  ),
  getZoomFactor: bridge.buildProvider<number, void>('app.get-zoom-factor'),
  setZoomFactor: bridge.buildProvider<number, { factor: number }>('app.set-zoom-factor'),
  getCdpStatus: bridge.buildProvider<IBridgeResponse<ICdpStatus>, void>('app.get-cdp-status'),
  updateCdpConfig: bridge.buildProvider<IBridgeResponse<ICdpConfig>, Partial<ICdpConfig>>('app.update-cdp-config'),
  getStartOnBootStatus: bridge.buildProvider<IBridgeResponse<IStartOnBootStatus>, void>(
    'app.get-start-on-boot-status',
  ),
  setStartOnBoot: bridge.buildProvider<IBridgeResponse<IStartOnBootStatus>, { enabled: boolean }>(
    'app.set-start-on-boot',
  ),
  logStream: bridge.buildEmitter<{ level: 'log' | 'warn' | 'error'; tag: string; message: string; data?: unknown }>(
    'app.log-stream',
  ),
  devToolsStateChanged: bridge.buildEmitter<{ isOpen: boolean }>('app.devtools-state-changed'),
};

// ---------------------------------------------------------------------------
// Update — stays IPC (Electron-native auto-updater)
// ---------------------------------------------------------------------------

export const update = {
  open: bridge.buildEmitter<{ source?: 'menu' | 'about' }>('update.open'),
  check: bridge.buildProvider<IBridgeResponse<UpdateCheckResult>, UpdateCheckRequest>('update.check'),
  download: bridge.buildProvider<IBridgeResponse<UpdateDownloadResult>, UpdateDownloadRequest>('update.download'),
  downloadProgress: bridge.buildEmitter<UpdateDownloadProgressEvent>('update.download.progress'),
};

export const autoUpdate = {
  check: bridge.buildProvider<
    IBridgeResponse<{ updateInfo?: { version: string; releaseDate?: string; releaseNotes?: string } }>,
    { includePrerelease?: boolean }
  >('auto-update.check'),
  download: bridge.buildProvider<IBridgeResponse, void>('auto-update.download'),
  quitAndInstall: bridge.buildProvider<void, void>('auto-update.quit-and-install'),
  status: bridge.buildEmitter<AutoUpdateStatus>('auto-update.status'),
};

// ---------------------------------------------------------------------------
// Star Office — routed to backend
// ---------------------------------------------------------------------------

export const starOffice = {
  detectUrl: httpPost<
    { url: string | null },
    { preferredUrl?: string; force?: boolean; timeoutMs?: number }
  >('/api/star-office/detect'),
};

// ---------------------------------------------------------------------------
// Dialog — stays IPC (native file picker)
// ---------------------------------------------------------------------------

export const dialog = {
  showOpen: bridge.buildProvider<
    string[] | undefined,
    | { defaultPath?: string; properties?: OpenDialogOptions['properties']; filters?: OpenDialogOptions['filters'] }
    | undefined
  >('show-open'),
};

// ---------------------------------------------------------------------------
// File System — routed to /api/fs/* and /api/skills/*
// ---------------------------------------------------------------------------

export const fs = {
  getFilesByDir: httpPost<Array<IDirOrFile>, { dir: string; root: string }>('/api/fs/dir'),
  listWorkspaceFiles: httpPost<Array<IWorkspaceFlatFile>, { root: string }>('/api/fs/list'),
  getImageBase64: httpPost<string, { path: string }>('/api/fs/image-base64'),
  fetchRemoteImage: httpPost<string, { url: string }>('/api/fs/fetch-remote-image'),
  readFile: httpPost<string, { path: string }>('/api/fs/read'),
  readFileBuffer: httpPost<ArrayBuffer, { path: string }>('/api/fs/read-buffer'),
  createTempFile: httpPost<string, { fileName: string }>('/api/fs/temp'),
  createUploadFile: httpPost<string, { fileName: string; conversationId?: string }>('/api/fs/temp'),
  writeFile: httpPost<boolean, { path: string; data: Uint8Array | string }>('/api/fs/write'),
  createZip: httpPost<
    boolean,
    {
      path: string;
      requestId?: string;
      files: Array<{
        name: string;
        content?: string | Uint8Array;
        sourcePath?: string;
      }>;
    }
  >('/api/fs/zip'),
  cancelZip: httpPost<boolean, { requestId: string }>('/api/fs/zip/cancel'),
  getFileMetadata: httpPost<IFileMetadata, { path: string }>('/api/fs/metadata'),
  copyFilesToWorkspace: httpPost<
    { copiedFiles: string[]; failedFiles?: Array<{ path: string; error: string }> },
    { filePaths: string[]; workspace: string; sourceRoot?: string }
  >('/api/fs/copy'),
  removeEntry: httpPost<void, { path: string }>('/api/fs/remove'),
  renameEntry: httpPost<{ newPath: string }, { path: string; newName: string }>('/api/fs/rename'),
  readBuiltinRule: httpPost<string, { fileName: string }>('/api/skills/builtin-rule'),
  readBuiltinSkill: httpPost<string, { fileName: string }>('/api/skills/builtin-skill'),
  readAssistantRule: httpPost<string, { assistantId: string; locale?: string }>('/api/skills/assistant-rule/read'),
  writeAssistantRule: httpPost<boolean, { assistantId: string; content: string; locale?: string }>(
    '/api/skills/assistant-rule/write',
  ),
  deleteAssistantRule: httpDelete<boolean, { assistantId: string }>(
    (p) => `/api/skills/assistant-rule/${p.assistantId}`,
  ),
  readAssistantSkill: httpPost<string, { assistantId: string; locale?: string }>('/api/skills/assistant-skill/read'),
  writeAssistantSkill: httpPost<boolean, { assistantId: string; content: string; locale?: string }>(
    '/api/skills/assistant-skill/write',
  ),
  deleteAssistantSkill: httpDelete<boolean, { assistantId: string }>(
    (p) => `/api/skills/assistant-skill/${p.assistantId}`,
  ),
  listAvailableSkills: httpGet<
    Array<{
      name: string;
      description: string;
      location: string;
      isCustom: boolean;
      source: 'builtin' | 'custom' | 'extension';
    }>,
    void
  >('/api/skills'),
  listBuiltinAutoSkills: httpGet<Array<{ name: string; description: string }>, void>('/api/skills/builtin-auto'),
  readSkillInfo: httpPost<{ name: string; description: string }, { skillPath: string }>(
    '/api/skills/info',
  ),
  importSkill: httpPost<{ skillName: string }, { skillPath: string }>('/api/skills/import'),
  scanForSkills: httpPost<
    Array<{ name: string; description: string; path: string }>,
    { folderPath: string }
  >('/api/skills/scan'),
  detectCommonSkillPaths: httpGet<Array<{ name: string; path: string }>, void>(
    '/api/skills/detect-paths',
  ),
  detectAndCountExternalSkills: httpGet<
    Array<{
      name: string;
      path: string;
      source: string;
      skills: Array<{ name: string; description: string; path: string }>;
    }>,
    void
  >('/api/skills/detect-external'),
  importSkillWithSymlink: httpPost<{ skillName: string }, { skillPath: string }>(
    '/api/skills/import-symlink',
  ),
  deleteSkill: httpDelete<void, { skillName: string }>((p) => `/api/skills/${p.skillName}`),
  getSkillPaths: httpGet<{ userSkillsDir: string; builtinSkillsDir: string }, void>('/api/skills/paths'),
  exportSkillWithSymlink: httpPost<void, { skillPath: string; targetDir: string }>(
    '/api/skills/export-symlink',
  ),
  getCustomExternalPaths: httpGet<Array<{ name: string; path: string }>, void>('/api/skills/external-paths'),
  addCustomExternalPath: httpPost<void, { name: string; path: string }>('/api/skills/external-paths'),
  removeCustomExternalPath: httpDelete<void, { path: string }>(
    (p) => `/api/skills/external-paths?path=${encodeURIComponent(p.path)}`,
  ),
  enableSkillsMarket: httpPost<void, void>('/api/skills/market/enable'),
  disableSkillsMarket: httpPost<void, void>('/api/skills/market/disable'),
};

// ---------------------------------------------------------------------------
// Speech to Text — routed to backend
// ---------------------------------------------------------------------------

export const speechToText = {
  transcribe: httpPost<SpeechToTextResult, SpeechToTextRequest>('/api/stt'),
};

// ---------------------------------------------------------------------------
// File Watch — routed to /api/fs/watch/*
// ---------------------------------------------------------------------------

export const fileWatch = {
  startWatch: httpPost<void, { filePath: string }>('/api/fs/watch/start'),
  stopWatch: httpPost<void, { filePath: string }>('/api/fs/watch/stop'),
  stopAllWatches: httpPost<void, void>('/api/fs/watch/stop-all'),
  fileChanged: wsEmitter<{ filePath: string; eventType: string }>('fileWatch.fileChanged'),
};

// Workspace Office file scan
export const workspaceOfficeWatch = {
  scan: httpPost<string[], { workspace: string }>('/api/fs/office-watch/start'),
};

// File streaming updates (real-time content push when agent writes)
export const fileStream = {
  contentUpdate: wsEmitter<{
    filePath: string;
    content: string;
    workspace: string;
    relativePath: string;
    operation: 'write' | 'delete';
  }>('fileStream.contentUpdate'),
};

// File snapshot providers
export const fileSnapshot = {
  init: httpPost<import('@/common/types/fileSnapshot').SnapshotInfo, { workspace: string }>(
    '/api/fs/snapshot/init',
  ),
  compare: httpPost<import('@/common/types/fileSnapshot').CompareResult, { workspace: string }>(
    '/api/fs/snapshot/compare',
  ),
  getBaselineContent: httpPost<string | null, { workspace: string; filePath: string }>(
    '/api/fs/snapshot/baseline',
  ),
  getInfo: httpPost<import('@/common/types/fileSnapshot').SnapshotInfo, { workspace: string }>(
    '/api/fs/snapshot/info',
  ),
  dispose: httpPost<void, { workspace: string }>('/api/fs/snapshot/dispose'),
  stageFile: httpPost<void, { workspace: string; filePath: string }>('/api/fs/snapshot/stage'),
  stageAll: httpPost<void, { workspace: string }>('/api/fs/snapshot/stage-all'),
  unstageFile: httpPost<void, { workspace: string; filePath: string }>('/api/fs/snapshot/unstage'),
  unstageAll: httpPost<void, { workspace: string }>('/api/fs/snapshot/unstage-all'),
  discardFile: httpPost<
    void,
    { workspace: string; filePath: string; operation: import('@/common/types/fileSnapshot').FileChangeOperation }
  >('/api/fs/snapshot/discard'),
  resetFile: httpPost<
    void,
    { workspace: string; filePath: string; operation: import('@/common/types/fileSnapshot').FileChangeOperation }
  >('/api/fs/snapshot/reset'),
  getBranches: httpPost<string[], { workspace: string }>('/api/fs/snapshot/branches'),
};

// ---------------------------------------------------------------------------
// Google Auth — stubbed (Electron-native OAuth flow)
// ---------------------------------------------------------------------------

export const googleAuth = {
  login: stubProvider<IBridgeResponse<{ account: string }>, { proxy?: string }>(
    'googleAuth.login',
    { success: false, msg: 'Google Auth not available in backend mode' },
  ),
  logout: stubProvider<void, {}>('googleAuth.logout', undefined as unknown as void),
  status: stubProvider<IBridgeResponse<{ account: string }>, { proxy?: string }>(
    'googleAuth.status',
    { success: false, msg: 'Google Auth not available in backend mode' },
  ),
};

// ---------------------------------------------------------------------------
// Gemini subscription status
// ---------------------------------------------------------------------------

export const gemini = {
  subscriptionStatus: httpGet<
    { isSubscriber: boolean; tier?: string; lastChecked: number; message?: string },
    { proxy?: string }
  >('/api/gemini/subscription-status'),
};

// ---------------------------------------------------------------------------
// Bedrock connection test
// ---------------------------------------------------------------------------

export const bedrock = {
  testConnection: httpPost<
    { msg?: string },
    {
      bedrockConfig: {
        authMethod: 'accessKey' | 'profile';
        region: string;
        accessKeyId?: string;
        secretAccessKey?: string;
        profile?: string;
      };
    }
  >('/api/bedrock/test-connection'),
};

// ---------------------------------------------------------------------------
// Mode (Provider management) — routed to /api/providers/*
// ---------------------------------------------------------------------------

export const mode = {
  fetchModelList: httpPost<
    { mode: Array<string | { id: string; name: string }>; fix_base_url?: string },
    {
      base_url?: string;
      api_key: string;
      try_fix?: boolean;
      platform?: string;
      bedrockConfig?: {
        authMethod: 'accessKey' | 'profile';
        region: string;
        accessKeyId?: string;
        secretAccessKey?: string;
        profile?: string;
      };
    }
  >('/api/providers/fetch-models'),
  saveModelConfig: httpPost<void, IProvider[]>('/api/providers/batch'),
  getModelConfig: httpGet<IProvider[], void>('/api/providers'),
  detectProtocol: httpPost<ProtocolDetectionResponse, ProtocolDetectionRequest>(
    '/api/providers/detect-protocol',
  ),
};

// ---------------------------------------------------------------------------
// ACP Conversation — routed to /api/acp/* + conversation routes
// ---------------------------------------------------------------------------

export const acpConversation = {
  sendMessage: conversation.sendMessage,
  responseStream: conversation.responseStream,
  detectCliPath: httpPost<{ path?: string }, { backend: string }>('/api/acp/detect-cli'),
  getAvailableAgents: httpGet<
    Array<{
      backend: string;
      name: string;
      kind?: string;
      cliPath?: string;
      supportedTransports?: string[];
      isExtension?: boolean;
      extensionName?: string;
      isPreset?: boolean;
      customAgentId?: string;
    }>,
    void
  >('/api/acp/agents'),
  checkEnv: httpGet<{ env: Record<string, string> }, void>('/api/acp/env'),
  refreshCustomAgents: httpPost<void, void>('/api/acp/agents/refresh'),
  testCustomAgent: httpPost<
    { step: 'cli_check' | 'acp_initialize'; error?: string },
    { command: string; acpArgs?: string[]; env?: Record<string, string> }
  >('/api/acp/agents/test'),
  checkAgentHealth: httpPost<
    { available: boolean; latency?: number; error?: string },
    { backend: AgentBackend }
  >('/api/acp/health-check'),
  setMode: httpPut<void, { conversationId: string; mode: string }>(
    (p) => `/api/conversations/${p.conversationId}/acp/mode`,
    (p) => ({ mode: p.mode }),
  ),
  getMode: httpGet<{ mode: string; initialized: boolean }, { conversationId: string }>(
    (p) => `/api/conversations/${p.conversationId}/acp/mode`,
  ),
  getModelInfo: httpGet<{ modelInfo: AcpModelInfo | null }, { conversationId: string }>(
    (p) => `/api/conversations/${p.conversationId}/acp/model`,
  ),
  setModel: httpPut<
    void,
    { conversationId: string; modelId: string }
  >(
    (p) => `/api/conversations/${p.conversationId}/acp/model`,
    (p) => ({ modelId: p.modelId }),
  ),
  getConfigOptions: httpGet<
    { configOptions: import('../types/acpTypes').AcpSessionConfigOption[] },
    { conversationId: string }
  >((p) => `/api/conversations/${p.conversationId}/acp/config`),
  setConfigOption: httpPut<
    void,
    { conversationId: string; configId: string; value: string }
  >(
    (p) => `/api/conversations/${p.conversationId}/acp/config/${p.configId}`,
    (p) => ({ value: p.value }),
  ),
};

// ---------------------------------------------------------------------------
// MCP Service — routed to /api/mcp/*
// ---------------------------------------------------------------------------

export const mcpService = {
  getAgentMcpConfigs: httpGet<
    Array<{ source: McpSource; servers: IMcpServer[] }>,
    Array<{ backend: string; name: string; cliPath?: string }>
  >('/api/mcp/agent-configs'),
  testMcpConnection: httpPost<
    {
      success: boolean;
      tools?: Array<{ name: string; description?: string; _meta?: Record<string, unknown> }>;
      error?: string;
      needsAuth?: boolean;
      authMethod?: 'oauth' | 'basic';
      wwwAuthenticate?: string;
    },
    IMcpServer
  >('/api/mcp/test-connection'),
  syncMcpToAgents: httpPost<
    { success: boolean; results: Array<{ agent: string; success: boolean; error?: string }> },
    { mcpServers: IMcpServer[]; agents: Array<{ backend: string; name: string; cliPath?: string }> }
  >('/api/mcp/sync-to-agents'),
  removeMcpFromAgents: httpPost<
    { success: boolean; results: Array<{ agent: string; success: boolean; error?: string }> },
    { mcpServerName: string; agents: Array<{ backend: string; name: string; cliPath?: string }> }
  >('/api/mcp/remove-from-agents'),
  checkOAuthStatus: httpPost<
    { isAuthenticated: boolean; needsLogin: boolean; error?: string },
    IMcpServer
  >('/api/mcp/oauth/check-status'),
  loginMcpOAuth: httpPost<
    { success: boolean; error?: string },
    { server: IMcpServer; config?: unknown }
  >('/api/mcp/oauth/login'),
  logoutMcpOAuth: httpPost<void, string>('/api/mcp/oauth/logout', (serverName) => ({ serverName })),
  getAuthenticatedServers: httpGet<string[], void>('/api/mcp/oauth/authenticated'),
};

// ---------------------------------------------------------------------------
// Codex / OpenClaw — reuse unified conversation interface
// ---------------------------------------------------------------------------

export const codexConversation = {
  sendMessage: conversation.sendMessage,
  responseStream: conversation.responseStream,
};

export const openclawConversation = {
  sendMessage: conversation.sendMessage,
  responseStream: conversation.responseStream,
  getRuntime: httpGet<
    {
      conversationId: string;
      runtime: {
        workspace?: string;
        backend?: string;
        agentName?: string;
        cliPath?: string;
        model?: string;
        sessionKey?: string | null;
        isConnected?: boolean;
        hasActiveSession?: boolean;
        identityHash?: string | null;
      };
      expected?: {
        expectedWorkspace?: string;
        expectedBackend?: string;
        expectedAgentName?: string;
        expectedCliPath?: string;
        expectedModel?: string;
        expectedIdentityHash?: string | null;
        switchedAt?: number;
      };
    },
    { conversation_id: string }
  >((p) => `/api/conversations/${p.conversation_id}/openclaw/runtime`),
};

// ---------------------------------------------------------------------------
// Remote Agent — routed to /api/remote-agents/*
// ---------------------------------------------------------------------------

export const remoteAgent = {
  list: httpGet<import('@process/agent/remote/types').RemoteAgentConfig[], void>('/api/remote-agents'),
  get: httpGet<import('@process/agent/remote/types').RemoteAgentConfig | null, { id: string }>(
    (p) => `/api/remote-agents/${p.id}`,
  ),
  create: httpPost<
    import('@process/agent/remote/types').RemoteAgentConfig,
    import('@process/agent/remote/types').RemoteAgentInput
  >('/api/remote-agents'),
  update: httpPut<
    boolean,
    { id: string; updates: Partial<import('@process/agent/remote/types').RemoteAgentInput> }
  >(
    (p) => `/api/remote-agents/${p.id}`,
    (p) => p.updates,
  ),
  delete: httpDelete<boolean, { id: string }>((p) => `/api/remote-agents/${p.id}`),
  testConnection: httpPost<
    { success: boolean; error?: string },
    { url: string; authType: string; authToken?: string; allowInsecure?: boolean }
  >('/api/remote-agents/test-connection'),
  handshake: httpPost<{ status: 'ok' | 'pending_approval' | 'error'; error?: string }, { id: string }>(
    (p) => `/api/remote-agents/${p.id}/handshake`,
  ),
};

// ---------------------------------------------------------------------------
// Database — routed to conversation/message endpoints
// ---------------------------------------------------------------------------

export type PaginatedResult<T> = {
  items: T[];
  total: number;
  hasMore: boolean;
};

export const database = {
  getConversationMessages: httpGet<
    PaginatedResult<import('@/common/chat/chatLib').TMessage>,
    { conversation_id: string; page?: number; pageSize?: number }
  >(
    (p) => `/api/conversations/${p.conversation_id}/messages?page=${p.page ?? 1}&pageSize=${p.pageSize ?? 50}`,
  ),
  getUserConversations: httpGet<
    PaginatedResult<import('@/common/config/storage').TChatConversation>,
    { cursor?: string; limit?: number }
  >(
    (p) => {
      const params = new URLSearchParams();
      if (p.cursor) params.set('cursor', p.cursor);
      if (p.limit) params.set('limit', String(p.limit));
      const qs = params.toString();
      return `/api/conversations${qs ? `?${qs}` : ''}`;
    },
  ),
  searchConversationMessages: httpGet<
    PaginatedResult<import('../types/database').IMessageSearchItem>,
    { keyword: string; page?: number; pageSize?: number }
  >(
    (p) => `/api/messages/search?keyword=${encodeURIComponent(p.keyword)}&page=${p.page ?? 1}&pageSize=${p.pageSize ?? 50}`,
  ),
};

// ---------------------------------------------------------------------------
// Preview History — routed to /api/preview-history/*
// ---------------------------------------------------------------------------

export const previewHistory = {
  list: httpPost<PreviewSnapshotInfo[], { target: PreviewHistoryTarget }>('/api/preview-history/list'),
  save: httpPost<PreviewSnapshotInfo, { target: PreviewHistoryTarget; content: string }>(
    '/api/preview-history/save',
  ),
  getContent: httpPost<
    { snapshot: PreviewSnapshotInfo; content: string } | null,
    { target: PreviewHistoryTarget; snapshotId: string }
  >('/api/preview-history/get-content'),
};

// Preview panel
export const preview = {
  open: wsEmitter<{
    content: string;
    contentType: import('../types/preview').PreviewContentType;
    metadata?: {
      title?: string;
      fileName?: string;
    };
  }>('preview.open'),
};

// ---------------------------------------------------------------------------
// Document conversion
// ---------------------------------------------------------------------------

export const document = {
  convert: httpPost<
    import('../types/conversion').DocumentConversionResponse,
    import('../types/conversion').DocumentConversionRequest
  >('/api/document/convert'),
};

// ---------------------------------------------------------------------------
// Office Previews — routed to /api/*-preview/*
// ---------------------------------------------------------------------------

export const pptPreview = {
  start: httpPost<{ url: string }, { filePath: string }>('/api/ppt-preview/start'),
  stop: httpPost<void, { filePath: string }>('/api/ppt-preview/stop'),
  status: wsEmitter<{ state: 'starting' | 'installing' | 'ready' | 'error'; message?: string }>(
    'ppt-preview.status',
  ),
};

export const wordPreview = {
  start: httpPost<{ url: string }, { filePath: string }>('/api/word-preview/start'),
  stop: httpPost<void, { filePath: string }>('/api/word-preview/stop'),
  status: wsEmitter<{ state: 'starting' | 'installing' | 'ready' | 'error'; message?: string }>(
    'word-preview.status',
  ),
};

export const excelPreview = {
  start: httpPost<{ url: string }, { filePath: string }>('/api/excel-preview/start'),
  stop: httpPost<void, { filePath: string }>('/api/excel-preview/stop'),
  status: wsEmitter<{ state: 'starting' | 'installing' | 'ready' | 'error'; message?: string }>(
    'excel-preview.status',
  ),
};

// ---------------------------------------------------------------------------
// Deep Link — stays IPC (Electron protocol handler)
// ---------------------------------------------------------------------------

export const deepLink = {
  received: bridge.buildEmitter<{
    action: string;
    params: Record<string, string>;
  }>('deep-link.received'),
};

// ---------------------------------------------------------------------------
// Window Controls — stays IPC (Electron-native)
// ---------------------------------------------------------------------------

export const windowControls = {
  minimize: bridge.buildProvider<void, void>('window-controls:minimize'),
  maximize: bridge.buildProvider<void, void>('window-controls:maximize'),
  unmaximize: bridge.buildProvider<void, void>('window-controls:unmaximize'),
  close: bridge.buildProvider<void, void>('window-controls:close'),
  isMaximized: bridge.buildProvider<boolean, void>('window-controls:is-maximized'),
  maximizedChanged: bridge.buildEmitter<{ isMaximized: boolean }>('window-controls:maximized-changed'),
};

// ---------------------------------------------------------------------------
// System Settings — routed to /api/settings/*
// ---------------------------------------------------------------------------

export const systemSettings = {
  getCloseToTray: httpGet<boolean, void>('/api/settings/client?key=closeToTray'),
  setCloseToTray: httpPut<void, { enabled: boolean }>(
    '/api/settings/client',
    (p) => ({ closeToTray: p.enabled }),
  ),
  getNotificationEnabled: httpGet<boolean, void>('/api/settings/client?key=notificationEnabled'),
  setNotificationEnabled: httpPut<void, { enabled: boolean }>(
    '/api/settings/client',
    (p) => ({ notificationEnabled: p.enabled }),
  ),
  getCronNotificationEnabled: httpGet<boolean, void>('/api/settings/client?key=cronNotificationEnabled'),
  setCronNotificationEnabled: httpPut<void, { enabled: boolean }>(
    '/api/settings/client',
    (p) => ({ cronNotificationEnabled: p.enabled }),
  ),
  getKeepAwake: httpGet<boolean, void>('/api/settings/client?key=keepAwake'),
  setKeepAwake: httpPut<void, { enabled: boolean }>(
    '/api/settings/client',
    (p) => ({ keepAwake: p.enabled }),
  ),
  changeLanguage: httpPatch<void, { language: string }>(
    '/api/settings',
    (p) => ({ language: p.language }),
  ),
  languageChanged: wsEmitter<{ language: string }>('system-settings:language-changed'),
  getSaveUploadToWorkspace: httpGet<boolean, void>('/api/settings/client?key=saveUploadToWorkspace'),
  setSaveUploadToWorkspace: httpPut<void, { enabled: boolean }>(
    '/api/settings/client',
    (p) => ({ saveUploadToWorkspace: p.enabled }),
  ),
  getAutoPreviewOfficeFiles: httpGet<boolean, void>('/api/settings/client?key=autoPreviewOfficeFiles'),
  setAutoPreviewOfficeFiles: httpPut<void, { enabled: boolean }>(
    '/api/settings/client',
    (p) => ({ autoPreviewOfficeFiles: p.enabled }),
  ),
  getPetEnabled: httpGet<boolean, void>('/api/settings/client?key=petEnabled'),
  setPetEnabled: httpPut<void, { enabled: boolean }>(
    '/api/settings/client',
    (p) => ({ petEnabled: p.enabled }),
  ),
  getPetSize: httpGet<number, void>('/api/settings/client?key=petSize'),
  setPetSize: httpPut<void, { size: number }>(
    '/api/settings/client',
    (p) => ({ petSize: p.size }),
  ),
  getPetDnd: httpGet<boolean, void>('/api/settings/client?key=petDnd'),
  setPetDnd: httpPut<void, { dnd: boolean }>(
    '/api/settings/client',
    (p) => ({ petDnd: p.dnd }),
  ),
  getPetConfirmEnabled: httpGet<boolean, void>('/api/settings/client?key=petConfirmEnabled'),
  setPetConfirmEnabled: httpPut<void, { enabled: boolean }>(
    '/api/settings/client',
    (p) => ({ petConfirmEnabled: p.enabled }),
  ),
};

// ---------------------------------------------------------------------------
// Notification — stays IPC (Electron-native Notification API)
// ---------------------------------------------------------------------------

export type INotificationOptions = {
  title: string;
  body: string;
  icon?: string;
  conversationId?: string;
};

export const notification = {
  show: bridge.buildProvider<void, INotificationOptions>('notification.show'),
  clicked: bridge.buildEmitter<{ conversationId?: string }>('notification.clicked'),
};

// ---------------------------------------------------------------------------
// Task management — stubbed (internal process management)
// ---------------------------------------------------------------------------

export const task = {
  stopAll: stubProvider<{ success: boolean; count: number }, void>(
    'task.stopAll',
    { success: true, count: 0 },
  ),
  getRunningCount: stubProvider<{ success: boolean; count: number }, void>(
    'task.getRunningCount',
    { success: true, count: 0 },
  ),
};

// ---------------------------------------------------------------------------
// WebUI — routed to backend
// ---------------------------------------------------------------------------

export interface IWebUIStatus {
  running: boolean;
  port: number;
  allowRemote: boolean;
  localUrl: string;
  networkUrl?: string;
  lanIP?: string;
  adminUsername: string;
  initialPassword?: string;
}

export const webui = {
  getStatus: httpGet<IWebUIStatus, void>('/api/webui/status'),
  start: httpPost<
    { port: number; localUrl: string; networkUrl?: string; lanIP?: string; initialPassword?: string },
    { port?: number; allowRemote?: boolean }
  >('/api/webui/start'),
  stop: httpPost<void, void>('/api/webui/stop'),
  changePassword: httpPost<void, { newPassword: string }>('/api/webui/change-password'),
  changeUsername: httpPost<{ username: string }, { newUsername: string }>(
    '/api/webui/change-username',
  ),
  resetPassword: httpPost<{ newPassword: string }, void>('/api/webui/reset-password'),
  generateQRToken: httpPost<{ token: string; expiresAt: number; qrUrl: string }, void>(
    '/api/webui/generate-qr-token',
  ),
  verifyQRToken: httpPost<{ sessionToken: string; username: string }, { qrToken: string }>(
    '/api/webui/verify-qr-token',
  ),
  statusChanged: wsEmitter<{ running: boolean; port?: number; localUrl?: string; networkUrl?: string }>(
    'webui.status-changed',
  ),
  resetPasswordResult: wsEmitter<{ success: boolean; newPassword?: string; msg?: string }>(
    'webui.reset-password-result',
  ),
};

// ---------------------------------------------------------------------------
// Cron — routed to /api/cron/*
// ---------------------------------------------------------------------------

export const cron = {
  listJobs: httpGet<ICronJob[], void>('/api/cron/jobs'),
  listJobsByConversation: httpGet<ICronJob[], { conversationId: string }>(
    (p) => `/api/cron/jobs?conversationId=${encodeURIComponent(p.conversationId)}`,
  ),
  getJob: httpGet<ICronJob | null, { jobId: string }>((p) => `/api/cron/jobs/${p.jobId}`),
  addJob: httpPost<ICronJob, ICreateCronJobParams>('/api/cron/jobs'),
  updateJob: httpPut<ICronJob, { jobId: string; updates: Partial<ICronJob> }>(
    (p) => `/api/cron/jobs/${p.jobId}`,
    (p) => p.updates,
  ),
  removeJob: httpDelete<void, { jobId: string }>((p) => `/api/cron/jobs/${p.jobId}`),
  runNow: httpPost<{ conversationId: string }, { jobId: string }>((p) => `/api/cron/jobs/${p.jobId}/run`),
  saveSkill: httpPost<void, { jobId: string; content: string }>(
    (p) => `/api/cron/jobs/${p.jobId}/skill`,
    (p) => ({ content: p.content }),
  ),
  hasSkill: httpGet<boolean, { jobId: string }>((p) => `/api/cron/jobs/${p.jobId}/skill`),
  onJobCreated: wsEmitter<ICronJob>('cron.job-created'),
  onJobUpdated: wsEmitter<ICronJob>('cron.job-updated'),
  onJobRemoved: wsEmitter<{ jobId: string }>('cron.job-removed'),
  onJobExecuted: wsEmitter<{ jobId: string; status: 'ok' | 'error' | 'skipped' | 'missed'; error?: string }>(
    'cron.job-executed',
  ),
};

// ---------------------------------------------------------------------------
// Cron types (re-exported for consumers)
// ---------------------------------------------------------------------------

export type ICronSchedule =
  | { kind: 'at'; atMs: number; description: string }
  | { kind: 'every'; everyMs: number; description: string }
  | { kind: 'cron'; expr: string; tz?: string; description: string };

export interface ICronJob {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  schedule: ICronSchedule;
  target: {
    payload: { kind: 'message'; text: string };
    executionMode?: 'existing' | 'new_conversation';
  };
  metadata: {
    conversationId: string;
    conversationTitle?: string;
    agentType: AgentBackend;
    createdBy: 'user' | 'agent';
    createdAt: number;
    updatedAt: number;
    agentConfig?: ICronAgentConfig;
  };
  state: {
    nextRunAtMs?: number;
    lastRunAtMs?: number;
    lastStatus?: 'ok' | 'error' | 'skipped' | 'missed';
    lastError?: string;
    runCount: number;
    retryCount: number;
    maxRetries: number;
  };
}

export interface ICronAgentConfig {
  backend: AgentBackend;
  name: string;
  cliPath?: string;
  isPreset?: boolean;
  customAgentId?: string;
  presetAgentType?: string;
  mode?: string;
  modelId?: string;
  configOptions?: Record<string, string>;
  workspace?: string;
}

export interface ICreateCronJobParams {
  name: string;
  description?: string;
  schedule: ICronSchedule;
  prompt?: string;
  message?: string;
  conversationId: string;
  conversationTitle?: string;
  agentType: AgentBackend;
  createdBy: 'user' | 'agent';
  executionMode?: 'existing' | 'new_conversation';
  agentConfig?: ICronAgentConfig;
}

// ---------------------------------------------------------------------------
// Shared types (re-exported for consumers)
// ---------------------------------------------------------------------------

interface ISendMessageParams {
  input: string;
  msg_id: string;
  conversation_id: string;
  files?: string[];
  loading_id?: string;
  injectSkills?: string[];
}

export interface IConfirmMessageParams {
  confirmKey: string;
  msg_id: string;
  conversation_id: string;
  callId: string;
}

export interface ICreateConversationParams {
  type: 'gemini' | 'acp' | 'codex' | 'openclaw-gateway' | 'nanobot' | 'remote' | 'aionrs';
  id?: string;
  name?: string;
  model: TProviderWithModel;
  extra: {
    workspace?: string;
    customWorkspace?: boolean;
    defaultFiles?: string[];
    backend?: AgentBackend;
    cliPath?: string;
    webSearchEngine?: 'google' | 'default';
    agentName?: string;
    customAgentId?: string;
    context?: string;
    contextFileName?: string;
    presetRules?: string;
    enabledSkills?: string[];
    presetContext?: string;
    presetAssistantId?: string;
    sessionMode?: string;
    codexModel?: string;
    currentModelId?: string;
    cachedConfigOptions?: import('../types/acpTypes').AcpSessionConfigOption[];
    pendingConfigOptions?: Record<string, string>;
    runtimeValidation?: {
      expectedWorkspace?: string;
      expectedBackend?: string;
      expectedAgentName?: string;
      expectedCliPath?: string;
      expectedModel?: string;
      expectedIdentityHash?: string | null;
      switchedAt?: number;
    };
    isHealthCheck?: boolean;
    remoteAgentId?: string;
    extraSkillPaths?: string[];
    excludeBuiltinSkills?: string[];
    teamId?: string;
  };
}

interface IResetConversationParams {
  id?: string;
  gemini?: {
    clearCachedCredentialFile?: boolean;
  };
}

export interface IDirOrFile {
  name: string;
  fullPath: string;
  relativePath: string;
  isDir: boolean;
  isFile: boolean;
  children?: Array<IDirOrFile>;
}

export interface IFileMetadata {
  name: string;
  path: string;
  size: number;
  type: string;
  lastModified: number;
  isDirectory?: boolean;
}

export type IWorkspaceFlatFile = {
  name: string;
  fullPath: string;
  relativePath: string;
};

export interface IResponseMessage {
  type: string;
  data: unknown;
  msg_id: string;
  conversation_id: string;
  hidden?: boolean;
}

export interface IConversationTurnCompletedEvent {
  sessionId: string;
  status: 'pending' | 'running' | 'finished';
  state:
    | 'ai_generating'
    | 'ai_waiting_input'
    | 'ai_waiting_confirmation'
    | 'initializing'
    | 'stopped'
    | 'error'
    | 'unknown';
  detail: string;
  canSendMessage: boolean;
  runtime: {
    hasTask: boolean;
    taskStatus?: 'pending' | 'running' | 'finished';
    isProcessing: boolean;
    pendingConfirmations: number;
    dbStatus?: 'pending' | 'running' | 'finished';
  };
  workspace: string;
  model: {
    platform: string;
    name: string;
    useModel: string;
  };
  lastMessage: {
    id?: string;
    type?: string;
    content: unknown;
    status?: string | null;
    createdAt: number;
  };
}

export interface IConversationListChangedEvent {
  conversationId: string;
  action: 'created' | 'updated' | 'deleted';
  source?: string;
}

export type ConversationSideQuestionResult =
  | { status: 'ok'; answer: string }
  | { status: 'noAnswer' }
  | { status: 'unsupported' }
  | { status: 'invalid'; reason: 'emptyQuestion' }
  | { status: 'toolsRequired' };

interface IBridgeResponse<D = {}> {
  success: boolean;
  data?: D;
  msg?: string;
}

// ---------------------------------------------------------------------------
// Extensions API
// ---------------------------------------------------------------------------

export interface IExtensionInfo {
  name: string;
  displayName: string;
  version: string;
  description?: string;
  source: string;
  directory: string;
  enabled: boolean;
  riskLevel: 'safe' | 'moderate' | 'dangerous';
  hasLifecycle: boolean;
}

export interface IExtensionPermissionSummary {
  name: string;
  description: string;
  level: 'safe' | 'moderate' | 'dangerous';
  granted: boolean;
}

export interface IExtensionSettingsTab {
  id: string;
  name: string;
  icon?: string;
  entryUrl: string;
  position?: { anchor: string; placement: 'before' | 'after' };
  order: number;
  _extensionName: string;
}

export interface IExtensionWebuiContribution {
  extensionName: string;
  apiRoutes: Array<{ path: string; auth: boolean }>;
  staticAssets: Array<{ urlPrefix: string; directory: string }>;
}

export type AgentActivityState = 'idle' | 'writing' | 'researching' | 'executing' | 'syncing' | 'error';

export interface IExtensionAgentActivityEvent {
  conversationId: string;
  at: number;
  kind: 'status' | 'tool' | 'message';
  text: string;
}

export interface IExtensionAgentActivityItem {
  id: string;
  backend: string;
  agentName: string;
  state: AgentActivityState;
  runtimeStatus: 'pending' | 'running' | 'finished' | 'unknown';
  conversations: number;
  activeConversations: number;
  lastActiveAt: number;
  lastStatus?: string;
  currentTask?: string;
  recentEvents: IExtensionAgentActivityEvent[];
}

export interface IExtensionAgentActivitySnapshot {
  generatedAt: number;
  totalConversations: number;
  runningConversations: number;
  agents: IExtensionAgentActivityItem[];
}

export const extensions = {
  getThemes: httpGet<ICssTheme[], void>('/api/extensions/themes'),
  getLoadedExtensions: httpGet<IExtensionInfo[], void>('/api/extensions'),
  getAssistants: httpGet<Record<string, unknown>[], void>('/api/extensions/assistants'),
  getAgents: httpGet<Record<string, unknown>[], void>('/api/extensions/agents'),
  getAcpAdapters: httpGet<Record<string, unknown>[], void>('/api/extensions/acp-adapters'),
  getMcpServers: httpGet<Record<string, unknown>[], void>('/api/extensions/mcp-servers'),
  getSkills: httpGet<Array<{ name: string; description: string; location: string }>, void>(
    '/api/extensions/skills',
  ),
  getSettingsTabs: httpGet<IExtensionSettingsTab[], void>('/api/extensions/settings-tabs'),
  getWebuiContributions: httpGet<IExtensionWebuiContribution[], void>('/api/extensions/webui'),
  getAgentActivitySnapshot: httpGet<IExtensionAgentActivitySnapshot, void>('/api/extensions/agent-activity'),
  getExtI18nForLocale: httpPost<Record<string, unknown>, { locale: string }>('/api/extensions/i18n'),
  enableExtension: httpPost<void, { name: string }>('/api/extensions/enable'),
  disableExtension: httpPost<void, { name: string; reason?: string }>('/api/extensions/disable'),
  getPermissions: httpPost<IExtensionPermissionSummary[], { name: string }>('/api/extensions/permissions'),
  getRiskLevel: httpPost<string, { name: string }>('/api/extensions/risk-level'),
  stateChanged: wsEmitter<{ name: string; enabled: boolean; reason?: string }>('extensions.state-changed'),
};

// ---------------------------------------------------------------------------
// Channel API — routed to /api/channel/*
// ---------------------------------------------------------------------------

import type {
  IChannelPairingRequest,
  IChannelPluginStatus,
  IChannelSession,
  IChannelUser,
} from '@process/channels/types';

export const channel = {
  getPluginStatus: httpGet<IChannelPluginStatus[], void>('/api/channel/plugins'),
  enablePlugin: httpPost<void, { pluginId: string; config: Record<string, unknown> }>(
    '/api/channel/plugins/enable',
  ),
  disablePlugin: httpPost<void, { pluginId: string }>('/api/channel/plugins/disable'),
  testPlugin: httpPost<
    { success: boolean; botUsername?: string; error?: string },
    { pluginId: string; token: string; extraConfig?: { appId?: string; appSecret?: string } }
  >('/api/channel/plugins/test'),
  getPendingPairings: httpGet<IChannelPairingRequest[], void>('/api/channel/pairings'),
  approvePairing: httpPost<void, { code: string }>('/api/channel/pairings/approve'),
  rejectPairing: httpPost<void, { code: string }>('/api/channel/pairings/reject'),
  getAuthorizedUsers: httpGet<IChannelUser[], void>('/api/channel/users'),
  revokeUser: httpPost<void, { userId: string }>('/api/channel/users/revoke'),
  getActiveSessions: httpGet<IChannelSession[], void>('/api/channel/sessions'),
  syncChannelSettings: httpPost<
    void,
    {
      platform: string;
      agent: { backend: string; customAgentId?: string; name?: string };
      model?: { id: string; useModel: string };
    }
  >('/api/channel/settings/sync'),
  pairingRequested: wsEmitter<IChannelPairingRequest>('channel.pairing-requested'),
  pluginStatusChanged: wsEmitter<{ pluginId: string; status: IChannelPluginStatus }>(
    'channel.plugin-status-changed',
  ),
  userAuthorized: wsEmitter<IChannelUser>('channel.user-authorized'),
};

// ---------------------------------------------------------------------------
// Agent Hub API — routed to /api/hub/*
// ---------------------------------------------------------------------------

import type { IHubAgentItem, HubExtensionStatus } from '@/common/types/hub';

export const hub = {
  getExtensionList: httpGet<IHubAgentItem[], void>('/api/hub/extensions'),
  install: httpPost<void, { name: string }>('/api/hub/install'),
  uninstall: httpPost<void, { name: string }>('/api/hub/uninstall'),
  retryInstall: httpPost<void, { name: string }>('/api/hub/retry-install'),
  checkUpdates: httpPost<{ name: string }[], void>('/api/hub/check-updates'),
  update: httpPost<void, { name: string }>('/api/hub/update'),
  onStateChanged: wsEmitter<{ name: string; status: HubExtensionStatus; error?: string }>(
    'hub.state-changed',
  ),
};

// ---------------------------------------------------------------------------
// Team Mode API — routed to /api/teams/*
// ---------------------------------------------------------------------------

export type ICreateTeamParams = {
  userId: string;
  name: string;
  workspace: string;
  workspaceMode: 'shared' | 'isolated';
  agents: import('@process/team/types').TeamAgent[];
};

export type IAddTeamAgentParams = {
  teamId: string;
  agent: Omit<import('@process/team/types').TeamAgent, 'slotId'>;
};

export const team = {
  create: httpPost<import('@process/team/types').TTeam, ICreateTeamParams>('/api/teams'),
  list: httpGet<import('@process/team/types').TTeam[], { userId: string }>(
    (p) => `/api/teams?userId=${encodeURIComponent(p.userId)}`,
  ),
  get: httpGet<import('@process/team/types').TTeam | null, { id: string }>((p) => `/api/teams/${p.id}`),
  remove: httpDelete<void, { id: string }>((p) => `/api/teams/${p.id}`),
  addAgent: httpPost<import('@process/team/types').TeamAgent, IAddTeamAgentParams>(
    (p) => `/api/teams/${p.teamId}/agents`,
    (p) => p.agent,
  ),
  removeAgent: httpDelete<void, { teamId: string; slotId: string }>(
    (p) => `/api/teams/${p.teamId}/agents/${p.slotId}`,
  ),
  sendMessage: httpPost<void, { teamId: string; content: string; files?: string[] }>(
    (p) => `/api/teams/${p.teamId}/messages`,
    (p) => ({ content: p.content, files: p.files }),
  ),
  sendMessageToAgent: httpPost<void, { teamId: string; slotId: string; content: string; files?: string[] }>(
    (p) => `/api/teams/${p.teamId}/agents/${p.slotId}/messages`,
    (p) => ({ content: p.content, files: p.files }),
  ),
  stop: httpDelete<void, { teamId: string }>((p) => `/api/teams/${p.teamId}/session`),
  ensureSession: httpPost<void, { teamId: string }>((p) => `/api/teams/${p.teamId}/session`),
  renameAgent: httpPatch<void, { teamId: string; slotId: string; newName: string }>(
    (p) => `/api/teams/${p.teamId}/agents/${p.slotId}/name`,
    (p) => ({ name: p.newName }),
  ),
  renameTeam: httpPatch<void, { id: string; name: string }>(
    (p) => `/api/teams/${p.id}/name`,
    (p) => ({ name: p.name }),
  ),
  setSessionMode: httpPost<void, { teamId: string; sessionMode: string }>(
    (p) => `/api/teams/${p.teamId}/session-mode`,
    (p) => ({ sessionMode: p.sessionMode }),
  ),
  updateWorkspace: httpPost<void, { teamId: string; workspace: string }>(
    (p) => `/api/teams/${p.teamId}/workspace`,
    (p) => ({ workspace: p.workspace }),
  ),
  agentStatusChanged: wsEmitter<import('@process/team/types').ITeamAgentStatusEvent>('team.agent.status'),
  agentSpawned: wsEmitter<import('@/common/types/teamTypes').ITeamAgentSpawnedEvent>('team.agent.spawned'),
  agentRemoved: wsEmitter<import('@/common/types/teamTypes').ITeamAgentRemovedEvent>('team.agent.removed'),
  agentRenamed: wsEmitter<import('@/common/types/teamTypes').ITeamAgentRenamedEvent>('team.agent.renamed'),
  listChanged: wsEmitter<import('@/common/types/teamTypes').ITeamListChangedEvent>('team.list-changed'),
  mcpStatus: wsEmitter<import('@/common/types/teamTypes').ITeamMcpStatusEvent>('team.mcp.status'),
};
