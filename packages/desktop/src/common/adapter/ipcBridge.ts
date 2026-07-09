/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * IPC Bridge → HTTP/WS adapter.
 *
 * This file replaces the original IPC bridge calls with HTTP REST and WebSocket
 * calls routed to aioncore. Electron-native operations (window controls,
 * native dialogs, auto-update, devtools, zoom, CDP, deep links) remain as IPC.
 */

import type { IConfirmation } from '@/common/chat/chatLib';
import type { AcpSlashCommandApiItem } from '@/common/chat/slash/types';
import { bridge } from '@office-ai/platform';
import type { OpenDialogOptions } from 'electron';
import type {
  ICssTheme,
  IMcpServer,
  IProvider,
  ISessionMcpServer,
  TChatConversation,
  TConversationRuntimeSummary,
  TProviderWithModel,
} from '../config/storage';
import type {
  Assistant,
  AssistantDetail,
  CreateAssistantRequest,
  ImportAssistantsRequest,
  ImportAssistantsResult,
  SetAssistantStateRequest,
  UpdateAssistantRequest,
} from '../types/agent/assistantTypes';
import type { PreviewHistoryTarget, PreviewSnapshotInfo } from '../types/office/preview';
import type {
  EnsureConversationRuntimeResponse,
  GetConfigOptionsResponse,
  SetConfigOptionRequest,
  SetConfigOptionResponse,
} from '../types/platform/acpTypes';
import type {
  CreateProviderRequest,
  FetchModelsAnonymousRequest,
  FetchModelsResponse,
  ProviderHealthCheckRequest,
  ProviderHealthCheckResponse,
  UpdateProviderRequest,
} from '../types/provider/providerApi';
import type {
  ITeamAgentRemovedEvent,
  ITeamAgentRenamedEvent,
  ITeamAgentRuntimeStatusEvent,
  ITeamAgentSpawnedEvent,
  ITeamAgentStatusEvent,
  ITeamChildTurnEvent,
  ITeamCreatedEvent,
  ITeamListChangedEvent,
  ITeamRemovedEvent,
  ITeamRenamedEvent,
  ITeamRunAck,
  ITeamRunEvent,
  ITeamRunStateResponse,
  ITeamSessionChangedEvent,
  ITeamSessionStatusChangedEvent,
  ITeamTaskChangedEvent,
  ICancelTeamChildTurnParams,
  ICancelTeamRunParams,
  IPauseTeamSlotParams,
  ISendTeamAgentMessageParams,
  ISendTeamMessageParams,
  ITeamTeammateMessageEvent,
  TTeam,
  TeamAssistant,
} from '../types/team/teamTypes';
import type {
  AutoUpdateReadyResult,
  AutoUpdateStatus,
  InstallerLastFailureMarker,
  UpdateCheckRequest,
  UpdateCheckResult,
  UpdateDownloadCancelRequest,
  UpdateDownloadProgressEvent,
  UpdateDownloadRequest,
  UpdateDownloadResult,
} from '../update/updateTypes';
import type { AgentMetadata } from '@/renderer/utils/model/agentTypes';
import type { Theme } from '@/common/theme/types';
import type { ProtocolDetectionRequest, ProtocolDetectionResponse } from '../utils/protocolDetector';
import {
  buildCreateConversationBody,
  fromApiConversation,
  fromApiPaginatedConversations,
  toApiModelOptional,
} from './apiModelMapper';
import {
  httpDelete,
  httpGet,
  httpPatch,
  httpPost,
  httpPut,
  httpRequest,
  stubProvider,
  withResponseMap,
  wsEmitter,
  wsMappedEmitter,
} from './httpBridge';
import { fromApiSearchResult, type ApiMessageSearchItem } from './searchMapper';
import type { IAddTeamAssistantParams, ICreateTeamParams } from './teamMapper';
import {
  fromBackendAssistant,
  fromBackendTeam,
  fromBackendTeamList,
  fromBackendTeamOptional,
  toBackendAssistant,
} from './teamMapper';
import { fromBackendCompareResult, type RawCompareResult } from './fileSnapshotMapper';
import {
  absoluteToRelativePath,
  fromBackendWorkspaceFlatFiles,
  fromBackendWorkspaceList,
  type RawWorkspaceFlatFile,
} from './workspaceMapper';

const httpGetClientSetting = <T>(key: string) => ({
  provider: () => {},
  invoke: (async () => {
    const data = await httpRequest<Record<string, T | undefined>>(
      'GET',
      `/api/settings/client?keys=${encodeURIComponent(key)}`
    );
    return data?.[key];
  }) as () => Promise<T | undefined>,
});

// ---------------------------------------------------------------------------
// Shell — routed to POST /api/shell/*
// ---------------------------------------------------------------------------

