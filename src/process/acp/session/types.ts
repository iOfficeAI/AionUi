// src/process/acp/session/types.ts

import type { Stream } from '@agentclientprotocol/sdk';
import type { AcpMetrics } from '../metrics/AcpMetrics';
import type { AcpProtocol } from '../infra/AcpProtocol';

// Re-export cross-layer types used by session components
export type {
  SessionStatus,
  SessionCallbacks,
  QueueSnapshot,
  QueuedPrompt,
  PermissionUIData,
  ConfigSnapshot,
  ModelSnapshot,
  ModeSnapshot,
  ContextUsage,
  ConfigOption,
  SessionSignal,
  AuthRequiredData,
  AuthMethod,
  AuthInputField,
  PromptContent,
  PromptContentItem,
  AgentConfig,
  McpServerConfig,
} from '../types';

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
  onRequestPermission: (
    request: RequestPermissionRequest,
  ) => Promise<RequestPermissionResponse>;
  onReadTextFile: (request: unknown) => Promise<unknown>;
  onWriteTextFile: (request: unknown) => Promise<unknown>;
};

export type ProtocolFactory = (stream: Stream, handlers: ProtocolHandlers) => AcpProtocol;

// ─── SDK pass-through types ─────────────────────────────────────

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

export type PromptResponse = {
  stopReason: 'end_turn' | 'max_tokens' | 'max_turn_requests' | 'refusal' | 'cancelled';
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
};

export type InitializeResponse = {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  authMethods?: RawAuthMethod[];
};

export type RawAuthMethod = {
  id: string;
  type: 'env_var' | 'terminal' | 'agent';
  name: string;
  description?: string;
  fields?: Array<{ key: string; label: string; secret: boolean }>;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
};

// ─── Session internals ──────────────────────────────────────────

export type PendingPermission = {
  callId: string;
  resolve: (response: RequestPermissionResponse) => void;
  reject: (error: Error) => void;
  createdAt: number;
};

export type SessionOptions = {
  promptTimeoutMs?: number;
  maxStartRetries?: number;
  maxResumeRetries?: number;
  protocolFactory?: ProtocolFactory;
  metrics?: AcpMetrics;
  promptQueueMaxSize?: number;
  approvalCacheMaxSize?: number;
};

// ─── Application-layer types used by Runtime ────────────────────

export type SessionEntry = {
  session: unknown; // Will be AcpSession — forward ref avoids circular import
  lastActiveAt: number;
};

export type ConnectorFactory = {
  create(config: import('../types').AgentConfig): import('../infra/AgentConnector').AgentConnector;
};
