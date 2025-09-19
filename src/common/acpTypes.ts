/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ACP Backend 类型定义
 *
 * 为了更好的扩展性，将所有支持的 ACP 后端定义在此处
 * 当需要支持新的后端时，只需要在这里添加即可
 */

// 全部后端类型定义 - 包括暂时不支持的
export type AcpBackendAll =
  | 'claude' // Claude ACP
  | 'gemini' // Google Gemini ACP
  | 'qwen' // Qwen Code ACP
  | 'iflow' // iFlow CLI ACP
  | 'openai' // OpenAI ACP (未来支持)
  | 'anthropic' // Anthropic ACP (未来支持)
  | 'cohere' // Cohere ACP (未来支持)
  | 'custom'; // 自定义 ACP 实现

// 后端配置接口
export interface AcpBackendConfig {
  id: string;
  name: string;
  cliCommand?: string;
  defaultCliPath?: string;
  authRequired?: boolean;
  enabled?: boolean; // 是否启用，用于控制后端的可用性
}

// 所有后端配置 - 包括暂时禁用的
export const ACP_BACKENDS_ALL: Record<AcpBackendAll, AcpBackendConfig> = {
  claude: {
    id: 'claude',
    name: 'Claude',
    cliCommand: 'claude',
    authRequired: true,
    enabled: true,
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    cliCommand: 'gemini',
    authRequired: true,
    enabled: false,
  },
  qwen: {
    id: 'qwen',
    name: 'Qwen Code',
    cliCommand: 'qwen',
    defaultCliPath: 'npx @qwen-code/qwen-code',
    authRequired: true,
    enabled: true, // ✅ 已验证支持：Qwen CLI v0.0.10+ 支持 --experimental-acp
  },
  iflow: {
    id: 'iflow',
    name: 'iFlow CLI',
    cliCommand: 'iflow',
    authRequired: true,
    enabled: true,
  },
  openai: {
    id: 'openai',
    name: 'OpenAI GPT',
    cliCommand: 'openai-acp',
    authRequired: true,
    enabled: false,
  },
  anthropic: {
    id: 'anthropic',
    name: 'Anthropic',
    cliCommand: 'anthropic-acp',
    authRequired: true,
    enabled: false,
  },
  cohere: {
    id: 'cohere',
    name: 'Cohere',
    cliCommand: 'cohere-acp',
    authRequired: true,
    enabled: false,
  },
  custom: {
    id: 'custom',
    name: 'Custom ACP',
    cliCommand: 'custom-acp',
    authRequired: true,
    enabled: false,
  },
};

// 仅启用的后端配置
export const ACP_ENABLED_BACKENDS: Record<string, AcpBackendConfig> = Object.fromEntries(Object.entries(ACP_BACKENDS_ALL).filter(([_, config]) => config.enabled));

// 当前启用的后端类型
export type AcpBackend = keyof typeof ACP_BACKENDS_ALL;
export type AcpBackendId = AcpBackend; // 向后兼容

// 工具函数
export function isValidAcpBackend(backend: string): backend is AcpBackend {
  return backend in ACP_ENABLED_BACKENDS;
}

export function getAcpBackendConfig(backend: AcpBackend): AcpBackendConfig {
  return ACP_ENABLED_BACKENDS[backend];
}

// 获取所有启用的后端配置
export function getEnabledAcpBackends(): AcpBackendConfig[] {
  return Object.values(ACP_ENABLED_BACKENDS);
}

// 获取所有后端配置（包括禁用的）
export function getAllAcpBackends(): AcpBackendConfig[] {
  return Object.values(ACP_BACKENDS_ALL);
}

// 检查后端是否启用
export function isAcpBackendEnabled(backend: AcpBackendAll): boolean {
  return ACP_BACKENDS_ALL[backend]?.enabled ?? false;
}

// ACP Error Type System - 优雅的错误处理
export enum AcpErrorType {
  CONNECTION_NOT_READY = 'CONNECTION_NOT_READY',
  AUTHENTICATION_FAILED = 'AUTHENTICATION_FAILED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  UNKNOWN = 'UNKNOWN',
}

export interface AcpError {
  type: AcpErrorType;
  code: string;
  message: string;
  retryable: boolean;
  details?: any;
}