export const shell = {
  openFile: httpPost<void, string>('/api/shell/open-file', (file_path) => ({ file_path })),
  showItemInFolder: httpPost<void, string>('/api/shell/show-item-in-folder', (file_path) => ({ file_path })),
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
  get: httpGet<AssistantDetail, { id: string; locale?: string }>(
    ({ id, locale }) =>
      `/api/assistants/${encodeURIComponent(id)}${locale ? `?locale=${encodeURIComponent(locale)}` : ''}`
  ),
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
    httpPost<TChatConversation, ICreateConversationParams>('/api/conversations', (p) => buildCreateConversationBody(p)),
    fromApiConversation
  ),
  createWithConversation: withResponseMap(
    httpPost<TChatConversation, { conversation: TChatConversation }>('/api/conversations/clone', (p) => {
      const isAionrs = p.conversation.type === 'aionrs';
      const { model: _rawModel, ...rest } = p.conversation as TChatConversation & {
        model?: TProviderWithModel;
      };
      const clonedConversation: Record<string, unknown> = { ...rest };
      if (isAionrs) {
        const model = toApiModelOptional(_rawModel);
        if (model) clonedConversation.model = model;
      }
      return {
        conversation: clonedConversation,
      };
    }),
    fromApiConversation
  ),
  get: withResponseMap(
    httpGet<TChatConversation, { id: string }>((p) => `/api/conversations/${p.id}`, { silentStatuses: [404] }),
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
      const model = toApiModelOptional(rawModel as TProviderWithModel | undefined);
      return {
        ...rest,
        ...(model ? { model } : {}),
        merge_extra: p.merge_extra,
      };
    }
  ),
  reset: httpPost<void, IResetConversationParams>((p) => `/api/conversations/${p.id}/reset`),
  ensureRuntime: httpPost<EnsureConversationRuntimeResponse, { conversation_id: string }>(
    (p) => `/api/conversations/${p.conversation_id}/runtime/ensure`,
    () => undefined
  ),
  activeLease: httpPost<void, { conversation_id: string }>(
    (p) => `/api/conversations/${p.conversation_id}/active-lease`,
    () => undefined
  ),
  stop: httpPost<{ runtime: TConversationRuntimeSummary }, { conversation_id: string; turn_id: string }>(
    (p) => `/api/conversations/${p.conversation_id}/cancel`,
    (p) => ({ turn_id: p.turn_id })
  ),
  activeCount: httpGet<{ count: number }>('/api/conversations/active-count'),
  sendMessage: httpPost<ISendMessageResult, ISendMessageParams>(
    (p) => `/api/conversations/${p.conversation_id}/messages`,
    (p) => ({
      content: p.input,
      files: p.files,
      loading_id: p.loading_id,
      inject_skills: p.inject_skills,
    })
  ),
  getSlashCommands: httpGet<AcpSlashCommandApiItem[], { conversation_id: string }>(
    (p) => `/api/conversations/${p.conversation_id}/slash-commands`
  ),
  askSideQuestion: httpPost<ConversationSideQuestionResult, { conversation_id: string; question: string }>(
    (p) => `/api/conversations/${p.conversation_id}/side-question`,
    (p) => ({ question: p.question })
  ),
  confirmMessage: httpPost<void, IConfirmMessageParams>(
    (p) => `/api/conversations/${p.conversation_id}/confirmations/${encodeURIComponent(p.call_id)}/confirm`,
    (p) => ({ msg_id: p.msg_id, data: p.confirm_key })
  ),
  listArtifacts: httpGet<IConversationArtifact[], { conversation_id: string }>(
    (p) => `/api/conversations/${p.conversation_id}/artifacts`
  ),
  updateArtifact: httpPatch<
    IConversationArtifact,
    { conversation_id: string; artifact_id: string; status: IConversationArtifactStatus }
  >(
    (p) => `/api/conversations/${p.conversation_id}/artifacts/${p.artifact_id}`,
    (p) => ({ status: p.status })
  ),
  responseStream: wsEmitter<IResponseMessage>('message.stream'),
  userCreated: wsEmitter<{
    conversation_id: string;
    msg_id: string;
    content: string;
    position: 'right';
    status: 'finish';
    hidden: boolean;
    created_at: number;
  }>('message.userCreated'),
  artifactStream: wsEmitter<IConversationArtifact>('conversation.artifact'),
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
      state: (rawRuntime.state ?? 'idle') as IConversationTurnCompletedEvent['runtime']['state'],
      can_send_message: (rawRuntime.can_send_message ?? rawRuntime.canSendMessage ?? true) as boolean,
      has_task: (rawRuntime.has_task ?? rawRuntime.hasTask ?? false) as boolean,
      task_status: (rawRuntime.task_status ??
        rawRuntime.taskStatus) as IConversationTurnCompletedEvent['runtime']['task_status'],
      is_processing: (rawRuntime.is_processing ?? rawRuntime.isProcessing ?? false) as boolean,
      pending_confirmations: (rawRuntime.pending_confirmations ?? rawRuntime.pendingConfirmations ?? 0) as number,
      turn_id: (rawRuntime.turn_id ?? rawRuntime.turnId ?? null) as string | null,
    };
    const rawModel = (r.model ?? {}) as Record<string, unknown>;
    const model: IConversationTurnCompletedEvent['model'] = {
      platform: (rawModel.platform ?? '') as string,
      name: (rawModel.name ?? '') as string,
      use_model: (rawModel.use_model ?? rawModel.useModel ?? '') as string,
    };
    return {
      session_id: (r.session_id ?? r.sessionId ?? r.conversation_id ?? '') as string,
      turn_id: (r.turn_id ?? r.turnId ?? runtime.turn_id ?? '') as string,
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
  confirmation: {
    add: wsEmitter<IConfirmation<unknown> & { conversation_id: string }>('confirmation.add'),
    update: wsEmitter<IConfirmation<unknown> & { conversation_id: string }>('confirmation.update'),
    confirm: httpPost<
      void,
      { conversation_id: string; msg_id: string; data: unknown; call_id: string; always_allow?: boolean }
    >(
      (p) => `/api/conversations/${p.conversation_id}/confirmations/${encodeURIComponent(p.call_id)}/confirm`,
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

export const runtime = {
  statusChanged: wsEmitter<IRuntimeStatusEvent>('runtime.statusChanged'),
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

export type RuntimeStatusScopeKind = 'conversation' | 'mcp' | 'custom_agent';
export type RuntimeResourceKind = 'node' | 'acp_tool';
export type RuntimeStatusPhase = 'waiting_for_lock' | 'downloading' | 'extracting' | 'validating' | 'ready' | 'failed';
export type RuntimeFailureKind =
  | 'timeout'
  | 'download_failed'
  | 'http_status'
  | 'checksum_mismatch'
  | 'validation_failed'
  | 'unsupported_platform'
  | 'bundled_resource_missing'
  | 'bundled_resource_invalid'
  | 'unknown';

export interface IRuntimeStatusScope {
  kind: RuntimeStatusScopeKind;
  id: string;
}

export interface IRuntimeStatusEvent {
  resource: RuntimeResourceKind;
  resource_id?: string;
  scope: IRuntimeStatusScope;
  phase: RuntimeStatusPhase;
  failure_kind?: RuntimeFailureKind;
  message?: string;
  status_code?: number;
}

export interface IStartOnBootStatus {
  supported: boolean;
  enabled: boolean;
  isPackaged: boolean;
  platform: string;
}

/** Hardware acceleration / GPU recovery status — see process/utils/gpuRecovery */
export type IGpuOverride = 'force-on' | 'force-off';

export interface IGpuStatus {
  /** User-set override; null means follow auto-recovery */
  userOverride: IGpuOverride | null;
  /** Whether auto-recovery has disabled hardware acceleration after repeated crashes */
  autoDisabled: boolean;
  crashCount: number;
  lastCrashAt: number | null;
}

export interface IAppRestartResult {
  restarted: boolean;
  manualRestartRequired: boolean;
  reason?: 'dev-mode';
}

export type IRendererLogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface IRendererLogEntry {
  level: IRendererLogLevel;
  tag: string;
  message: string;
  data?: unknown;
}

// ---------------------------------------------------------------------------
// Application — stays IPC (Electron-native)
// ---------------------------------------------------------------------------

export const application = {
  restart: bridge.buildProvider<IAppRestartResult, void>('restart-app'),
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
  updateSystemInfo: bridge.buildProvider<void, { cacheDir: string; workDir: string; logDir?: string }>(
    'update-system-info'
  ),
  getZoomFactor: bridge.buildProvider<number, void>('app.get-zoom-factor'),
  setZoomFactor: bridge.buildProvider<number, { factor: number }>('app.set-zoom-factor'),
  getCdpStatus: bridge.buildProvider<IBridgeResponse<ICdpStatus>, void>('app.get-cdp-status'),
  updateCdpConfig: bridge.buildProvider<IBridgeResponse<ICdpConfig>, Partial<ICdpConfig>>('app.update-cdp-config'),
  getStartOnBootStatus: bridge.buildProvider<IBridgeResponse<IStartOnBootStatus>, void>('app.get-start-on-boot-status'),
  setStartOnBoot: bridge.buildProvider<IBridgeResponse<IStartOnBootStatus>, { enabled: boolean }>(
    'app.set-start-on-boot'
  ),
  getGpuStatus: bridge.buildProvider<IBridgeResponse<IGpuStatus>, void>('app.get-gpu-status'),
  setGpuOverride: bridge.buildProvider<IBridgeResponse<IGpuStatus>, { override: IGpuOverride | null }>(
    'app.set-gpu-override'
  ),
  writeRendererLog: bridge.buildProvider<void, IRendererLogEntry>('app.write-renderer-log'),
  logStream: bridge.buildEmitter<{ level: 'log' | 'warn' | 'error'; tag: string; message: string; data?: unknown }>(
    'app.log-stream'
  ),
  devToolsStateChanged: bridge.buildEmitter<{ isOpen: boolean }>('app.devtools-state-changed'),
};

// ---------------------------------------------------------------------------
// Update — stays IPC (Electron-native auto-updater)
// ---------------------------------------------------------------------------

export const update = {
  open: bridge.buildEmitter<{ source?: 'menu' | 'about' | 'tray' }>('update.open'),
  check: bridge.buildProvider<IBridgeResponse<UpdateCheckResult>, UpdateCheckRequest>('update.check'),
  consumeInstallerLastFailure: bridge.buildProvider<IBridgeResponse<InstallerLastFailureMarker | null>, void>(
    'update.installer-last-failure.consume'
  ),
  download: bridge.buildProvider<IBridgeResponse<UpdateDownloadResult>, UpdateDownloadRequest>('update.download'),
  cancelDownload: bridge.buildProvider<IBridgeResponse, UpdateDownloadCancelRequest>('update.download.cancel'),
  downloadProgress: bridge.buildEmitter<UpdateDownloadProgressEvent>('update.download.progress'),
};

export const autoUpdate = {
  check: bridge.buildProvider<
    IBridgeResponse<{ updateInfo?: { version: string; releaseDate?: string; releaseNotes?: string } }>,
    { includePrerelease?: boolean }
  >('auto-update.check'),
  restoreDownloaded: bridge.buildProvider<IBridgeResponse<AutoUpdateReadyResult>, void>(
    'auto-update.restore-downloaded'
  ),
  download: bridge.buildProvider<IBridgeResponse, void>('auto-update.download'),
  cancelDownload: bridge.buildProvider<IBridgeResponse, void>('auto-update.download.cancel'),
  quitAndInstall: bridge.buildProvider<void, void>('auto-update.quit-and-install'),
  status: bridge.buildEmitter<AutoUpdateStatus>('auto-update.status'),
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
  listWorkspaceFiles: withResponseMap(
    httpPost<Array<RawWorkspaceFlatFile>, { root: string }>('/api/fs/list'),
    fromBackendWorkspaceFlatFiles
  ),
  getImageBase64: httpPost<string | null, { path: string; workspace?: string }>('/api/fs/image-base64'),
  fetchRemoteImage: httpPost<string, { url: string }>('/api/fs/fetch-remote-image'),
  readFile: httpPost<string | null, { path: string; workspace?: string }>('/api/fs/read'),
  readFileBuffer: httpPost<string | null, { path: string; workspace?: string }>('/api/fs/read-buffer'),
  createTempFile: httpPost<string, { file_name: string }>('/api/fs/temp'),
  writeFile: httpPost<boolean, { path: string; data: string; workspace?: string }>('/api/fs/write'),
  createZip: httpPost<
    boolean,
    {
      path: string;
      workspace?: string;
      source_root?: string;
      request_id?: string;
      files: Array<{
        name: string;
        content?: string | Uint8Array;
        source_path?: string;
      }>;
    }
  >('/api/fs/zip'),
  cancelZip: httpPost<boolean, { request_id: string }>('/api/fs/zip/cancel'),
  getFileMetadata: httpPost<IFileMetadata, { path: string; workspace?: string }>('/api/fs/metadata'),
  copyFilesToWorkspace: httpPost<
    { copied_files: string[]; failed_files?: Array<{ path: string; error: string }> },
    { file_paths: string[]; workspace: string; source_root?: string }
  >('/api/fs/copy'),
  removeEntry: httpPost<void, { path: string; workspace?: string }>('/api/fs/remove'),
  renameEntry: httpPost<{ new_path: string }, { path: string; new_name: string; workspace?: string }>('/api/fs/rename'),
  readBuiltinRule: httpPost<string, { file_name: string }>('/api/skills/builtin-rule'),
  readBuiltinSkill: httpPost<string, { file_name: string }>('/api/skills/builtin-skill'),
  readAssistantRule: httpPost<string, { assistant_id: string; locale?: string }>('/api/skills/assistant-rule/read'),
  writeAssistantRule: httpPost<boolean, { assistant_id: string; content: string; locale?: string }>(
    '/api/skills/assistant-rule/write'
  ),
  deleteAssistantRule: httpDelete<boolean, { assistant_id: string }>(
    (p) => `/api/skills/assistant-rule/${p.assistant_id}`
  ),
  listAvailableSkills: httpGet<
    Array<{
      name: string;
      description: string;
      location: string;
      relative_location?: string;
      is_auto_inject: boolean;
      is_custom: boolean;
      source: 'builtin' | 'custom' | 'cron' | 'extension';
    }>,
    void
  >('/api/skills'),
  materializeSkillsForAgent: httpPost<
    { skills: Array<{ name: string; source_path: string }> },
    { conversation_id: string; skills: string[] }
  >('/api/skills/materialize-for-agent'),
  readSkillInfo: httpPost<{ name: string; description: string }, { skill_path: string }>('/api/skills/info'),
  importSkill: httpPost<
    {
      skill_name: string;
      skill_names?: string[];
      failed?: Array<{
        source_name: string;
        code: string;
        error_path?: string;
        actual_bytes?: number;
        limit_bytes?: number;
        line?: number;
        column?: number;
      }>;
    },
    { skill_path: string }
  >('/api/skills/import'),
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
  importSkills: httpPost<
    {
      skill_name: string;
      skill_names?: string[];
      failed?: Array<{
        source_name: string;
        code: string;
        error_path?: string;
        actual_bytes?: number;
        limit_bytes?: number;
        line?: number;
        column?: number;
      }>;
    },
    { skill_path: string }
  >('/api/skills/import'),
  listSkillImportHistory: httpGet<
    Array<{
      id: string;
      operation_id: string;
      source_label: string;
      source_path?: string;
      source_name: string;
      skill_id?: string;
      skill_name?: string;
      status: string;
      error_code?: string;
      error_path?: string;
      actual_bytes?: number;
      limit_bytes?: number;
      line?: number;
      column?: number;
      created_at: number;
    }>,
    void
  >('/api/skills/import-history'),
  getSkillImportLimits: httpGet<{ max_file_bytes: number; max_total_bytes: number }, void>('/api/skills/import-limits'),
  deleteSkill: httpDelete<void, { skill_name: string }>((p) => `/api/skills/${p.skill_name}`),
  getSkillPaths: httpGet<{ user_skills_dir: string; builtin_skills_dir: string }, void>('/api/skills/paths'),
  getCustomExternalPaths: httpGet<Array<{ name: string; path: string }>, void>('/api/skills/external-paths'),
  addCustomExternalPath: httpPost<void, { name: string; path: string }>('/api/skills/external-paths'),
  removeCustomExternalPath: httpDelete<void, { path: string }>(
    (p) => `/api/skills/external-paths?path=${encodeURIComponent(p.path)}`
  ),
  enableSkillsMarket: httpPost<void, void>('/api/skills/market/enable'),
  disableSkillsMarket: httpPost<void, void>('/api/skills/market/disable'),
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

// Workspace Office file watch
export const workspaceOfficeWatch = {
  start: httpPost<void, { workspace: string }>('/api/fs/office-watch/start'),
  stop: httpPost<void, { workspace: string }>('/api/fs/office-watch/stop'),
  fileAdded: wsEmitter<{ file_path: string; workspace: string }>('workspaceOfficeWatch.fileAdded'),
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
  init: httpPost<import('@/common/types/platform/fileSnapshot').SnapshotInfo, { workspace: string }>(
    '/api/fs/snapshot/init'
  ),
  compare: withResponseMap(
    httpPost<RawCompareResult, { workspace: string }>('/api/fs/snapshot/compare'),
    fromBackendCompareResult
  ),
  getBaselineContent: httpPost<string | null, { workspace: string; file_path: string }>('/api/fs/snapshot/baseline'),
  getInfo: httpPost<import('@/common/types/platform/fileSnapshot').SnapshotInfo, { workspace: string }>(
    '/api/fs/snapshot/info'
  ),
  dispose: httpPost<void, { workspace: string }>('/api/fs/snapshot/dispose'),
  stageFile: httpPost<void, { workspace: string; file_path: string }>('/api/fs/snapshot/stage'),
  stageAll: httpPost<void, { workspace: string }>('/api/fs/snapshot/stage-all'),
  unstageFile: httpPost<void, { workspace: string; file_path: string }>('/api/fs/snapshot/unstage'),
  unstageAll: httpPost<void, { workspace: string }>('/api/fs/snapshot/unstage-all'),
  discardFile: httpPost<
    void,
    {
      workspace: string;
      file_path: string;
      operation: import('@/common/types/platform/fileSnapshot').FileChangeOperation;
    }
  >('/api/fs/snapshot/discard'),
  resetFile: httpPost<
    void,
    {
      workspace: string;
      file_path: string;
      operation: import('@/common/types/platform/fileSnapshot').FileChangeOperation;
    }
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
// ACP Conversation — routed to /api/agents/* + conversation routes
// ---------------------------------------------------------------------------

export const acpConversation = {
  sendMessage: conversation.sendMessage,
  responseStream: conversation.responseStream,
  /** Management view used by Agent settings. */
  getManagedAgents: httpGet<import('@/renderer/utils/model/agentTypes').ManagedAgent[], void>('/api/agents/management'),
  getAgentOverrides: httpGet<
    { command_override?: string; env_override: { name: string; value: string }[] },
    { id: string }
  >((p) => `/api/agents/${encodeURIComponent(p.id)}/overrides`),
  setAgentOverrides: httpPut<
    import('@/renderer/utils/model/agentTypes').ManagedAgent,
    { id: string; command_override?: string | null; env_override?: { name: string; value: string }[] }
  >(
    (p) => `/api/agents/${encodeURIComponent(p.id)}/overrides`,
    (p) => ({ command_override: p.command_override, env_override: p.env_override })
  ),
  refreshCustomAgents: httpPost<void, void>('/api/agents/refresh'),
  testCustomAgent: httpPost<
    { step: 'success' } | { step: 'fail_cli'; error: string } | { step: 'fail_acp'; error: string },
    { command: string; acp_args?: string[]; env?: Record<string, string>; runtime_scope_id?: string }
  >('/api/agents/custom/try-connect'),
  createCustomAgent: httpPost<
    AgentMetadata,
    {
      name: string;
      command: string;
      icon?: string;
      args?: string[];
      env?: Array<{ name: string; value: string; description?: string }>;
      advanced?: {
        yolo_id?: string;
        native_skills_dirs?: string[];
        behavior_policy?: { supports_side_question?: boolean };
        description?: string;
      };
    }
  >('/api/agents/custom'),
  updateCustomAgent: httpPut<
    AgentMetadata,
    {
      id: string;
      name: string;
      command: string;
      icon?: string;
      args?: string[];
      env?: Array<{ name: string; value: string; description?: string }>;
      advanced?: {
        yolo_id?: string;
        native_skills_dirs?: string[];
        behavior_policy?: { supports_side_question?: boolean };
        description?: string;
      };
    }
  >(
    (p) => `/api/agents/custom/${p.id}`,
    (p) => {
      const { id: _id, ...rest } = p;
      return rest;
    }
  ),
  deleteCustomAgent: httpDelete<{ deleted: boolean }, { id: string }>((p) => `/api/agents/custom/${p.id}`),
  setAgentEnabled: httpPatch<AgentMetadata, { id: string; enabled: boolean }>(
    (p) => `/api/agents/${p.id}/enabled`,
    (p) => ({ enabled: p.enabled })
  ),
  checkManagedAgentHealthById: httpPost<import('@/renderer/utils/model/agentTypes').ManagedAgent, { id: string }>(
    (p) => `/api/agents/${p.id}/health-check`,
    () => undefined
  ),
  checkProviderHealth: httpPost<ProviderHealthCheckResponse, ProviderHealthCheckRequest>(
    '/api/agents/provider-health-check'
  ),
  setConfigOption: httpPut<SetConfigOptionResponse, { conversation_id: string; option_id: string; value: string }>(
    (p) => `/api/conversations/${p.conversation_id}/config-options/${encodeURIComponent(p.option_id)}`,
    (p): SetConfigOptionRequest => ({ value: p.value })
  ),
};

// ---------------------------------------------------------------------------
// MCP Service — routed to /api/mcp/*
// ---------------------------------------------------------------------------

export const mcpService = {
  listServers: httpGet<IMcpServer[], void>('/api/mcp/servers'),
  createServer: httpPost<
    IMcpServer,
    Pick<IMcpServer, 'name' | 'description' | 'transport' | 'original_json' | 'builtin'>
  >('/api/mcp/servers'),
  importServers: httpPost<
    IMcpServer[],
    { servers: Array<Pick<IMcpServer, 'name' | 'description' | 'transport' | 'original_json' | 'builtin'>> }
  >('/api/mcp/servers/import'),
  updateServer: httpPut<
    IMcpServer,
    {
      id: string;
      data: Partial<Pick<IMcpServer, 'name' | 'description' | 'transport' | 'original_json' | 'builtin'>>;
    }
  >(
    (p) => `/api/mcp/servers/${p.id}`,
    (p) => p.data
  ),
  deleteServer: httpDelete<void, { id: string }>((p) => `/api/mcp/servers/${p.id}`),
  toggleServer: httpPost<IMcpServer, { id: string }>(
    (p) => `/api/mcp/servers/${p.id}/toggle`,
    () => undefined
  ),
  batchImportServers: httpPost<
    IMcpServer[],
    { servers: Array<Partial<IMcpServer> & Pick<IMcpServer, 'name' | 'transport'>> }
  >('/api/mcp/servers/import'),
  getAgentMcpConfigs: httpGet<
    Array<{
      source: string;
      servers: Array<
        IMcpServer & {
          importable: boolean;
          import_skip_reason?: string;
        }
      >;
    }>,
    void
  >('/api/mcp/agent-configs'),
  testMcpConnection: httpPost<
    {
      success: boolean;
      tools?: Array<{
        name: string;
        description?: string;
        input_schema?: unknown;
        _meta?: Record<string, unknown>;
      }>;
      error?: string;
      code?: string;
      details?: unknown;
      needsAuth?: boolean;
      needs_auth?: boolean;
      authMethod?: 'oauth' | 'basic';
      auth_method?: 'oauth' | 'basic';
      wwwAuthenticate?: string;
      www_authenticate?: string;
    },
    IMcpServer & { runtime_scope_id?: string }
  >('/api/mcp/test-connection'),
  checkOAuthStatus: httpPost<{ authenticated: boolean }, { server_url: string }>('/api/mcp/oauth/check-status'),
  loginMcpOAuth: httpPost<{ success: boolean; error?: string }, { server_url: string }>('/api/mcp/oauth/login'),
  logoutMcpOAuth: httpPost<void, { server_url: string }>('/api/mcp/oauth/logout'),
  getAuthenticatedServers: httpGet<string[], void>('/api/mcp/oauth/authenticated'),
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
  list: httpGet<import('@/common/types/agent/remoteAgentTypes').RemoteAgentConfig[], void>('/api/remote-agents'),
  get: httpGet<import('@/common/types/agent/remoteAgentTypes').RemoteAgentConfig | null, { id: string }>(
    (p) => `/api/remote-agents/${p.id}`
  ),
  create: httpPost<
    import('@/common/types/agent/remoteAgentTypes').RemoteAgentConfig,
    import('@/common/types/agent/remoteAgentTypes').RemoteAgentInput
  >('/api/remote-agents'),
  update: httpPut<
    boolean,
    { id: string; updates: Partial<import('@/common/types/agent/remoteAgentTypes').RemoteAgentInput> }
  >(
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

export type MessageCursorPage<T> = {
  items: T[];
  oldest_cursor: string | null;
  newest_cursor: string | null;
  has_more_before: boolean;
  has_more_after: boolean;
};

export type GetConversationMessagesParams = {
  conversation_id: string;
  limit?: number;
  before?: string;
  after?: string;
  anchor_message_id?: string;
  content_mode?: 'compact' | 'full';
};

export const database = {
  getConversationMessages: httpGet<
    MessageCursorPage<import('@/common/chat/chatLib').TMessage>,
    GetConversationMessagesParams
  >((p) => {
    const params = new URLSearchParams();
    if (p.limit !== undefined) params.set('limit', String(p.limit));
    if (p.before) params.set('before', p.before);
    if (p.after) params.set('after', p.after);
    if (p.anchor_message_id) params.set('anchor_message_id', p.anchor_message_id);
    if (p.content_mode) params.set('content_mode', p.content_mode);
    const qs = params.toString();
    return `/api/conversations/${p.conversation_id}/messages${qs ? `?${qs}` : ''}`;
  }),
  getConversationMessage: httpGet<
    import('@/common/chat/chatLib').TMessage,
    { conversation_id: string; message_id: string }
  >((p) => `/api/conversations/${p.conversation_id}/messages/${encodeURIComponent(p.message_id)}`),
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
  searchConversationMessages: withResponseMap(
    httpGet<PaginatedResult<ApiMessageSearchItem>, { keyword: string; page?: number; page_size?: number }>(
      (p) =>
        `/api/messages/search?keyword=${encodeURIComponent(p.keyword)}&page=${p.page ?? 1}&page_size=${p.page_size ?? 50}`
    ),
    fromApiSearchResult
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
    content_type: import('../types/office/preview').PreviewContentType;
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
    import('../types/office/conversion').DocumentConversionResponse,
    import('../types/office/conversion').DocumentConversionRequest
  >('/api/document/convert'),
};

// ---------------------------------------------------------------------------
// Office Previews — routed to /api/*-preview/*
// ---------------------------------------------------------------------------

export const pptPreview = {
  start: httpPost<{ url: string; error?: string }, { file_path: string; workspace?: string }>('/api/ppt-preview/start'),
  stop: httpPost<void, { file_path: string }>('/api/ppt-preview/stop'),
  status: wsEmitter<{ state: 'starting' | 'installing' | 'ready' | 'error'; message?: string }>('ppt-preview.status'),
};

export const wordPreview = {
  start: httpPost<{ url: string; error?: string }, { file_path: string; workspace?: string }>(
    '/api/word-preview/start'
  ),
  stop: httpPost<void, { file_path: string }>('/api/word-preview/stop'),
  status: wsEmitter<{ state: 'starting' | 'installing' | 'ready' | 'error'; message?: string }>('word-preview.status'),
};

export const excelPreview = {
  start: httpPost<{ url: string; error?: string }, { file_path: string; workspace?: string }>(
    '/api/excel-preview/start'
  ),
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
// Theme — stays IPC (main process owns the resolved-theme cache)
// ---------------------------------------------------------------------------

export const theme = {
  // main → all renderers: the resolved active theme changed
  changed: bridge.buildEmitter<Theme>('theme:changed'),
  // renderer → main: publish a newly resolved theme (main caches + re-emits `changed`)
  setActive: bridge.buildProvider<void, Theme>('theme:set-active'),
  // any window → main: pull the currently cached resolved theme on load (null if none yet)
  requestCurrent: bridge.buildProvider<Theme | null, void>('theme:request-current'),
};

// ---------------------------------------------------------------------------
// System Settings — routed to /api/settings/* unless they need Electron-native side effects.
// ---------------------------------------------------------------------------

export const systemSettings = {
  getCloseToTray: bridge.buildProvider<boolean, void>('system-settings:get-close-to-tray'),
  setCloseToTray: bridge.buildProvider<void, { enabled: boolean }>('system-settings:set-close-to-tray'),
  getNotificationEnabled: httpGetClientSetting<boolean>('notificationEnabled'),
  setNotificationEnabled: httpPut<void, { enabled: boolean }>('/api/settings/client', (p) => ({
    notificationEnabled: p.enabled,
  })),
  getCronNotificationEnabled: httpGetClientSetting<boolean>('cronNotificationEnabled'),
  setCronNotificationEnabled: httpPut<void, { enabled: boolean }>('/api/settings/client', (p) => ({
    cronNotificationEnabled: p.enabled,
  })),
  getKeepAwake: httpGetClientSetting<boolean>('keepAwake'),
  setKeepAwake: httpPut<void, { enabled: boolean }>('/api/settings/client', (p) => ({ keepAwake: p.enabled })),
  changeLanguage: httpPatch<void, { language: string }>('/api/settings', (p) => ({ language: p.language })),
  languageChanged: wsEmitter<{ language: string }>('system-settings:language-changed'),
  getSaveUploadToWorkspace: httpGetClientSetting<boolean>('saveUploadToWorkspace'),
  setSaveUploadToWorkspace: httpPut<void, { enabled: boolean }>('/api/settings/client', (p) => ({
    saveUploadToWorkspace: p.enabled,
  })),
  getAutoPreviewOfficeFiles: httpGetClientSetting<boolean>('autoPreviewOfficeFiles'),
  setAutoPreviewOfficeFiles: httpPut<void, { enabled: boolean }>('/api/settings/client', (p) => ({
    autoPreviewOfficeFiles: p.enabled,
  })),
  getPetEnabled: bridge.buildProvider<boolean, void>('system-settings:get-pet-enabled'),
  setPetEnabled: bridge.buildProvider<void, { enabled: boolean }>('system-settings:set-pet-enabled'),
  getPetSize: bridge.buildProvider<number, void>('system-settings:get-pet-size'),
  setPetSize: bridge.buildProvider<void, { size: number }>('system-settings:set-pet-size'),
  getPetDnd: bridge.buildProvider<boolean, void>('system-settings:get-pet-dnd'),
  setPetDnd: bridge.buildProvider<void, { dnd: boolean }>('system-settings:set-pet-dnd'),
  getPetConfirmEnabled: bridge.buildProvider<boolean, void>('system-settings:get-pet-confirm-enabled'),
  setPetConfirmEnabled: bridge.buildProvider<void, { enabled: boolean }>('system-settings:set-pet-confirm-enabled'),
  ensureNodeRuntime: httpPost<{ ready: boolean }, { scope: IRuntimeStatusScope }>('/api/system/ensure-node-runtime'),
  ensureManagedAcpTool: httpPost<{ ready: boolean }, { scope: IRuntimeStatusScope; tool_id: string }>(
    '/api/system/ensure-managed-acp-tool'
  ),
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
// WebUI — mix: start/stop/getStatus/statusChanged stay IPC (Electron-only
// lifecycle owned by the main process, can't run in backend); credential
// operations route to backend /api/webui/* under local-mode.
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

export interface IWebUIStartResult {
  port: number;
  allowRemote: boolean;
  localUrl: string;
  networkUrl?: string;
  lanIP?: string;
  initialPassword?: string;
}

export const webui = {
  getStatus: bridge.buildProvider<IWebUIStatus, void>('webui.get-status'),
  start: bridge.buildProvider<IWebUIStartResult, { port?: number; allowRemote?: boolean }>('webui.start'),
  stop: bridge.buildProvider<void, void>('webui.stop'),
  statusChanged: bridge.buildEmitter<{
    running: boolean;
    port?: number;
    localUrl?: string;
    networkUrl?: string;
    lanIP?: string;
    initialPassword?: string;
  }>('webui.status-changed'),
  changePassword: httpPost<void, { newPassword: string }>('/api/webui/change-password', (p) => ({
    new_password: p.newPassword,
  })),
  changeUsername: httpPost<{ username: string }, { newUsername: string }>('/api/webui/change-username', (p) => ({
    new_username: p.newUsername,
  })),
  resetPassword: httpPost<{ new_password: string }, void>('/api/webui/reset-password'),
  generateQRToken: httpPost<{ token: string; expires_at_ms: number }, void>('/api/webui/generate-qr-token'),
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
  updateJob: httpPut<ICronJob, { job_id: string; updates: ICronJobUpdateParams }>(
    (p) => `/api/cron/jobs/${p.job_id}`,
    (p) => ({
      name: p.updates.name,
      description: p.updates.description,
      enabled: p.updates.enabled,
      schedule: p.updates.schedule,
      message: p.updates.target?.payload.text,
      execution_mode: p.updates.target?.execution_mode,
      agent_config: p.updates.metadata?.agent_config,
      conversation_title: p.updates.metadata?.conversation_title,
      max_retries: p.updates.state?.max_retries,
    })
  ),
  removeJob: httpDelete<void, { job_id: string }>((p) => `/api/cron/jobs/${p.job_id}`),
  runNow: httpPost<{ conversation_id: string }, { job_id: string }>((p) => `/api/cron/jobs/${p.job_id}/run`),
  saveSkill: httpPost<void, { job_id: string; content: string }>(
    (p) => `/api/cron/jobs/${p.job_id}/skill`,
    (p) => ({ content: p.content })
  ),
  hasSkill: withResponseMap(
    httpGet<{ has_skill: boolean }, { job_id: string }>((p) => `/api/cron/jobs/${p.job_id}/skill`),
    (data) => Boolean(data?.has_skill)
  ),
  deleteSkill: httpDelete<void, { job_id: string }>((p) => `/api/cron/jobs/${p.job_id}/skill`),
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
    agent_type: string;
    created_by: 'user' | 'agent';
    created_at: number;
    updated_at: number;
    agent_config?: ICronAgentConfigRead;
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

export interface ICronAgentConfigRead {
  name: string;
  cli_path?: string;
  is_preset?: boolean;
  assistant_id?: string;
  /** @deprecated Legacy assistant identity kept for read compatibility only. */
  custom_agent_id?: string;
  mode?: string;
  model_id?: string;
  model?: ICronProviderModel;
  config_options?: Record<string, string>;
  workspace?: string;
}

export interface ICronProviderModel {
  provider_id: string;
  model: string;
  use_model?: string;
}

export interface ICronAgentConfigWrite {
  name: string;
  assistant_id?: string;
  mode?: string;
  model_id?: string;
  model?: ICronProviderModel;
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
  created_by: 'user' | 'agent';
  execution_mode?: 'existing' | 'new_conversation';
  agent_config?: ICronAgentConfigWrite;
}

export interface ICronJobUpdateParams {
  name?: string;
  description?: string;
  enabled?: boolean;
  schedule?: ICronSchedule;
  target?: {
    payload?: { kind: 'message'; text: string };
    execution_mode?: 'existing' | 'new_conversation';
  };
  metadata?: {
    conversation_title?: string;
    agent_config?: ICronAgentConfigWrite;
  };
  state?: {
    max_retries?: number;
  };
}

// ---------------------------------------------------------------------------
// Shared types (re-exported for consumers)
// ---------------------------------------------------------------------------

interface ISendMessageParams {
  input: string;
  conversation_id: string;
  files?: string[];
  loading_id?: string;
  inject_skills?: string[];
}

// Server-assigned identifier for the newly created user message. Clients must
// use this as the canonical msg_id when rendering an optimistic bubble so the
// local state aligns with DB rows and WebSocket stream events.
export interface ISendMessageResult {
  msg_id: string;
  turn_id: string;
  runtime: TConversationRuntimeSummary;
}

export interface IConfirmMessageParams {
  confirm_key: string;
  msg_id: string;
  conversation_id: string;
  call_id: string;
}

export interface ICreateConversationParams {
  type?: 'acp' | 'aionrs';
  id?: string;
  name?: string;
  model?: TProviderWithModel;
  assistant?: {
    id: string;
    locale?: string;
    conversation_overrides?: {
      model?: string;
      permission?: string;
      skill_ids?: string[];
      disabled_builtin_skill_ids?: string[];
      mcp_ids?: string[];
    };
  };
  extra: {
    workspace?: string;
    custom_workspace?: boolean;
    default_files?: string[];
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
    context?: string;
    context_file_name?: string;
    /** Transient: preset opt-in skills. Consumed by backend create handler
     *  and stripped before persistence. */
    preset_enabled_skills?: string[];
    /** Transient: auto-inject skills the user opted out of on the Guid page.
     *  Consumed by backend create handler and stripped before persistence. */
    exclude_auto_inject_skills?: string[];
    selected_mcp_server_ids?: string[];
    selected_session_mcp_servers?: ISessionMcpServer[];
    codex_model?: string;
    thought_level?: string;
    cached_config_options?: import('../types/platform/acpTypes').AcpSessionConfigOption[];
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
    /** Legacy marker for pre-provider-probe health-check conversations. */
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
  turn_id?: string;
  conversation_id: string;
  created_at?: number;
  hidden?: boolean;
  position?: 'left' | 'right' | 'center' | 'pop';
  status?: 'finish' | 'pending' | 'error' | 'work';
  /** Replace accumulated text for the same msg_id instead of appending. */
  replace?: boolean;
}

export type IConversationArtifactKind = 'cron_trigger' | 'skill_suggest';
export type IConversationArtifactStatus = 'active' | 'pending' | 'dismissed' | 'saved';

export interface IConversationArtifactBase<
  Kind extends IConversationArtifactKind,
  Payload extends Record<string, unknown>,
> {
  id: string;
  conversation_id: string;
  cron_job_id?: string;
  kind: Kind;
  status: IConversationArtifactStatus;
  payload: Payload;
  created_at: number;
  updated_at: number;
}

export type ICronTriggerArtifact = IConversationArtifactBase<
  'cron_trigger',
  {
    cron_job_id: string;
    cron_job_name: string;
    triggered_at: number;
  }
>;

export type ISkillSuggestArtifact = IConversationArtifactBase<
  'skill_suggest',
  {
    cron_job_id: string;
    name: string;
    description: string;
    skillContent?: string;
    skill_content?: string;
  }
>;

export type IConversationArtifact = ICronTriggerArtifact | ISkillSuggestArtifact;

export interface IConversationTurnCompletedEvent {
  session_id: string;
  turn_id: string;
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
    state: 'idle' | 'starting' | 'running' | 'cancelling' | 'waiting_confirmation';
    can_send_message: boolean;
    has_task: boolean;
    task_status?: 'pending' | 'running' | 'finished';
    is_processing: boolean;
    pending_confirmations: number;
    turn_id: string | null;
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
  display_name: string;
  version: string;
  description?: string;
  source: string;
  enabled: boolean;
}

export interface IExtensionPermissionSummary {
  name: string;
  description: string;
  level: 'safe' | 'moderate' | 'dangerous';
  granted: boolean;
}

export interface IExtensionSettingsTab {
  id: string;
  label: string;
  icon?: string;
  url: string;
  position?: { relativeTo: string; placement: 'before' | 'after' };
  order: number;
  extensionName: string;
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
  IChannelAssistantBindingWrite,
  IChannelDefaultModelSetting,
  IChannelPairingRequest,
  IChannelPlatformSettings,
  IChannelPluginStatus,
  IChannelSession,
  IChannelUser,
} from '@/common/types/channel/channel';

type RawPluginStatus = Record<string, unknown>;
type RawPairing = Record<string, unknown>;
type RawUser = Record<string, unknown>;
type RawSession = Record<string, unknown>;

function toPluginStatus(raw: RawPluginStatus): IChannelPluginStatus {
  return {
    id: (raw.plugin_id ?? raw.id) as string,
    type: (raw.type ?? raw.plugin_type) as string,
    name: raw.name as string,
    enabled: raw.enabled as boolean,
    connected: (raw.connected ?? false) as boolean,
    status: raw.status as string | undefined,
    last_connected: raw.last_connected as number | undefined,
    activeUsers: (raw.active_users ?? 0) as number,
    botUsername: raw.bot_username as string | undefined,
    hasToken: (raw.has_token ?? false) as boolean,
    isExtension: raw.is_extension as boolean | undefined,
    extensionMeta: raw.extension_meta as IChannelPluginStatus['extensionMeta'],
  };
}

function toPairing(raw: RawPairing): IChannelPairingRequest {
  return {
    code: raw.code as string,
    platformUserId: raw.platform_user_id as string,
    platformType: raw.platform_type as string,
    display_name: raw.display_name as string | undefined,
    requestedAt: raw.requested_at as number,
    expiresAt: raw.expires_at as number,
  };
}

function toChannelUser(raw: RawUser): IChannelUser {
  return {
    id: raw.id as string,
    platformUserId: raw.platform_user_id as string,
    platformType: raw.platform_type as string,
    display_name: raw.display_name as string | undefined,
    authorizedAt: raw.authorized_at as number,
    lastActive: raw.last_active as number | undefined,
    session_id: raw.session_id as string | undefined,
  };
}

function toChannelSession(raw: RawSession): IChannelSession {
  return {
    id: raw.id as string,
    user_id: raw.user_id as string,
    agent_type: raw.agent_type as string,
    conversation_id: raw.conversation_id as string | undefined,
    workspace: raw.workspace as string | undefined,
    chatId: raw.chat_id as string | undefined,
    created_at: raw.created_at as number,
    lastActivity: raw.last_activity as number,
  };
}

export const channel = {
  getPluginStatus: withResponseMap(httpGet<RawPluginStatus[], void>('/api/channel/plugins'), (raw) =>
    raw.map(toPluginStatus)
  ),
  enablePlugin: httpPost<void, { plugin_id: string; config: Record<string, unknown> }>('/api/channel/plugins/enable'),
  disablePlugin: httpPost<void, { plugin_id: string }>('/api/channel/plugins/disable'),
  testPlugin: httpPost<
    { success: boolean; bot_username?: string; error?: string },
    { plugin_id: string; token: string; extra_config?: { app_id?: string; app_secret?: string } }
  >('/api/channel/plugins/test'),
  getPendingPairings: withResponseMap(httpGet<RawPairing[], void>('/api/channel/pairings'), (raw) =>
    raw.map(toPairing)
  ),
  approvePairing: httpPost<void, { code: string }>('/api/channel/pairings/approve'),
  rejectPairing: httpPost<void, { code: string }>('/api/channel/pairings/reject'),
  getAuthorizedUsers: withResponseMap(httpGet<RawUser[], void>('/api/channel/users'), (raw) => raw.map(toChannelUser)),
  revokeUser: httpPost<void, { user_id: string }>('/api/channel/users/revoke'),
  getActiveSessions: withResponseMap(httpGet<RawSession[], void>('/api/channel/sessions'), (raw) =>
    raw.map(toChannelSession)
  ),
  getPlatformSettings: httpGet<IChannelPlatformSettings, { platform: string }>(
    (p) => `/api/channel/settings/${encodeURIComponent(p.platform)}`
  ),
  setAssistantSetting: httpPut<void, { platform: string; assistant: IChannelAssistantBindingWrite }>(
    (p) => `/api/channel/settings/${encodeURIComponent(p.platform)}/assistant`,
    (p) => p.assistant
  ),
  setDefaultModelSetting: httpPut<void, { platform: string; default_model: IChannelDefaultModelSetting }>(
    (p) => `/api/channel/settings/${encodeURIComponent(p.platform)}/default-model`,
    (p) => p.default_model
  ),
  syncChannelSettings: httpPost<void, { platform: string }>('/api/channel/settings/sync'),
  pairingRequested: wsMappedEmitter<IChannelPairingRequest>('channel.pairing-requested', (raw) =>
    toPairing(raw as RawPairing)
  ),
  pluginStatusChanged: wsMappedEmitter<{ plugin_id: string; status: IChannelPluginStatus }>(
    'channel.plugin-status-changed',
    (raw) => {
      const r = raw as Record<string, unknown>;
      return {
        plugin_id: r.plugin_id as string,
        status: toPluginStatus(r.status as RawPluginStatus),
      };
    }
  ),
  userAuthorized: wsMappedEmitter<IChannelUser>('channel.user-authorized', (raw) => toChannelUser(raw as RawUser)),
};

// ---------------------------------------------------------------------------
// Agent Hub API — routed to /api/hub/*
// ---------------------------------------------------------------------------

import type { HubExtensionStatus, IHubAgentItem } from '@/common/types/agent/hub';
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

export type { IAddTeamAssistantParams, ICreateTeamParams } from './teamMapper';

export type IRealtimeReconnectedEvent = {
  timestamp: number;
};

export const realtime = {
  reconnected: wsEmitter<IRealtimeReconnectedEvent>('realtime.reconnected'),
};

export const team = {
  create: withResponseMap(
    httpPost<TTeam, ICreateTeamParams>('/api/teams', (p) => ({
      name: p.name,
      agents: p.agents.map(toBackendAssistant),
      ...(p.workspace ? { workspace: p.workspace } : {}),
    })),
    fromBackendTeam
  ),
  list: withResponseMap(
    httpGet<TTeam[], { user_id: string }>((p) => `/api/teams?user_id=${encodeURIComponent(p.user_id)}`),
    fromBackendTeamList
  ),
  get: withResponseMap(
    httpGet<TTeam | null, { id: string }>((p) => `/api/teams/${p.id}`),
    fromBackendTeamOptional
  ),
  remove: httpDelete<void, { id: string }>((p) => `/api/teams/${p.id}`),
  addAgent: withResponseMap(
    httpPost<TeamAssistant, IAddTeamAssistantParams>(
      (p) => `/api/teams/${p.team_id}/agents`,
      (p) => ({ assistant: toBackendAssistant(p.assistant) })
    ),
    fromBackendAssistant
  ),
  removeAgent: httpDelete<void, { team_id: string; slot_id: string }>(
    (p) => `/api/teams/${p.team_id}/agents/${p.slot_id}`
  ),
  stop: httpDelete<void, { team_id: string }>((p) => `/api/teams/${p.team_id}/session`),
  ensureSession: httpPost<void, { team_id: string }>((p) => `/api/teams/${p.team_id}/session`),
  getConfigOptions: httpGet<GetConfigOptionsResponse, { team_id: string; conversation_id: string }>(
    (p) => `/api/teams/${p.team_id}/conversations/${encodeURIComponent(p.conversation_id)}/config-options`
  ),
  activeLease: httpPost<void, { team_id: string }>(
    (p) => `/api/teams/${p.team_id}/active-lease`,
    () => undefined
  ),
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
    (p) => ({ mode: p.session_mode })
  ),
  getRunState: httpGet<ITeamRunStateResponse, { team_id: string }>((p) => `/api/teams/${p.team_id}/run-state`),
  sendMessage: httpPost<ITeamRunAck, ISendTeamMessageParams>(
    (p) => `/api/teams/${p.team_id}/messages`,
    (p) => ({
      content: p.input,
      files: p.files,
    })
  ),
  sendMessageToAgent: httpPost<ITeamRunAck, ISendTeamAgentMessageParams>(
    (p) => `/api/teams/${p.team_id}/agents/${p.slot_id}/messages`,
    (p) => ({
      content: p.input,
      files: p.files,
    })
  ),
  cancelRun: httpPost<void, ICancelTeamRunParams>(
    (p) => `/api/teams/${p.team_id}/runs/${p.team_run_id}/cancel`,
    (p) => ({
      target_slot_id: p.target_slot_id,
      reason: p.reason,
    })
  ),
  cancelChildTurn: httpPost<void, ICancelTeamChildTurnParams>(
    (p) => `/api/teams/${p.team_id}/runs/${p.team_run_id}/agents/${p.slot_id}/cancel`,
    (p) => ({
      reason: p.reason,
    })
  ),
  pauseSlotWork: httpPost<void, IPauseTeamSlotParams>(
    (p) => `/api/teams/${p.team_id}/runs/${p.team_run_id}/agents/${p.slot_id}/pause`,
    (p) => ({
      reason: p.reason,
    })
  ),
  agentStatusChanged: wsEmitter<ITeamAgentStatusEvent>('team.agentStatusChanged'),
  agentSpawned: wsEmitter<ITeamAgentSpawnedEvent>('team.agentSpawned'),
  agentRemoved: wsEmitter<ITeamAgentRemovedEvent>('team.agentRemoved'),
  agentRenamed: wsEmitter<ITeamAgentRenamedEvent>('team.agentRenamed'),
  agentRuntimeStatusChanged: wsEmitter<ITeamAgentRuntimeStatusEvent>('team.agentRuntimeStatusChanged'),
  listChanged: wsEmitter<ITeamListChangedEvent>('team.listChanged'),
  created: wsEmitter<ITeamCreatedEvent>('team.created'),
  removed: wsEmitter<ITeamRemovedEvent>('team.removed'),
  renamed: wsEmitter<ITeamRenamedEvent>('team.renamed'),
  teammateMessage: wsEmitter<ITeamTeammateMessageEvent>('team.teammateMessage'),
  sessionStatusChanged: wsEmitter<ITeamSessionStatusChangedEvent>('team.sessionStatusChanged'),
  taskChanged: wsEmitter<ITeamTaskChangedEvent>('team.taskChanged'),
  sessionChanged: wsEmitter<ITeamSessionChangedEvent>('team.sessionChanged'),
  runAccepted: wsEmitter<ITeamRunEvent>('team.runAccepted'),
  runStarted: wsEmitter<ITeamRunEvent>('team.runStarted'),
  runUpdated: wsEmitter<ITeamRunEvent>('team.runUpdated'),
  runCompleted: wsEmitter<ITeamRunEvent>('team.runCompleted'),
  runCancelled: wsEmitter<ITeamRunEvent>('team.runCancelled'),
  runFailed: wsEmitter<ITeamRunEvent>('team.runFailed'),
  childTurnStarted: wsEmitter<ITeamChildTurnEvent>('team.childTurnStarted'),
  childTurnCompleted: wsEmitter<ITeamChildTurnEvent>('team.childTurnCompleted'),
  childTurnCancelled: wsEmitter<ITeamChildTurnEvent>('team.childTurnCancelled'),
};
