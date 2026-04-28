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
import type {
  CreateProviderRequest,
  FetchModelsAnonymousRequest,
  FetchModelsResponse,
  UpdateProviderRequest,
} from '../types/providerApi';
import type { SpeechToTextRequest, SpeechToTextResult } from '../types/speech';
import type {
  Assistant,
  CreateAssistantRequest,
  ImportAssistantsRequest,
  ImportAssistantsResult,
  SetAssistantStateRequest,
  UpdateAssistantRequest,
} from '../types/assistantTypes';
import { toApiModel, toApiModelOptional, fromApiConversation, fromApiPaginatedConversations } from './apiModelMapper';
import { absoluteToRelativePath, fromBackendWorkspaceList } from './workspaceMapper';
import {
  fromBackendAgent,
  fromBackendTeam,
  fromBackendTeamList,
  fromBackendTeamOptional,
  toBackendAgent,
} from './teamMapper';
import type { ICreateTeamParams, IAddTeamAgentParams } from './teamMapper';
import {
  httpRequest,
  httpGet,
  httpPost,
  httpPut,
  httpPatch,
  httpDelete,
  wsEmitter,
  wsMappedEmitter,
  stubProvider,
  stubEmitter,
  withResponseMap,
} from './httpBridge';

// ---------------------------------------------------------------------------
// Shell — routed to POST /api/shell/*
// ---------------------------------------------------------------------------

export const shell = {
  openFile: httpPost<void, string>('/api/shell/open-file', (path) => ({ path })),
  showItemInFolder: httpPost<void, string>('/api/shell/show-item-in-folder', (path) => ({ path })),
  openExternal: httpPost<void, string>('/api/shell/open-external', (url) => ({ url })),
  checkToolInstalled: httpPost<boolean, { tool: string }>('/api/shell/check-tool-installed'),
  openFolderWith: httpPost<void, { folder_path: string; tool: 'vscode' | 'terminal' | 'explorer' }>(
    '/api/shell/open-folder-with'
  ),
};

// ---------------------------------------------------------------------------
// Assistants — routed to /api/assistants/*
// ---------------------------------------------------------------------------

export const assistants = {
  list: httpGet<Assistant[], void>('/api/assistants'),
  create: httpPost<Assistant, CreateAssistantRequest>('/api/assistants'),
  update: httpPut<Assistant, UpdateAssistantRequest>((p) => `/api/assistants/${p.id}`),
  delete: httpDelete<void, { id: string }>((p) => `/api/assistants/${p.id}`),
  setState: httpPatch<Assistant, SetAssistantStateRequest>(
    (p) => `/api/assistants/${p.id}/state`,
    (p) => {
      const { id: _id, ...body } = p;
      return body;
    }
  ),
  import: httpPost<ImportAssistantsResult, ImportAssistantsRequest>('/api/assistants/import'),
};

// ---------------------------------------------------------------------------
// Conversation — REST + WS
// ---------------------------------------------------------------------------

