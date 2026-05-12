/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// ACP backend identifier. Historically a compile-time whitelist of vendor
// labels; widened to `string` because the authoritative catalog lives in the
// backend `agent_metadata` table and is fetched via `/api/agents`. Extensions
// can contribute arbitrary new backends at runtime.
export type AcpBackendAll = string;

/** Alias kept for readability at call sites that used to constrain to enabled backends. */
export type AcpBackend = string;

// Superset type covering all execution engine backends (ACP + non-ACP).
// Widened to `string` for the same reason as AcpBackendAll.
export type AgentBackend = string;

/**
 * Advanced overrides exposed through the JSON panel of the custom agent
 * editor. These map directly onto backend `AgentMetadata` columns that
 * are not covered by the 5 form fields (name / avatar / command / args
 * / env). Snake_case keys match the backend wire format.
 */
export interface CustomAgentAdvancedOverrides {
  yolo_id?: string;
  native_skills_dirs?: string[];
  behavior_policy?: { supports_side_question?: boolean };
  description?: string;
}

// ACP 错误类型系统 - 优雅的错误处理 / ACP Error Type System - Elegant error handling
export enum AcpErrorType {
  CONNECTION_NOT_READY = 'CONNECTION_NOT_READY',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  AGENT_ERROR = 'AGENT_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  // Granular ACP protocol errors
  ACP_PARSE_ERROR = 'ACP_PARSE_ERROR',
  INVALID_ACP_REQUEST = 'INVALID_ACP_REQUEST',
  ACP_METHOD_NOT_FOUND = 'ACP_METHOD_NOT_FOUND',
  ACP_INVALID_PARAMS = 'ACP_INVALID_PARAMS',
  AGENT_INTERNAL_ERROR = 'AGENT_INTERNAL_ERROR',
  ACP_SESSION_NOT_FOUND = 'ACP_SESSION_NOT_FOUND',
  AGENT_SESSION_NOT_FOUND = 'AGENT_SESSION_NOT_FOUND',
  ACP_ELICITATION_REQUIRED = 'ACP_ELICITATION_REQUIRED',
  ACP_REQ_CANCELLED = 'ACP_REQ_CANCELLED',
  UNKNOWN = 'UNKNOWN',
}

export interface AcpError {
  type: AcpErrorType;
  code: string;
  message: string;
  retryable: boolean;
  details?: unknown;
}

// ACP 结果类型 - 类型安全的结果处理 / ACP Result Type - Type-safe result handling
export type AcpResult<T = unknown> = { success: true; data: T } | { success: false; error: AcpError };

// 创建 ACP 错误的辅助函数 / Helper function to create ACP errors
export function createAcpError(
  type: AcpErrorType,
  message: string,
  retryable: boolean = false,
  details?: unknown
): AcpError {
  return {
    type,
    code: type.toString(),
    message,
    retryable,
    details,
  };
}

export function isRetryableError(error: AcpError): boolean {
  return error.retryable || error.type === AcpErrorType.CONNECTION_NOT_READY;
}

// ACP JSON-RPC 协议类型 / ACP JSON-RPC Protocol Types
export const JSONRPC_VERSION = '2.0' as const;

export interface AcpRequest {
  jsonrpc: typeof JSONRPC_VERSION;
  id: number;
  method: string;
  params?: Record<string, unknown> | unknown[];
}

export interface AcpResponse {
  jsonrpc: typeof JSONRPC_VERSION;
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
}

export interface AcpNotification {
  jsonrpc: typeof JSONRPC_VERSION;
  method: string;
  params?: Record<string, unknown> | unknown[];
}

// ── Initialize response types (from ACP spec) ──────────────────────────

/**
 * Prompt content types the agent can accept.
 * Per ACP spec, omitted fields default to false.
 */
export type AcpPromptCapabilities = {
  image: boolean;
  audio: boolean;
  embeddedContext: boolean;
};

/**
 * MCP transport types the agent supports.
 * stdio is mandatory per ACP spec IF the agent declares mcpCapabilities at all.
 * If mcpCapabilities is absent from the initialize response, all transports are false.
 */
