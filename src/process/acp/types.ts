// src/process/acp/types.ts

import type { TMessage } from '@/common/chat/chatLib';
import type {
  AuthMethod,
  ContentBlock,
  McpServer,
  ReadTextFileRequest,
  ReadTextFileResponse,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionNotification,
  ToolKind,
  WriteTextFileRequest,
  WriteTextFileResponse,
} from '@agentclientprotocol/sdk';
// ─── Agent Identity & Config ────────────────────────────────────

export type AgentSource = 'builtin' | 'extension' | 'custom' | 'remote';

export type AgentConfig = {
  // Agent 身份
  agentBackend: string;
  agentSource: AgentSource;
  agentId: string;

  // 连接信息（决定使用哪种 Connector）
  command?: string; // 由 AcpDetector 解析后的完整命令
  args?: string[]; // 由 AcpDetector 解析后的完整参数
  env?: Record<string, string>;
  remoteUrl?: string;
  remoteHeaders?: Record<string, string>;

  // 进程选项
  processOptions?: {
    gracePeriodMs?: number; // 三阶段关闭 Phase 1 等待时间，默认 100ms
  };

  // 会话配置
  cwd: string;
  mcpServers?: McpServer[];
  additionalDirectories?: string[];

  // 可选预设（来自 relate_type = 'assistant'）
  presetPrompts?: string[];
  presetSkills?: string[];
  presetMcpServers?: McpServer[];

  // Team MCP（D9 团队模式预留）
  teamMcpConfig?: McpServer;

  // 认证
  authCredentials?: Record<string, string>;

  // 恢复信息（从 DB 重建时使用）
  resumeSessionId?: string;

  // 用户在 session 建立前的选择（如 Guid 页面选的 model / mode / config）
  initialDesired?: InitialDesiredConfig;

  // 其他
  yoloMode?: boolean;
};

// ─── Session Status (7-state FSM, D1) ──────────────────────────

export type SessionStatus = 'idle' | 'starting' | 'active' | 'prompting' | 'suspended' | 'resuming' | 'error';

// ─── Initial Desired Config ─────────────────────────────────────

/** User selections made before session creation (e.g., from the Guid page). */
export type InitialDesiredConfig = {
  model?: string;
  mode?: string;
  configOptions?: Record<string, string | boolean>;
};

// ─── Prompt ─────────────────────────────────────────────────────

export type PromptContent = ContentBlock[];

// ─── Config Snapshots ───────────────────────────────────────────

export type AvailableCommand = {
  name: string;
  description?: string;
  hint?: string;
};

export type ConfigSnapshot = {
  configOptions: ConfigOption[];
  availableCommands: AvailableCommand[];
  cwd: string;
  additionalDirectories?: string[];
};

export type ModelSnapshot = {
  currentModelId: string | null;
  availableModels: Array<{ modelId: string; name: string; description?: string }>;
};

export type ModeSnapshot = {
  currentModeId: string | null;
  availableModes: Array<{ id: string; name: string; description?: string }>;
};

export type ContextUsage = {
  used: number;
  total: number;
  percentage: number;
  cost?: { amount: number; currency: string };
};

export type ConfigOption = {
  id: string;
  name: string;
  type: 'select' | 'boolean';
  category?: 'mode' | 'model' | 'thought_level' | string;
  description?: string;
  currentValue: string | boolean;
  options?: Array<{ id: string; name: string; description?: string }>;
};

// ─── Permission ─────────────────────────────────────────────────

export type PermissionUIData = {
  callId: string;
  title: string;
  description: string;
  kind?: ToolKind;
  options: Array<{
    optionId: string;
    label: string;
    kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always';
  }>;
  locations?: Array<{ path: string; range?: { startLine: number; endLine?: number } }>;
  rawInput?: unknown;
};

// ─── Auth ───────────────────────────────────────────────────────

export type AuthRequiredData = {
  agentBackend: string;
  methods: AuthMethod[];
};

// ─── Signals ────────────────────────────────────────────────────

export type SessionSignal =
  | { type: 'turn_finished' }
  | { type: 'session_expired' }
  | { type: 'auth_required'; auth: AuthRequiredData }
  | { type: 'error'; message: string; recoverable: boolean };

// ─── Callbacks (Session → Application) ──────────────────────────

export type SessionCallbacks = {
  onInitialize?: (result: unknown) => void;
  onMessage: (message: TMessage) => void;
  onSessionId: (sessionId: string) => void;
  onStatusChange: (status: SessionStatus) => void;
  onConfigUpdate: (config: ConfigSnapshot) => void;
  onModelUpdate: (model: ModelSnapshot) => void;
  onModeUpdate: (mode: ModeSnapshot) => void;
  onContextUsage: (usage: ContextUsage) => void;
  onPermissionRequest: (data: PermissionUIData) => void;
  onSignal: (event: SessionSignal) => void;
};

// ─── Application Layer ──────────────────────────────────────────

export type SignalEvent =
  | { type: 'status_change'; status: SessionStatus }
  | { type: 'session_id_update'; sessionId: string }
  | { type: 'model_update'; model: ModelSnapshot }
  | { type: 'mode_update'; mode: ModeSnapshot }
  | { type: 'config_update'; config: ConfigSnapshot }
  | { type: 'context_usage'; usage: ContextUsage }
  | { type: 'permission_request'; data: PermissionUIData }
  | { type: 'auth_required'; auth: AuthRequiredData }
  | { type: 'error'; message: string; recoverable: boolean };

export type RuntimeOptions = {
  idleTimeoutMs?: number;
  checkIntervalMs?: number;
};

// ─── Protocol Handlers ──────────────────────────────────────────

export type ProtocolHandlers = {
  onSessionUpdate: (notification: SessionNotification) => void;
  onRequestPermission: (request: RequestPermissionRequest) => Promise<RequestPermissionResponse>;
  onReadTextFile: (request: ReadTextFileRequest) => Promise<ReadTextFileResponse>;
  onWriteTextFile: (request: WriteTextFileRequest) => Promise<WriteTextFileResponse>;
};

/** No-op handlers for ephemeral AcpClient usage (e.g. connection tests, health checks). */
export const noopProtocolHandlers: ProtocolHandlers = {
  onSessionUpdate: () => {},
  onRequestPermission: () => Promise.resolve({ outcome: { outcome: 'cancelled' as const } }),
  onReadTextFile: () => Promise.resolve({ content: '' }),
  onWriteTextFile: () => Promise.resolve({}),
};

// ─── Application-layer Types ───────────────────────────────────

export type SessionEntry = {
  session: unknown; // Will be AcpSession — forward ref avoids circular import
  lastActiveAt: number;
};