export const conversation = {
  create: withResponseMap(
    httpPost<TChatConversation, ICreateConversationParams>('/api/conversations', (p) => ({
      type: p.type,
      id: p.id,
      name: p.name,
      model: toApiModelOptional(p.model),
      extra: p.extra,
    })),
    fromApiConversation
  ),
  createWithConversation: withResponseMap(
    httpPost<
      TChatConversation,
      { conversation: TChatConversation; source_conversation_id?: string; migrate_cron?: boolean }
    >('/api/conversations/clone', (p) => ({
      source_conversation_id: p.source_conversation_id,
      migrate_cron: p.migrate_cron,
      conversation: {
        ...p.conversation,
        model:
          'model' in p.conversation ? toApiModel((p.conversation as { model: TProviderWithModel }).model) : undefined,
      },
    })),
    fromApiConversation
  ),
  get: withResponseMap(
    httpGet<TChatConversation, { id: string }>((p) => `/api/conversations/${p.id}`),
    fromApiConversation
  ),
  getAssociateConversation: withResponseMap(
    httpGet<TChatConversation[], { conversation_id: string }>(
      (p) => `/api/conversations/${p.conversation_id}/associated`
    ),
    (list) => list.map(fromApiConversation)
  ),
  listByCronJob: withResponseMap(
    httpGet<TChatConversation[], { cron_job_id: string }>((p) => `/api/cron/jobs/${p.cron_job_id}/conversations`),
    (list) => list.map(fromApiConversation)
  ),
  remove: httpDelete<boolean, { id: string }>((p) => `/api/conversations/${p.id}`),
  update: httpPatch<boolean, { id: string; updates: Partial<TChatConversation>; merge_extra?: boolean }>(
    (p) => `/api/conversations/${p.id}`,
    (p) => {
      const updates = p.updates as Record<string, unknown>;
      const { model: rawModel, ...rest } = updates;
      return {
        ...rest,
        ...(rawModel ? { model: toApiModel(rawModel as TProviderWithModel) } : {}),
        merge_extra: p.merge_extra,
      };
    }
  ),
  reset: httpPost<void, IResetConversationParams>((p) => `/api/conversations/${p.id}/reset`),
  warmup: httpPost<void, { conversation_id: string }>((p) => `/api/conversations/${p.conversation_id}/warmup`),
  stop: httpPost<void, { conversation_id: string }>((p) => `/api/conversations/${p.conversation_id}/stop`),
  sendMessage: httpPost<void, ISendMessageParams>(
    (p) => `/api/conversations/${p.conversation_id}/messages`,
    (p) => ({
      content: p.input,
      msg_id: p.msg_id,
      files: p.files,
      loading_id: p.loading_id,
      inject_skills: p.inject_skills,
    })
  ),
  getSlashCommands: httpGet<{ commands: SlashCommandItem[] }, { conversation_id: string }>(
    (p) => `/api/conversations/${p.conversation_id}/slash-commands`
  ),
  askSideQuestion: httpPost<ConversationSideQuestionResult, { conversation_id: string; question: string }>(
    (p) => `/api/conversations/${p.conversation_id}/side-question`,
    (p) => ({ question: p.question })
  ),
  confirmMessage: httpPost<void, IConfirmMessageParams>(
    (p) => `/api/conversations/${p.conversation_id}/confirmations/${p.call_id}/confirm`,
    (p) => ({ msg_id: p.msg_id, data: p.confirm_key })
  ),
  responseStream: wsEmitter<IResponseMessage>('message.stream'),
  turnCompleted: wsMappedEmitter<IConversationTurnCompletedEvent>('turn.completed', (raw) => {
    const r = raw as Record<string, unknown>;
    const rawLast = (r.last_message ?? r.lastMessage) as Record<string, unknown> | undefined;
    const last_message: IConversationTurnCompletedEvent['last_message'] = rawLast
      ? {
          id: rawLast.id as string | undefined,
          type: rawLast.type as string | undefined,
          content: rawLast.content ?? null,
          status: rawLast.status as string | null | undefined,
          created_at: (rawLast.created_at ?? rawLast.createdAt ?? Date.now()) as number,
        }
      : {
          content: null,
          created_at: Date.now(),
        };
    const rawRuntime = (r.runtime ?? {}) as Record<string, unknown>;
    const runtime: IConversationTurnCompletedEvent['runtime'] = {
      has_task: (rawRuntime.has_task ?? rawRuntime.hasTask ?? false) as boolean,
      task_status: (rawRuntime.task_status ??
        rawRuntime.taskStatus) as IConversationTurnCompletedEvent['runtime']['task_status'],
      is_processing: (rawRuntime.is_processing ?? rawRuntime.isProcessing ?? false) as boolean,
      pending_confirmations: (rawRuntime.pending_confirmations ?? rawRuntime.pendingConfirmations ?? 0) as number,
      db_status: (rawRuntime.db_status ??
        rawRuntime.dbStatus) as IConversationTurnCompletedEvent['runtime']['db_status'],
    };
    const rawModel = (r.model ?? {}) as Record<string, unknown>;
    const model: IConversationTurnCompletedEvent['model'] = {
      platform: (rawModel.platform ?? '') as string,
      name: (rawModel.name ?? '') as string,
      use_model: (rawModel.use_model ?? rawModel.useModel ?? '') as string,
    };
    return {
      session_id: (r.session_id ?? r.sessionId ?? r.conversation_id ?? '') as string,
      status: (r.status ?? 'finished') as IConversationTurnCompletedEvent['status'],
      state: (r.state ??
        (r.status === 'finished' ? 'ai_waiting_input' : 'unknown')) as IConversationTurnCompletedEvent['state'],
      detail: (r.detail ?? '') as string,
      can_send_message: (r.can_send_message ?? r.canSendMessage ?? r.status === 'finished') as boolean,
      runtime,
      workspace: (r.workspace ?? '') as string,
      model,
      last_message,
    };
  }),
  listChanged: wsEmitter<IConversationListChangedEvent>('conversation.listChanged'),
  // Uses httpRequest directly (instead of httpGet + withResponseMap) because the
  // response mapper needs `workspace` from params to build fullPath/relativePath,
  // and withResponseMap's map function does not receive the original params.
  getWorkspace: {
    provider: () => {},
    invoke: (async (p: { conversation_id: string; workspace: string; path: string; search?: string }) => {
      const rel = absoluteToRelativePath(p.path, p.workspace);
      const url = `/api/conversations/${p.conversation_id}/workspace?path=${encodeURIComponent(rel)}${p.search ? `&search=${encodeURIComponent(p.search)}` : ''}`;
      const raw = await httpRequest<Array<{ name: string; type: string }>>('GET', url);
      return fromBackendWorkspaceList(raw, p.workspace, rel);
    }) as (p: { conversation_id: string; workspace: string; path: string; search?: string }) => Promise<IDirOrFile[]>,
  },
  responseSearchWorkSpace: stubProvider<void, { file: number; dir: number; match?: IDirOrFile }>(
    'responseSearchWorkSpace',
    undefined as unknown as void
  ),
  reloadContext: httpPost<void, { conversation_id: string }>(
    (p) => `/api/conversations/${p.conversation_id}/reload-context`
  ),
  setConfig: httpPost<
    void,
    {
      conversation_id: string;
      config: { model?: string; thinking?: string; thinking_budget?: number; effort?: string };
    }
  >(
    (p) => `/api/conversations/${p.conversation_id}/config`,
    (p) => p.config
  ),
  confirmation: {
    add: wsEmitter<IConfirmation<unknown> & { conversation_id: string }>('confirmation.add'),
    update: wsEmitter<IConfirmation<unknown> & { conversation_id: string }>('confirmation.update'),
    confirm: httpPost<
      void,
      { conversation_id: string; msg_id: string; data: unknown; call_id: string; always_allow?: boolean }
    >(
      (p) => `/api/conversations/${p.conversation_id}/confirmations/${p.call_id}/confirm`,
      (p) => ({ msg_id: p.msg_id, data: p.data, always_allow: p.always_allow ?? false })
    ),
    list: httpGet<IConfirmation<unknown>[], { conversation_id: string }>(
      (p) => `/api/conversations/${p.conversation_id}/confirmations`
    ),
    remove: wsEmitter<{ conversation_id: string; id: string }>('confirmation.remove'),
  },
  approval: {
    check: httpGet<{ approved: boolean }, { conversation_id: string; action: string; command_type?: string }>(
      (p) =>
        `/api/conversations/${p.conversation_id}/approvals/check?action=${encodeURIComponent(p.action)}${p.command_type ? `&command_type=${encodeURIComponent(p.command_type)}` : ''}`
    ),
  },
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
  systemInfo: withResponseMap(
    httpGet<{ cache_dir: string; work_dir: string; log_dir: string; platform: string; arch: string }, void>(
      '/api/system/info'
    ),
    (raw) => ({
      cacheDir: raw.cache_dir,
      workDir: raw.work_dir,
      logDir: raw.log_dir,
      platform: raw.platform,
      arch: raw.arch,
    })
  ),
  getPath: bridge.buildProvider<string, { name: 'desktop' | 'home' | 'downloads' }>('app.get-path'),
  // Electron-local: copies cache dir + persists to ProcessEnv, paired with restart.
  // The backend reads AIONUI_*_DIR env vars on boot, so it does not own this config.
  updateSystemInfo: bridge.buildProvider<void, { cacheDir: string; workDir: string }>('update-system-info'),
  getZoomFactor: bridge.buildProvider<number, void>('app.get-zoom-factor'),
  setZoomFactor: bridge.buildProvider<number, { factor: number }>('app.set-zoom-factor'),
  getCdpStatus: bridge.buildProvider<IBridgeResponse<ICdpStatus>, void>('app.get-cdp-status'),
  updateCdpConfig: bridge.buildProvider<IBridgeResponse<ICdpConfig>, Partial<ICdpConfig>>('app.update-cdp-config'),
  getStartOnBootStatus: bridge.buildProvider<IBridgeResponse<IStartOnBootStatus>, void>('app.get-start-on-boot-status'),
  setStartOnBoot: bridge.buildProvider<IBridgeResponse<IStartOnBootStatus>, { enabled: boolean }>(
    'app.set-start-on-boot'
  ),
  logStream: bridge.buildEmitter<{ level: 'log' | 'warn' | 'error'; tag: string; message: string; data?: unknown }>(
    'app.log-stream'
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
  detectUrl: httpPost<{ url: string | null }, { preferredUrl?: string; force?: boolean; timeoutMs?: number }>(
    '/api/star-office/detect'
  ),
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
  createTempFile: httpPost<string, { file_name: string }>('/api/fs/temp'),
  createUploadFile: httpPost<string, { file_name: string; conversation_id?: string }>('/api/fs/temp'),
  writeFile: httpPost<boolean, { path: string; data: Uint8Array | string }>('/api/fs/write'),
  createZip: httpPost<
    boolean,
    {
      path: string;
      request_id?: string;
      files: Array<{
        name: string;
        content?: string | Uint8Array;
        source_path?: string;
      }>;
    }
  >('/api/fs/zip'),
  cancelZip: httpPost<boolean, { request_id: string }>('/api/fs/zip/cancel'),
  getFileMetadata: httpPost<IFileMetadata, { path: string }>('/api/fs/metadata'),
  copyFilesToWorkspace: httpPost<
    { copied_files: string[]; failed_files?: Array<{ path: string; error: string }> },
    { file_paths: string[]; workspace: string; source_root?: string }
  >('/api/fs/copy'),
  removeEntry: httpPost<void, { path: string }>('/api/fs/remove'),
  renameEntry: httpPost<{ new_path: string }, { path: string; new_name: string }>('/api/fs/rename'),
  readBuiltinRule: httpPost<string, { file_name: string }>('/api/skills/builtin-rule'),
  readBuiltinSkill: httpPost<string, { file_name: string }>('/api/skills/builtin-skill'),
  readAssistantRule: httpPost<string, { assistant_id: string; locale?: string }>('/api/skills/assistant-rule/read'),
  writeAssistantRule: httpPost<boolean, { assistant_id: string; content: string; locale?: string }>(
    '/api/skills/assistant-rule/write'
  ),
  deleteAssistantRule: httpDelete<boolean, { assistant_id: string }>(
    (p) => `/api/skills/assistant-rule/${p.assistant_id}`
  ),
  readAssistantSkill: httpPost<string, { assistant_id: string; locale?: string }>('/api/skills/assistant-skill/read'),
  writeAssistantSkill: httpPost<boolean, { assistant_id: string; content: string; locale?: string }>(
    '/api/skills/assistant-skill/write'
  ),
  deleteAssistantSkill: httpDelete<boolean, { assistant_id: string }>(
    (p) => `/api/skills/assistant-skill/${p.assistant_id}`
  ),
  listAvailableSkills: httpGet<
    Array<{
      name: string;
      description: string;
      location: string;
      relative_location?: string;
      is_custom: boolean;
      source: 'builtin' | 'custom' | 'extension';
    }>,
    void
  >('/api/skills'),
  listBuiltinAutoSkills: httpGet<Array<{ name: string; description: string; location: string }>, void>(
    '/api/skills/builtin-auto'
  ),
  materializeSkillsForAgent: httpPost<
    { skills: Array<{ name: string; source_path: string }> },
    { conversation_id: string; skills: string[] }
  >('/api/skills/materialize-for-agent'),
  readSkillInfo: httpPost<{ name: string; description: string }, { skill_path: string }>('/api/skills/info'),
  importSkill: httpPost<{ skill_name: string }, { skill_path: string }>('/api/skills/import'),
  scanForSkills: httpPost<Array<{ name: string; description: string; path: string }>, { folder_path: string }>(
    '/api/skills/scan'
  ),
  detectCommonSkillPaths: httpGet<Array<{ name: string; path: string }>, void>('/api/skills/detect-paths'),
  detectAndCountExternalSkills: httpGet<
    Array<{
      name: string;
      path: string;
      source: string;
      skills: Array<{ name: string; description: string; path: string }>;
    }>,
    void
  >('/api/skills/detect-external'),
  importSkillWithSymlink: httpPost<{ skill_name: string }, { skill_path: string }>('/api/skills/import-symlink'),
  deleteSkill: httpDelete<void, { skill_name: string }>((p) => `/api/skills/${p.skill_name}`),
  getSkillPaths: httpGet<{ user_skills_dir: string; builtin_skills_dir: string }, void>('/api/skills/paths'),
  exportSkillWithSymlink: httpPost<void, { skill_path: string; target_dir: string }>('/api/skills/export-symlink'),
  getCustomExternalPaths: httpGet<Array<{ name: string; path: string }>, void>('/api/skills/external-paths'),
  addCustomExternalPath: httpPost<void, { name: string; path: string }>('/api/skills/external-paths'),
  removeCustomExternalPath: httpDelete<void, { path: string }>(
    (p) => `/api/skills/external-paths?path=${encodeURIComponent(p.path)}`
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
  startWatch: httpPost<void, { file_path: string }>('/api/fs/watch/start'),
  stopWatch: httpPost<void, { file_path: string }>('/api/fs/watch/stop'),
  stopAllWatches: httpPost<void, void>('/api/fs/watch/stop-all'),
  fileChanged: wsEmitter<{ file_path: string; event_type: string }>('fileWatch.fileChanged'),
};

// Workspace Office file scan
export const workspaceOfficeWatch = {
  scan: httpPost<string[], { workspace: string }>('/api/fs/office-watch/start'),
};

// File streaming updates (real-time content push when agent writes)
export const fileStream = {
  contentUpdate: wsEmitter<{
    file_path: string;
    content: string;
    workspace: string;
    relative_path: string;
    operation: 'write' | 'delete';
  }>('fileStream.contentUpdate'),
};

// File snapshot providers
export const fileSnapshot = {
  init: httpPost<import('@/common/types/fileSnapshot').SnapshotInfo, { workspace: string }>('/api/fs/snapshot/init'),
  compare: httpPost<import('@/common/types/fileSnapshot').CompareResult, { workspace: string }>(
    '/api/fs/snapshot/compare'
  ),
  getBaselineContent: httpPost<string | null, { workspace: string; file_path: string }>('/api/fs/snapshot/baseline'),
  getInfo: httpPost<import('@/common/types/fileSnapshot').SnapshotInfo, { workspace: string }>('/api/fs/snapshot/info'),
  dispose: httpPost<void, { workspace: string }>('/api/fs/snapshot/dispose'),
  stageFile: httpPost<void, { workspace: string; file_path: string }>('/api/fs/snapshot/stage'),
  stageAll: httpPost<void, { workspace: string }>('/api/fs/snapshot/stage-all'),
  unstageFile: httpPost<void, { workspace: string; file_path: string }>('/api/fs/snapshot/unstage'),
  unstageAll: httpPost<void, { workspace: string }>('/api/fs/snapshot/unstage-all'),
  discardFile: httpPost<
    void,
    { workspace: string; file_path: string; operation: import('@/common/types/fileSnapshot').FileChangeOperation }
  >('/api/fs/snapshot/discard'),
  resetFile: httpPost<
    void,
    { workspace: string; file_path: string; operation: import('@/common/types/fileSnapshot').FileChangeOperation }
  >('/api/fs/snapshot/reset'),
  getBranches: httpPost<string[], { workspace: string }>('/api/fs/snapshot/branches'),
};

// ---------------------------------------------------------------------------
// Google Auth — stubbed (Electron-native OAuth flow)
// ---------------------------------------------------------------------------

export const googleAuth = {
  status: stubProvider<IBridgeResponse<{ account: string }>, { proxy?: string }>('googleAuth.status', {
    success: false,
    msg: 'Google Auth not available in backend mode',
  }),
};

// ---------------------------------------------------------------------------
// Google subscription status (Google OAuth provider path, used by aionrs)
// ---------------------------------------------------------------------------

export const google = {
  subscriptionStatus: httpGet<
    { isSubscriber: boolean; tier?: string; lastChecked: number; message?: string },
    { proxy?: string }
  >('/api/google/subscription-status'),
};

// ---------------------------------------------------------------------------
// Bedrock connection test
// ---------------------------------------------------------------------------

export const bedrock = {
  testConnection: httpPost<
    { msg?: string },
    {
      bedrock_config: {
        auth_method: 'accessKey' | 'profile';
        region: string;
        access_key_id?: string;
        secret_access_key?: string;
        profile?: string;
      };
    }
  >('/api/bedrock/test-connection'),
};

// ---------------------------------------------------------------------------
// Mode (Provider management) — routed to /api/providers/*
// ---------------------------------------------------------------------------

export const mode = {
  listProviders: httpGet<IProvider[], void>('/api/providers'),
  createProvider: httpPost<IProvider, CreateProviderRequest>('/api/providers'),
  updateProvider: httpPut<IProvider, { id: string } & UpdateProviderRequest>(
    (p) => `/api/providers/${p.id}`,
    (p) => {
      const { id: _id, ...body } = p;
      return body;
    }
  ),
  deleteProvider: httpDelete<void, { id: string }>((p) => `/api/providers/${p.id}`),
  fetchProviderModels: httpPost<FetchModelsResponse, { id: string; try_fix?: boolean }>(
    (p) => `/api/providers/${p.id}/models`,
    (p) => ({ try_fix: p.try_fix })
  ),
  /**
   * Pre-create form preview — anonymous fetch-models (T1b).
   * Takes credentials in the body, no provider row required. Used by
   * AddPlatformModal / EditModeModal / ApiKeyEditorModal while the
   * dropdown is still being populated.
   */
  fetchModelList: httpPost<FetchModelsResponse, FetchModelsAnonymousRequest>('/api/providers/fetch-models'),
  detectProtocol: httpPost<ProtocolDetectionResponse, ProtocolDetectionRequest>('/api/providers/detect-protocol'),
};

// ---------------------------------------------------------------------------
// ACP Conversation — routed to /api/acp/* + conversation routes
// ---------------------------------------------------------------------------

export const acpConversation = {
  sendMessage: conversation.sendMessage,
  responseStream: conversation.responseStream,
  getAvailableAgents: httpGet<
    Array<{
      id: string;
      name: string;
      agent_type: string;
      backend?: string;
      available: boolean;
      source: 'internal' | 'builtin' | 'extension' | 'custom';
      cli_path?: string;
      custom_agent_id?: string;
      is_preset?: boolean;
      is_extension?: boolean;
      supported_transports?: string[];
    }>,
    void
  >('/api/agents'),
  refreshCustomAgents: httpPost<void, void>('/api/agents/refresh'),
  testCustomAgent: httpPost<
    { step: 'cli_check' | 'acp_initialize'; error?: string },
    { command: string; acp_args?: string[]; env?: Record<string, string> }
  >('/api/agents/test'),
  detectCliPath: httpPost<{ path?: string }, { backend: string }>('/api/acp/detect-cli'),
  checkEnv: httpGet<{ env: Record<string, string> }, void>('/api/acp/env'),
  checkAgentHealth: httpPost<{ available: boolean; latency?: number; error?: string }, { backend: AgentBackend }>(
    '/api/acp/health-check'
  ),
  setMode: httpPut<void, { conversation_id: string; mode: string }>(
    (p) => `/api/conversations/${p.conversation_id}/mode`,
    (p) => ({ mode: p.mode })
  ),
  getMode: httpGet<{ mode: string; initialized: boolean }, { conversation_id: string }>(
    (p) => `/api/conversations/${p.conversation_id}/mode`
  ),
  getModelInfo: httpGet<{ model_info: AcpModelInfo | null }, { conversation_id: string }>(
    (p) => `/api/conversations/${p.conversation_id}/acp/model`
  ),
  setModel: httpPut<void, { conversation_id: string; model_id: string }>(
    (p) => `/api/conversations/${p.conversation_id}/acp/model`,
    (p) => ({ model_id: p.model_id })
  ),
  getConfigOptions: httpGet<
    { config_options: import('../types/acpTypes').AcpSessionConfigOption[] },
    { conversation_id: string }
  >((p) => `/api/conversations/${p.conversation_id}/acp/config`),
  setConfigOption: httpPut<void, { conversation_id: string; config_id: string; value: string }>(
    (p) => `/api/conversations/${p.conversation_id}/acp/config/${p.config_id}`,
    (p) => ({ value: p.value })
  ),
};

// ---------------------------------------------------------------------------
// MCP Service — routed to /api/mcp/*
// ---------------------------------------------------------------------------

export const mcpService = {
  getAgentMcpConfigs: httpGet<
    Array<{ source: McpSource; servers: IMcpServer[] }>,
    Array<{ agent_type: string; backend?: string; name: string; cli_path?: string }>
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
    {
      mcpServers: IMcpServer[];
      agents: Array<{ agent_type: string; backend?: string; name: string; cli_path?: string }>;
    }
  >('/api/mcp/sync-to-agents'),
  removeMcpFromAgents: httpPost<
    { success: boolean; results: Array<{ agent: string; success: boolean; error?: string }> },
    { mcpServerName: string; agents: Array<{ agent_type: string; backend?: string; name: string; cli_path?: string }> }
  >('/api/mcp/remove-from-agents'),
  checkOAuthStatus: httpPost<{ isAuthenticated: boolean; needsLogin: boolean; error?: string }, IMcpServer>(
    '/api/mcp/oauth/check-status'
  ),
  loginMcpOAuth: httpPost<{ success: boolean; error?: string }, { server: IMcpServer; config?: unknown }>(
    '/api/mcp/oauth/login'
  ),
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
      conversation_id: string;
      runtime: {
        workspace?: string;
        backend?: string;
        agent_name?: string;
        cli_path?: string;
        model?: string;
        session_key?: string | null;
        is_connected?: boolean;
        has_active_session?: boolean;
        identity_hash?: string | null;
      };
      expected?: {
        expected_workspace?: string;
        expected_backend?: string;
        expected_agent_name?: string;
        expected_cli_path?: string;
        expected_model?: string;
        expected_identity_hash?: string | null;
        switched_at?: number;
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
    (p) => `/api/remote-agents/${p.id}`
  ),
  create: httpPost<
    import('@process/agent/remote/types').RemoteAgentConfig,
    import('@process/agent/remote/types').RemoteAgentInput
  >('/api/remote-agents'),
  update: httpPut<boolean, { id: string; updates: Partial<import('@process/agent/remote/types').RemoteAgentInput> }>(
    (p) => `/api/remote-agents/${p.id}`,
    (p) => p.updates
  ),
  delete: httpDelete<boolean, { id: string }>((p) => `/api/remote-agents/${p.id}`),
  testConnection: httpPost<
    { success: boolean; error?: string },
    { url: string; auth_type: string; auth_token?: string; allow_insecure?: boolean }
  >('/api/remote-agents/test-connection'),
  handshake: httpPost<{ status: 'ok' | 'pending_approval' | 'error'; error?: string }, { id: string }>(
    (p) => `/api/remote-agents/${p.id}/handshake`
  ),
};

// ---------------------------------------------------------------------------
// Database — routed to conversation/message endpoints
// ---------------------------------------------------------------------------

export type PaginatedResult<T> = {
  items: T[];
  total: number;
  has_more: boolean;
};

export const database = {
  getConversationMessages: httpGet<
    PaginatedResult<import('@/common/chat/chatLib').TMessage>,
    { conversation_id: string; page?: number; page_size?: number; order?: string }
  >(
    (p) =>
      `/api/conversations/${p.conversation_id}/messages?page=${p.page ?? 1}&page_size=${p.page_size ?? 50}${p.order ? `&order=${p.order}` : ''}`
  ),
  getUserConversations: withResponseMap(
    httpGet<PaginatedResult<import('@/common/config/storage').TChatConversation>, { cursor?: string; limit?: number }>(
      (p) => {
        const params = new URLSearchParams();
        if (p.cursor) params.set('cursor', p.cursor);
        if (p.limit) params.set('limit', String(p.limit));
        const qs = params.toString();
        return `/api/conversations${qs ? `?${qs}` : ''}`;
      }
    ),
    fromApiPaginatedConversations
  ),
  searchConversationMessages: httpGet<
    PaginatedResult<import('../types/database').IMessageSearchItem>,
    { keyword: string; page?: number; page_size?: number }
  >(
    (p) =>
      `/api/messages/search?keyword=${encodeURIComponent(p.keyword)}&page=${p.page ?? 1}&page_size=${p.page_size ?? 50}`
  ),
};

// ---------------------------------------------------------------------------
// Preview History — routed to /api/preview-history/*
// ---------------------------------------------------------------------------

function mapPreviewTarget(target: PreviewHistoryTarget): Record<string, unknown> {
  return { ...target, content_type: target.contentType, contentType: undefined };
}

export const previewHistory = {
  list: httpPost<PreviewSnapshotInfo[], { target: PreviewHistoryTarget }>('/api/preview-history/list', (p) => ({
    target: mapPreviewTarget(p.target),
  })),
  save: httpPost<PreviewSnapshotInfo, { target: PreviewHistoryTarget; content: string }>(
    '/api/preview-history/save',
    (p) => ({ target: mapPreviewTarget(p.target), content: p.content })
  ),
  getContent: httpPost<
    { snapshot: PreviewSnapshotInfo; content: string } | null,
    { target: PreviewHistoryTarget; snapshot_id: string }
  >('/api/preview-history/get-content', (p) => ({ target: mapPreviewTarget(p.target), snapshot_id: p.snapshot_id })),
};

// Preview panel
export const preview = {
  open: wsEmitter<{
    content: string;
    content_type: import('../types/preview').PreviewContentType;
    metadata?: {
      title?: string;
      file_name?: string;
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
  start: httpPost<{ url: string }, { file_path: string }>('/api/ppt-preview/start'),
  stop: httpPost<void, { file_path: string }>('/api/ppt-preview/stop'),
  status: wsEmitter<{ state: 'starting' | 'installing' | 'ready' | 'error'; message?: string }>('ppt-preview.status'),
};

export const wordPreview = {
  start: httpPost<{ url: string }, { file_path: string }>('/api/word-preview/start'),
  stop: httpPost<void, { file_path: string }>('/api/word-preview/stop'),
  status: wsEmitter<{ state: 'starting' | 'installing' | 'ready' | 'error'; message?: string }>('word-preview.status'),
};

export const excelPreview = {
  start: httpPost<{ url: string }, { file_path: string }>('/api/excel-preview/start'),
  stop: httpPost<void, { file_path: string }>('/api/excel-preview/stop'),
  status: wsEmitter<{ state: 'starting' | 'installing' | 'ready' | 'error'; message?: string }>('excel-preview.status'),
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
  maximizedChanged: bridge.buildEmitter<{ is_maximized: boolean }>('window-controls:maximized-changed'),
};

// ---------------------------------------------------------------------------
// System Settings — routed to /api/settings/*
// ---------------------------------------------------------------------------

export const systemSettings = {
  getCloseToTray: httpGet<boolean, void>('/api/settings/client?key=closeToTray'),
  setCloseToTray: httpPut<void, { enabled: boolean }>('/api/settings/client', (p) => ({ closeToTray: p.enabled })),
  getNotificationEnabled: httpGet<boolean, void>('/api/settings/client?key=notificationEnabled'),
  setNotificationEnabled: httpPut<void, { enabled: boolean }>('/api/settings/client', (p) => ({
    notificationEnabled: p.enabled,
  })),
  getCronNotificationEnabled: httpGet<boolean, void>('/api/settings/client?key=cronNotificationEnabled'),
  setCronNotificationEnabled: httpPut<void, { enabled: boolean }>('/api/settings/client', (p) => ({
    cronNotificationEnabled: p.enabled,
  })),
  getKeepAwake: httpGet<boolean, void>('/api/settings/client?key=keepAwake'),
  setKeepAwake: httpPut<void, { enabled: boolean }>('/api/settings/client', (p) => ({ keepAwake: p.enabled })),
  changeLanguage: httpPatch<void, { language: string }>('/api/settings', (p) => ({ language: p.language })),
  languageChanged: wsEmitter<{ language: string }>('system-settings:language-changed'),
  getSaveUploadToWorkspace: httpGet<boolean, void>('/api/settings/client?key=saveUploadToWorkspace'),
  setSaveUploadToWorkspace: httpPut<void, { enabled: boolean }>('/api/settings/client', (p) => ({
    saveUploadToWorkspace: p.enabled,
  })),
  getAutoPreviewOfficeFiles: httpGet<boolean, void>('/api/settings/client?key=autoPreviewOfficeFiles'),
  setAutoPreviewOfficeFiles: httpPut<void, { enabled: boolean }>('/api/settings/client', (p) => ({
    autoPreviewOfficeFiles: p.enabled,
  })),
  getPetEnabled: httpGet<boolean, void>('/api/settings/client?key=petEnabled'),
  setPetEnabled: httpPut<void, { enabled: boolean }>('/api/settings/client', (p) => ({ petEnabled: p.enabled })),
  getPetSize: httpGet<number, void>('/api/settings/client?key=petSize'),
  setPetSize: httpPut<void, { size: number }>('/api/settings/client', (p) => ({ petSize: p.size })),
  getPetDnd: httpGet<boolean, void>('/api/settings/client?key=petDnd'),
  setPetDnd: httpPut<void, { dnd: boolean }>('/api/settings/client', (p) => ({ petDnd: p.dnd })),
  getPetConfirmEnabled: httpGet<boolean, void>('/api/settings/client?key=petConfirmEnabled'),
  setPetConfirmEnabled: httpPut<void, { enabled: boolean }>('/api/settings/client', (p) => ({
    petConfirmEnabled: p.enabled,
  })),
};

// ---------------------------------------------------------------------------
// Notification — stays IPC (Electron-native Notification API)
// ---------------------------------------------------------------------------

export type INotificationOptions = {
  title: string;
  body: string;
  icon?: string;
  conversation_id?: string;
};

export const notification = {
  show: bridge.buildProvider<void, INotificationOptions>('notification.show'),
  clicked: bridge.buildEmitter<{ conversation_id?: string }>('notification.clicked'),
};

// ---------------------------------------------------------------------------
// Task management — stubbed (internal process management)
// ---------------------------------------------------------------------------

export const task = {
  stopAll: stubProvider<{ success: boolean; count: number }, void>('task.stopAll', { success: true, count: 0 }),
  getRunningCount: stubProvider<{ success: boolean; count: number }, void>('task.getRunningCount', {
    success: true,
    count: 0,
  }),
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
  changeUsername: httpPost<{ username: string }, { newUsername: string }>('/api/webui/change-username'),
  resetPassword: httpPost<{ newPassword: string }, void>('/api/webui/reset-password'),
  generateQRToken: httpPost<{ token: string; expiresAt: number; qrUrl: string }, void>('/api/webui/generate-qr-token'),
  verifyQRToken: httpPost<{ sessionToken: string; username: string }, { qrToken: string }>(
    '/api/webui/verify-qr-token'
  ),
  statusChanged: wsEmitter<{ running: boolean; port?: number; localUrl?: string; networkUrl?: string }>(
    'webui.status-changed'
  ),
  resetPasswordResult: wsEmitter<{ success: boolean; newPassword?: string; msg?: string }>(
    'webui.reset-password-result'
  ),
};

// ---------------------------------------------------------------------------
// Cron — routed to /api/cron/*
// ---------------------------------------------------------------------------

export const cron = {
  listJobs: httpGet<ICronJob[], void>('/api/cron/jobs'),
  listJobsByConversation: httpGet<ICronJob[], { conversation_id: string }>(
    (p) => `/api/cron/jobs?conversation_id=${encodeURIComponent(p.conversation_id)}`
  ),
  getJob: httpGet<ICronJob | null, { job_id: string }>((p) => `/api/cron/jobs/${p.job_id}`),
  addJob: httpPost<ICronJob, ICreateCronJobParams>('/api/cron/jobs'),
  updateJob: httpPut<ICronJob, { job_id: string; updates: Partial<ICronJob> }>(
    (p) => `/api/cron/jobs/${p.job_id}`,
    (p) => p.updates
  ),
  removeJob: httpDelete<void, { job_id: string }>((p) => `/api/cron/jobs/${p.job_id}`),
  runNow: httpPost<{ conversation_id: string }, { job_id: string }>((p) => `/api/cron/jobs/${p.job_id}/run`),
  saveSkill: httpPost<void, { job_id: string; content: string }>(
    (p) => `/api/cron/jobs/${p.job_id}/skill`,
    (p) => ({ content: p.content })
  ),
  hasSkill: httpGet<boolean, { job_id: string }>((p) => `/api/cron/jobs/${p.job_id}/skill`),
  onJobCreated: wsEmitter<ICronJob>('cron.job-created'),
  onJobUpdated: wsEmitter<ICronJob>('cron.job-updated'),
  onJobRemoved: wsEmitter<{ job_id: string }>('cron.job-removed'),
  onJobExecuted: wsEmitter<{ job_id: string; status: 'ok' | 'error' | 'skipped' | 'missed'; error?: string }>(
    'cron.job-executed'
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
    execution_mode?: 'existing' | 'new_conversation';
  };
  metadata: {
    conversation_id: string;
    conversation_title?: string;
    agent_type: AgentBackend;
    created_by: 'user' | 'agent';
    created_at: number;
    updated_at: number;
    agent_config?: ICronAgentConfig;
  };
  state: {
    next_run_at_ms?: number;
    last_run_at_ms?: number;
    last_status?: 'ok' | 'error' | 'skipped' | 'missed';
    last_error?: string;
    run_count: number;
    retry_count: number;
    max_retries: number;
  };
}

export interface ICronAgentConfig {
  backend: AgentBackend;
  name: string;
  cli_path?: string;
  is_preset?: boolean;
  custom_agent_id?: string;
  preset_agent_type?: string;
  mode?: string;
  model_id?: string;
  config_options?: Record<string, string>;
  workspace?: string;
}

export interface ICreateCronJobParams {
  name: string;
  description?: string;
  schedule: ICronSchedule;
  prompt?: string;
  message?: string;
  conversation_id: string;
  conversation_title?: string;
  agent_type: AgentBackend;
  created_by: 'user' | 'agent';
  execution_mode?: 'existing' | 'new_conversation';
  agent_config?: ICronAgentConfig;
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
  inject_skills?: string[];
}

export interface IConfirmMessageParams {
  confirm_key: string;
  msg_id: string;
  conversation_id: string;
  call_id: string;
}

export interface ICreateConversationParams {
  type: 'acp' | 'codex' | 'openclaw-gateway' | 'nanobot' | 'remote' | 'aionrs';
  id?: string;
  name?: string;
  model: TProviderWithModel;
  extra: {
    workspace?: string;
    custom_workspace?: boolean;
    default_files?: string[];
    backend?: AgentBackend;
    cli_path?: string;
    gateway?: {
      host?: string;
      port?: number;
      token?: string;
      password?: string;
      use_external_gateway?: boolean;
      cli_path?: string;
    };
    web_search_engine?: 'google' | 'default';
    agent_name?: string;
    agent_id?: string;
    custom_agent_id?: string;
    context?: string;
    context_file_name?: string;
    preset_rules?: string;
    /** Transient: preset opt-in skills. Consumed by backend create handler
     *  and stripped before persistence. */
    preset_enabled_skills?: string[];
    /** Transient: auto-inject skills the user opted out of on the Guid page.
     *  Consumed by backend create handler and stripped before persistence. */
    exclude_auto_inject_skills?: string[];
    preset_context?: string;
    preset_assistant_id?: string;
    session_mode?: string;
    codex_model?: string;
    current_model_id?: string;
    cached_config_options?: import('../types/acpTypes').AcpSessionConfigOption[];
    pending_config_options?: Record<string, string>;
    runtime_validation?: {
      expected_workspace?: string;
      expected_backend?: string;
      expected_agent_name?: string;
      expected_cli_path?: string;
      expected_model?: string;
      expected_identity_hash?: string | null;
      switched_at?: number;
    };
    is_health_check?: boolean;
    remote_agent_id?: string;
    extra_skill_paths?: string[];
    team_id?: string;
  };
}

interface IResetConversationParams {
  id?: string;
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
  session_id: string;
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
  can_send_message: boolean;
  runtime: {
    has_task: boolean;
    task_status?: 'pending' | 'running' | 'finished';
    is_processing: boolean;
    pending_confirmations: number;
    db_status?: 'pending' | 'running' | 'finished';
  };
  workspace: string;
  model: {
    platform: string;
    name: string;
    use_model: string;
  };
  last_message: {
    id?: string;
    type?: string;
    content: unknown;
    status?: string | null;
    created_at: number;
  };
}

export interface IConversationListChangedEvent {
  conversation_id: string;
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
  getSkills: httpGet<Array<{ name: string; description: string; location: string }>, void>('/api/extensions/skills'),
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
  enablePlugin: httpPost<void, { pluginId: string; config: Record<string, unknown> }>('/api/channel/plugins/enable'),
  disablePlugin: httpPost<void, { pluginId: string }>('/api/channel/plugins/disable'),
  testPlugin: httpPost<
    { success: boolean; botUsername?: string; error?: string },
    { pluginId: string; token: string; extraConfig?: { appId?: string; appSecret?: string } }
  >('/api/channel/plugins/test'),
  getPendingPairings: httpGet<IChannelPairingRequest[], void>('/api/channel/pairings'),
  approvePairing: httpPost<void, { code: string }>('/api/channel/pairings/approve'),
  rejectPairing: httpPost<void, { code: string }>('/api/channel/pairings/reject'),
  getAuthorizedUsers: httpGet<IChannelUser[], void>('/api/channel/users'),
  revokeUser: httpPost<void, { user_id: string }>('/api/channel/users/revoke'),
  getActiveSessions: httpGet<IChannelSession[], void>('/api/channel/sessions'),
  syncChannelSettings: httpPost<
    void,
    {
      platform: string;
      agent: { backend: string; customAgentId?: string; name?: string };
      model?: { id: string; use_model: string };
    }
  >('/api/channel/settings/sync'),
  pairingRequested: wsEmitter<IChannelPairingRequest>('channel.pairing-requested'),
  pluginStatusChanged: wsEmitter<{ pluginId: string; status: IChannelPluginStatus }>('channel.plugin-status-changed'),
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
  onStateChanged: wsEmitter<{ name: string; status: HubExtensionStatus; error?: string }>('hub.state-changed'),
};

// ---------------------------------------------------------------------------
// Team Mode API — routed to /api/teams/*
// ---------------------------------------------------------------------------

export type { ICreateTeamParams, IAddTeamAgentParams } from './teamMapper';

export const team = {
  create: withResponseMap(
    httpPost<import('@process/team/types').TTeam, ICreateTeamParams>('/api/teams', (p) => ({
      name: p.name,
      agents: p.agents.map(toBackendAgent),
    })),
    fromBackendTeam
  ),
  list: withResponseMap(
    httpGet<import('@process/team/types').TTeam[], { user_id: string }>(
      (p) => `/api/teams?user_id=${encodeURIComponent(p.user_id)}`
    ),
    fromBackendTeamList
  ),
  get: withResponseMap(
    httpGet<import('@process/team/types').TTeam | null, { id: string }>((p) => `/api/teams/${p.id}`),
    fromBackendTeamOptional
  ),
  remove: httpDelete<void, { id: string }>((p) => `/api/teams/${p.id}`),
  addAgent: withResponseMap(
    httpPost<import('@process/team/types').TeamAgent, IAddTeamAgentParams>(
      (p) => `/api/teams/${p.team_id}/agents`,
      (p) => toBackendAgent(p.agent)
    ),
    fromBackendAgent
  ),
  removeAgent: httpDelete<void, { team_id: string; slot_id: string }>(
    (p) => `/api/teams/${p.team_id}/agents/${p.slot_id}`
  ),
  sendMessage: httpPost<void, { team_id: string; content: string; files?: string[] }>(
    (p) => `/api/teams/${p.team_id}/messages`,
    (p) => ({ content: p.content, files: p.files })
  ),
  sendMessageToAgent: httpPost<void, { team_id: string; slot_id: string; content: string; files?: string[] }>(
    (p) => `/api/teams/${p.team_id}/agents/${p.slot_id}/messages`,
    (p) => ({ content: p.content, files: p.files })
  ),
  stop: httpDelete<void, { team_id: string }>((p) => `/api/teams/${p.team_id}/session`),
  ensureSession: httpPost<void, { team_id: string }>((p) => `/api/teams/${p.team_id}/session`),
  renameAgent: httpPatch<void, { team_id: string; slot_id: string; new_name: string }>(
    (p) => `/api/teams/${p.team_id}/agents/${p.slot_id}/name`,
    (p) => ({ name: p.new_name })
  ),
  renameTeam: httpPatch<void, { id: string; name: string }>(
    (p) => `/api/teams/${p.id}/name`,
    (p) => ({ name: p.name })
  ),
  setSessionMode: httpPost<void, { team_id: string; session_mode: string }>(
    (p) => `/api/teams/${p.team_id}/session-mode`,
    (p) => ({ session_mode: p.session_mode })
  ),
  updateWorkspace: httpPost<void, { team_id: string; workspace: string }>(
    (p) => `/api/teams/${p.team_id}/workspace`,
    (p) => ({ workspace: p.workspace })
  ),
  agentStatusChanged: wsEmitter<import('@process/team/types').ITeamAgentStatusEvent>('team.agent.status'),
  agentSpawned: wsEmitter<import('@/common/types/teamTypes').ITeamAgentSpawnedEvent>('team.agent.spawned'),
  agentRemoved: wsEmitter<import('@/common/types/teamTypes').ITeamAgentRemovedEvent>('team.agent.removed'),
  agentRenamed: wsEmitter<import('@/common/types/teamTypes').ITeamAgentRenamedEvent>('team.agent.renamed'),
  listChanged: wsEmitter<import('@/common/types/teamTypes').ITeamListChangedEvent>('team.list-changed'),
  mcpStatus: wsEmitter<import('@/common/types/teamTypes').ITeamMcpStatusEvent>('team.mcp.status'),
};