export type AcpMcpCapabilities = {
  stdio: boolean;
  http: boolean;
  sse: boolean;
};

/**
 * Session operations the agent supports.
 * Per ACP spec, key presence (e.g. `{ fork: {} }`) indicates support;
 * values are `{}` reserved for future extension.
 * null = unsupported (key was omitted in the response).
 */
export type AcpSessionCapabilities = {
  fork: Record<string, unknown> | null;
  resume: Record<string, unknown> | null;
  list: Record<string, unknown> | null;
  close: Record<string, unknown> | null;
};

/**
 * Parsed agent capabilities from the initialize response.
 * Field names match the ACP protocol wire format to avoid confusion.
 * All fields have safe defaults — no undefined checks needed by callers.
 */
export type AcpAgentCapabilities = {
  loadSession: boolean;
  promptCapabilities: AcpPromptCapabilities;
  mcpCapabilities: AcpMcpCapabilities;
  sessionCapabilities: AcpSessionCapabilities;
  /** Backend-specific metadata (_meta from agentCapabilities) */
  _meta: Record<string, unknown>;
};

/** Agent identity info from initialize response. */
export type AcpAgentInfo = {
  name: string;
  version: string;
  title?: string;
};

/**
 * Authentication method descriptor from initialize response.
 * Backends may extend this with extra fields (e.g. `type`, `vars`).
 */
export type AcpAuthMethod = {
  id: string;
  name: string;
  description?: string;
  /** Extended fields — e.g. Codex uses `type: "env_var"` and `vars` */
  [key: string]: unknown;
};

/**
 * Fully parsed initialize response (the `result` from JSON-RPC).
 * Consolidates all top-level fields per ACP initialization spec.
 */