// ACP Result Type - Type-safe result handling
export type AcpResult<T = any> = { success: true; data: T } | { success: false; error: AcpError };

// Helper function to create ACP errors
export function createAcpError(type: AcpErrorType, message: string, retryable: boolean = false, details?: any): AcpError {
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

// ACP JSON-RPC Protocol Types
export const JSONRPC_VERSION = '2.0' as const;

export interface AcpRequest {
  jsonrpc: typeof JSONRPC_VERSION;
  id: number;
  method: string;
  params?: any;
}

export interface AcpResponse {
  jsonrpc: typeof JSONRPC_VERSION;
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
  };
}

export interface AcpNotification {
  jsonrpc: typeof JSONRPC_VERSION;
  method: string;
  params?: any;
}

// Base interface for all session updates
export interface BaseSessionUpdate {
  sessionId: string;
}

// Agent message chunk update
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

// Agent thought chunk update
export interface AgentThoughtChunkUpdate extends BaseSessionUpdate {
  update: {
    sessionUpdate: 'agent_thought_chunk';
    content: {
      type: 'text';
      text: string;
    };
  };
}

// Tool call update
export interface ToolCallUpdate extends BaseSessionUpdate {
  update: {
    sessionUpdate: 'tool_call';
    toolCallId: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    title: string;
    kind: 'read' | 'edit' | 'execute';
    rawInput?: any;
    content?: Array<{
      type: 'content' | 'diff';
      content?: {
        type: 'text';
        text: string;
      };
      path?: string;
      oldText?: string | null;
      newText?: string;
    }>;
    locations?: Array<{
      path: string;
    }>;
  };
}

// Tool call update (status change)
export interface ToolCallUpdateStatus extends BaseSessionUpdate {
  update: {
    sessionUpdate: 'tool_call_update';
    toolCallId: string;
    status: 'completed' | 'failed';
    content?: Array<{
      type: 'content';
      content: {
        type: 'text';
        text: string;
      };
    }>;
  };
}

// Plan update
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

// Available commands update
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

// User message chunk update
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

// Current mode update
export interface CurrentModeUpdate extends BaseSessionUpdate {
  update: {
    sessionUpdate: 'current_mode_update';
    mode: string;
    description?: string;
  };
}

// Union type for all session updates
export type AcpSessionUpdate = AgentMessageChunkUpdate | AgentThoughtChunkUpdate | ToolCallUpdate | ToolCallUpdateStatus | PlanUpdate | AvailableCommandsUpdate | UserMessageChunkUpdate;
// | CurrentModeUpdate;

// 当前的ACP权限请求接口
export interface AcpPermissionRequest {
  sessionId: string;
  options: Array<{
    optionId: string;
    name: string;
    kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always';
  }>;
  toolCall: {
    toolCallId: string;
    rawInput?: {
      command?: string;
      description?: string;
      [key: string]: any;
    };
    status?: string;
    title?: string;
    kind?: string;
    content?: any[];
    locations?: any[];
  };
}

// 历史兼容性类型 - 支持旧版本数据结构
export interface LegacyAcpPermissionData {
  // 可能的旧版本字段
  options?: Array<{
    optionId?: string;
    name?: string;
    kind?: string;
    // 兼容可能的其他字段
    [key: string]: any;
  }>;
  toolCall?: {
    toolCallId?: string;
    rawInput?: any;
    title?: string;
    kind?: string;
    // 兼容可能的其他字段
    [key: string]: any;
  };
  // 兼容完全不同的结构
  [key: string]: any;
}

// 兼容性联合类型
export type CompatibleAcpPermissionData = AcpPermissionRequest | LegacyAcpPermissionData;

export type AcpMessage = AcpRequest | AcpNotification | AcpResponse | AcpSessionUpdate;

// File Operation Request Types
export interface AcpFileWriteRequest extends AcpRequest {
  method: 'fs/write_text_file';
  params: {
    sessionId: string;
    path: string;
    content: string;
  };
}

export interface AcpFileReadRequest extends AcpRequest {
  method: 'fs/read_text_file';
  params: {
    sessionId: string;
    path: string;
  };
}
