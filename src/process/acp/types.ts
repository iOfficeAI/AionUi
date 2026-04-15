// src/process/acp/types.ts

import type { TMessage } from '@/common/chat/chatLib';

// ─── Agent Identity & Config ────────────────────────────────────

export type AgentConfig = {
  agentBackend: string;
  agentSource: 'builtin' | 'extension' | 'custom' | 'remote';
  agentId: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  remoteUrl?: string;
  remoteHeaders?: Record<string, string>;
  processOptions?: { gracePeriodMs?: number };
  cwd: string;
  mcpServers?: McpServerConfig[];
  additionalDirectories?: string[];
  presetPrompts?: string[];
  presetSkills?: string[];
  presetMcpServers?: McpServerConfig[];
  teamMcpConfig?: McpServerConfig;
  authCredentials?: Record<string, string>;
  autoApproveAll?: boolean;
  resumeSessionId?: string;
  resumeConfig?: Record<string, unknown>;
};

export type McpServerConfig = {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

// ─── Session Status (7-state FSM, D1) ──────────────────────────

export type SessionStatus = 'idle' | 'starting' | 'active' | 'prompting' | 'suspended' | 'resuming' | 'error';

// ─── Prompt ─────────────────────────────────────────────────────

export type PromptContent = PromptContentItem[];

export type PromptContentItem =
  | { type: 'text'; text: string }
  | { type: 'file'; path: string; content: string; mimeType?: string };

// ─── Queue ──────────────────────────────────────────────────────

export type QueueSnapshot = {
  items: ReadonlyArray<{ id: string; text: string; enqueuedAt: number }>;
  maxSize: number;
  length: number;
};

// ─── Config Snapshots ───────────────────────────────────────────

export type ConfigSnapshot = {
  configOptions: ConfigOption[];
  availableCommands: string[];
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

export type ToolKind =
  | 'read'
  | 'edit'
  | 'delete'
  | 'move'
  | 'search'
  | 'execute'
  | 'think'
  | 'fetch'
  | 'switch_mode'
  | 'other';

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

export type AuthMethod =
  | { type: 'env_var'; id: string; name: string; description?: string; fields: AuthInputField[] }
  | {
      type: 'terminal';
      id: string;
      name: string;
      description?: string;
      command: string;
      args?: string[];
      env?: Record<string, string>;
    }
  | { type: 'agent'; id: string; name: string; description?: string };

export type AuthInputField = {
  key: string;
  label: string;
  secret: boolean;
};

// ─── Signals ────────────────────────────────────────────────────

export type SessionSignal =
  | { type: 'session_expired' }
  | { type: 'queue_paused'; reason: 'crash_recovery' }
  | { type: 'auth_required'; auth: AuthRequiredData }
  | { type: 'error'; message: string; recoverable: boolean };

// ─── Callbacks (Session → Application) ──────────────────────────

export type SessionCallbacks = {
  onMessage: (message: TMessage) => void;
  onSessionId: (sessionId: string) => void;
  onStatusChange: (status: SessionStatus) => void;
  onConfigUpdate: (config: ConfigSnapshot) => void;
  onModelUpdate: (model: ModelSnapshot) => void;
  onModeUpdate: (mode: ModeSnapshot) => void;
  onContextUsage: (usage: ContextUsage) => void;
  onQueueUpdate: (queue: QueueSnapshot) => void;
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
  | { type: 'queue_update'; queue: QueueSnapshot }
  | { type: 'queue_paused'; reason: 'crash_recovery' }
  | { type: 'permission_request'; data: PermissionUIData }
  | { type: 'auth_required'; auth: AuthRequiredData }
  | { type: 'error'; message: string; recoverable: boolean };

export type RuntimeOptions = {
  idleTimeoutMs?: number;
  checkIntervalMs?: number;
};

// ─── Protocol Handlers ──────────────────────────────────────────

export type SessionNotification = {
  sessionId: string;
  update: SessionUpdate;
};

export type SessionUpdate =
  | { sessionUpdate: 'user_message_chunk'; [key: string]: unknown }
  | { sessionUpdate: 'agent_message_chunk'; [key: string]: unknown }
  | { sessionUpdate: 'agent_thought_chunk'; [key: string]: unknown }
  | { sessionUpdate: 'tool_call'; [key: string]: unknown }
  | { sessionUpdate: 'tool_call_update'; [key: string]: unknown }
  | { sessionUpdate: 'plan'; [key: string]: unknown }
  | { sessionUpdate: 'available_commands_update'; [key: string]: unknown }
  | { sessionUpdate: 'current_mode_update'; modeId: string; [key: string]: unknown }
  | { sessionUpdate: 'config_option_update'; id: string; [key: string]: unknown }
  | { sessionUpdate: 'session_info_update'; sessionId?: string; [key: string]: unknown }
  | { sessionUpdate: 'usage_update'; [key: string]: unknown };

export type ProtocolHandlers = {
  onSessionUpdate: (notification: SessionNotification) => void;
  onRequestPermission: (request: RequestPermissionRequest) => Promise<RequestPermissionResponse>;
  onReadTextFile: (request: unknown) => Promise<unknown>;
  onWriteTextFile: (request: unknown) => Promise<unknown>;
};

// ─── SDK Pass-through Types ────────────────────────────────────

export type RequestPermissionRequest = {
  sessionId: string;
  options: Array<{
    optionId: string;
    name: string;
    kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always';
  }>;
  toolCall: { id: string; name?: string; [key: string]: unknown };
  title?: string;
  description?: string;
};

export type RequestPermissionResponse = {
  optionId: string;
};

// ─── Application-layer Types ───────────────────────────────────

export type SessionEntry = {
  session: unknown; // Will be AcpSession — forward ref avoids circular import
  lastActiveAt: number;
};