export type AcpInitializeResult = {
  protocolVersion: number;
  capabilities: AcpAgentCapabilities;
  agentInfo: AcpAgentInfo | null;
  auth_methods: AcpAuthMethod[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function toBool(v: unknown): boolean {
  return v === true;
}

function parseAgentCapabilitiesObject(raw: unknown): AcpAgentCapabilities {
  const caps = isRecord(raw) ? raw : null;

  const prompt = caps && isRecord(caps.promptCapabilities) ? caps.promptCapabilities : null;
  const mcp = caps && isRecord(caps.mcpCapabilities) ? caps.mcpCapabilities : null;
  const session = caps && isRecord(caps.sessionCapabilities) ? caps.sessionCapabilities : null;
  const meta = caps && isRecord(caps._meta) ? (caps._meta as Record<string, unknown>) : {};

  return {
    loadSession: toBool(caps?.loadSession),
    promptCapabilities: {
      image: toBool(prompt?.image),
      audio: toBool(prompt?.audio),
      embeddedContext: toBool(prompt?.embeddedContext),
    },
    mcpCapabilities: {
      // stdio is mandatory per ACP spec — but only if the agent declares mcpCapabilities at all.
      // If mcpCapabilities is entirely absent, the agent does not support MCP.
      stdio: mcp !== null,
      http: toBool(mcp?.http),
      sse: toBool(mcp?.sse),
    },
    sessionCapabilities: {
      fork: isRecord(session?.fork) ? (session.fork as Record<string, unknown>) : null,
      resume: isRecord(session?.resume) ? (session.resume as Record<string, unknown>) : null,
      list: isRecord(session?.list) ? (session.list as Record<string, unknown>) : null,
      close: isRecord(session?.close) ? (session.close as Record<string, unknown>) : null,
    },
    _meta: meta,
  };
}

function parseAgentInfo(raw: unknown): AcpAgentInfo | null {
  if (!isRecord(raw)) return null;
  const name = typeof raw.name === 'string' ? raw.name : '';
  const version = typeof raw.version === 'string' ? raw.version : '';
  if (!name && !version) return null;
  return {
    name,
    version,
    ...(typeof raw.title === 'string' && { title: raw.title }),
  };
}

function parseAuthMethods(raw: unknown): AcpAuthMethod[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is AcpAuthMethod => isRecord(item) && typeof item.id === 'string' && typeof item.name === 'string'
  );
}

/**
 * Parse the raw initialize result (unwrapped from JSON-RPC `result` field)
 * into a fully structured AcpInitializeResult.
 *
 * Follows ACP spec: omitted capabilities are treated as unsupported (false).
 */
export function parseInitializeResult(raw: unknown): AcpInitializeResult {
  const result = isRecord(raw) ? raw : null;

  return {
    protocolVersion: typeof result?.protocolVersion === 'number' ? result.protocolVersion : 0,
    capabilities: parseAgentCapabilitiesObject(result?.agentCapabilities),
    agentInfo: parseAgentInfo(result?.agentInfo),
    auth_methods: parseAuthMethods(result?.auth_methods),
  };
}

/**
 * Parse raw initialize result into structured AcpAgentCapabilities only.
 * Convenience wrapper — use parseInitializeResult() for full response.
 */
export function parseAgentCapabilities(raw: unknown): AcpAgentCapabilities {
  const result = isRecord(raw) ? raw : null;
  return parseAgentCapabilitiesObject(result?.agentCapabilities);
}

// 所有会话更新的基础接口 / Base interface for all session updates
export interface BaseSessionUpdate {
  session_id: string;
}

// Agent 消息块更新 / Agent message chunk update
export interface AgentMessageChunkUpdate extends BaseSessionUpdate {
  update: {
    sessionUpdate: 'agent_message_chunk';
    content: {
      type: 'text' | 'image';
      text?: string;
      data?: string;
      mimeType?: string;
      uri?: string;
    };
  };
}

// Agent 思考块更新 / Agent thought chunk update
export interface AgentThoughtChunkUpdate extends BaseSessionUpdate {
  update: {
    sessionUpdate: 'agent_thought_chunk';
    content: {
      type: 'text';
      text: string;
    };
  };
}

// ===== 共享子类型 / Shared sub-types =====

/** Tool call 内容项类型 / Tool call content item type */
export interface ToolCallContentItem {
  type: 'content' | 'diff';
  content?: {
    type: 'text';
    text: string;
  };
  path?: string;
  old_text?: string | null;
  new_text?: string;
}

/** Tool call 位置项类型 / Tool call location item type */
export interface ToolCallLocationItem {
  path: string;
}

// 工具调用更新 / Tool call update
export interface ToolCallUpdate extends BaseSessionUpdate {
  update: {
    sessionUpdate: 'tool_call';
    tool_call_id: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    title: string;
    kind: 'read' | 'edit' | 'execute';
    rawInput?: Record<string, unknown>;
    content?: ToolCallContentItem[];
    locations?: ToolCallLocationItem[];
  };
}

// 工具调用状态更新 / Tool call update (status change)
export interface ToolCallUpdateStatus extends BaseSessionUpdate {
  update: {
    sessionUpdate: 'tool_call_update';
    tool_call_id: string;
    status: 'completed' | 'failed';
    // rawInput may arrive in tool_call_update with complete data (after streaming completes)
    // This happens when input_json_delta finishes and the full input is available
    rawInput?: Record<string, unknown>;
    content?: Array<{
      type: 'content';
      content: {
        type: 'text';
        text: string;
      };
    }>;
  };
}

// 计划更新 / Plan update
export interface PlanUpdate extends BaseSessionUpdate {
  update: {
    sessionUpdate: 'plan';
    entries: Array<{
      content: string;
      status: 'pending' | 'in_progress' | 'completed';
      priority?: 'low' | 'medium' | 'high';
    }>;
  };
}

// 可用命令更新 / Available commands update
export interface AvailableCommandsUpdate extends BaseSessionUpdate {
  update: {
    sessionUpdate: 'available_commands_update';
    availableCommands: Array<{
      name: string;
      description: string;
      input?: {
        hint?: string;
      } | null;
    }>;
  };
}

// 用户消息块更新 / User message chunk update
export interface UserMessageChunkUpdate extends BaseSessionUpdate {
  update: {
    sessionUpdate: 'user_message_chunk';
    content: {
      type: 'text' | 'image';
      text?: string;
      data?: string;
      mimeType?: string;
      uri?: string;
    };
  };
}

// ===== ACP ConfigOption types (stable API) =====

/** A single select option within a config option */
export interface AcpConfigSelectOption {
  value: string;
  name?: string;
  label?: string; // Some agents may use label instead of name
}

/** A configuration option returned by session/new */
export interface AcpSessionConfigOption {
  id: string;
  name?: string;
  label?: string; // Some agents may use label instead of name
  description?: string;
  category?: string;
  type: 'select' | 'boolean' | 'string';
  current_value?: string;
  selected_value?: string; // Some agents may use selected_value instead of current_value
  options?: AcpConfigSelectOption[];
}

/** Config options update notification (within session/update) */
export interface ConfigOptionsUpdatePayload extends BaseSessionUpdate {
  update: {
    sessionUpdate: 'config_option_update';
    config_options: AcpSessionConfigOption[];
  };
}

/** Usage update notification from ACP backend (context window utilization, supported by claude-agent-acp and codex-acp) */
export interface UsageUpdatePayload extends BaseSessionUpdate {
  update: {
    sessionUpdate: 'usage_update';
    /** Total tokens currently in context */
    used: number;
    /** Context window capacity (max tokens) */
    size: number;
    /** Cumulative session cost */
    cost?: {
      amount: number;
      currency: string;
    };
  };
}

/** Per-turn token usage from PromptResponse (unstable ACP spec, supported by codex-acp) */
export interface AcpPromptResponseUsage {
  /** Total input tokens (includes context from previous turns) */
  inputTokens: number;
  /** Total output tokens for this turn */
  outputTokens: number;
  /** Sum of all token types */
  total_tokens: number;
  /** Tokens read from cache */
  cachedReadTokens?: number | null;
  /** Tokens written to cache */
  cachedWriteTokens?: number | null;
  /** Reasoning/thinking tokens */
  thoughtTokens?: number | null;
}

// ===== ACP Models types (unstable API) =====

/** An available model returned by session/new (unstable API) */
export interface AcpAvailableModel {
  id?: string;
  model_id?: string; // OpenCode uses model_id instead of id
  name?: string;
}

/** Models info returned by session/new (unstable API) */
export interface AcpSessionModels {
  current_model_id?: string;
  available_models?: AcpAvailableModel[];
}

/** Mode entry in the top-level `modes` object of session/new response */
export interface AcpAvailableMode {
  id: string;
  name?: string;
  description?: string;
}

/** Modes info returned by session/new (used by qoder, opencode, etc.) */
export interface AcpSessionModes {
  current_mode_id?: string;
  available_modes?: AcpAvailableMode[];
}

// ===== Unified model info for UI =====

export interface AcpModelInfo {
  /** Currently active model ID */
  current_model_id: string | null;
  /** Display label for the current model */
  current_model_label: string | null;
  /** Available models for switching */
  available_models: Array<{ id: string; label: string }>;
}

// 所有会话更新的联合类型 / Union type for all session updates
export type AcpSessionUpdate =
  | AgentMessageChunkUpdate
  | AgentThoughtChunkUpdate
  | ToolCallUpdate
  | ToolCallUpdateStatus
  | PlanUpdate
  | AvailableCommandsUpdate
  | UserMessageChunkUpdate
  | ConfigOptionsUpdatePayload
  | UsageUpdatePayload;

// 当前的 ACP 权限请求接口 / Current ACP permission request interface
export interface AcpPermissionOption {
  option_id: string;
  name: string;
  kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always';
}
export interface AcpPermissionRequest {
  session_id: string;
  options: Array<AcpPermissionOption>;
  tool_call: {
    tool_call_id: string;
    raw_input?: {
      command?: string;
      description?: string;
      [key: string]: unknown;
    };
    status?: string;
    title?: string;
    kind?: string;
    content?: ToolCallContentItem[];
    locations?: ToolCallLocationItem[];
  };
}

// 历史兼容性类型 - 支持旧版本数据结构 / Legacy compatibility type - supports old version data structures
export interface LegacyAcpPermissionData extends Record<string, unknown> {
  // 可能的旧版本字段 / Possible old version fields
  options?: Array<{
    option_id?: string;
    optionId?: string;
    name?: string;
    kind?: string;
    // 兼容可能的其他字段 / Compatible with other possible fields
    [key: string]: unknown;
  }>;
  tool_call?: {
    tool_call_id?: string;
    raw_input?: unknown;
    title?: string;
    kind?: string;
    [key: string]: unknown;
  };
  toolCall?: {
    tool_call_id?: string;
    rawInput?: unknown;
    title?: string;
    kind?: string;
    // 兼容可能的其他字段 / Compatible with other possible fields
    [key: string]: unknown;
  };
}

// 兼容性联合类型 / Compatibility union type
export type CompatibleAcpPermissionData = AcpPermissionRequest | LegacyAcpPermissionData;

export type AcpMessage = AcpRequest | AcpNotification | AcpResponse | AcpSessionUpdate;

// 文件操作请求类型 / File Operation Request Types
export interface AcpFileWriteRequest extends AcpRequest {
  method: 'fs/write_text_file';
  params: {
    session_id: string;
    path: string;
    content: string;
  };
}

export interface AcpFileReadRequest extends AcpRequest {
  method: 'fs/read_text_file';
  params: {
    session_id: string;
    path: string;
  };
}

// ===== ACP 协议方法常量 / ACP Protocol Method Constants =====
// 这些常量定义了 ACP 协议中使用的 method 名称
// 来源：现有代码实现（无官方协议文档，如有更新请同步修改）
// These constants define the method names used in the ACP protocol.
// Source: Existing code implementation (no official protocol docs, sync changes if updated).

export const ACP_METHODS = {
  SESSION_UPDATE: 'session/update',
  REQUEST_PERMISSION: 'session/request_permission',
  READ_TEXT_FILE: 'fs/read_text_file',
  WRITE_TEXT_FILE: 'fs/write_text_file',
  SET_CONFIG_OPTION: 'session/set_config_option',
} as const;

export type AcpMethod = (typeof ACP_METHODS)[keyof typeof ACP_METHODS];

// ===== 可辨识联合类型 / Discriminated Union Types =====
// 用于 AcpConnection.handleIncomingRequest 的类型安全分发
// Used for type-safe dispatching in AcpConnection.handleIncomingRequest

/** Session 更新通知 / Session update notification */
export interface AcpSessionUpdateNotification {
  jsonrpc: typeof JSONRPC_VERSION;
  method: typeof ACP_METHODS.SESSION_UPDATE;
  params: AcpSessionUpdate;
}

/** 权限请求消息 / Permission request message */
export interface AcpPermissionRequestMessage {
  jsonrpc: typeof JSONRPC_VERSION;
  id: number;
  method: typeof ACP_METHODS.REQUEST_PERMISSION;
  params: AcpPermissionRequest;
}

/** 文件读取请求（带类型化 params）/ File read request (with typed params) */
export interface AcpFileReadMessage {
  jsonrpc: typeof JSONRPC_VERSION;
  id: number;
  method: typeof ACP_METHODS.READ_TEXT_FILE;
  params: {
    path: string;
    session_id?: string;
  };
}

/** 文件写入请求（带类型化 params）/ File write request (with typed params) */
export interface AcpFileWriteMessage {
  jsonrpc: typeof JSONRPC_VERSION;
  id: number;
  method: typeof ACP_METHODS.WRITE_TEXT_FILE;
  params: {
    path: string;
    content: string;
    session_id?: string;
  };
}

/**
 * ACP 入站消息联合类型
 * TypeScript 可根据 method 字段自动窄化类型
 *
 * ACP incoming message union type.
 * TypeScript can automatically narrow the type based on the method field.
 */
export type AcpIncomingMessage =
  | AcpSessionUpdateNotification
  | AcpPermissionRequestMessage
  | AcpFileReadMessage
  | AcpFileWriteMessage;
