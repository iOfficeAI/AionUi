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
  | 'codex' // OpenAI Codex MCP
  | 'goose' // Block's Goose CLI
  | 'auggie' // Augment Code CLI
  | 'kimi' // Kimi CLI (Moonshot)
  | 'opencode' // OpenCode CLI
  | 'custom'; // User-configured custom ACP agent

/**
 * 潜在的 ACP CLI 工具列表
 * 用于自动检测用户本地安装的 CLI 工具
 * 当有新的 ACP CLI 工具发布时，只需在此列表中添加即可
 */
export interface PotentialAcpCli {
  /** CLI 可执行文件名 */
  cmd: string;
  /** ACP 启动参数 */
  args: string[];
  /** 显示名称 */
  name: string;
  /** 对应的 backend id */
  backendId: AcpBackendAll;
}

/**
 * 已知支持 ACP 协议的 CLI 工具列表
 * 检测时会遍历此列表，用 `which` 命令检查是否安装
 */
export const POTENTIAL_ACP_CLIS: PotentialAcpCli[] = [
  // 使用 --experimental-acp 的 CLI
  { cmd: 'claude', args: ['--experimental-acp'], name: 'Claude Code', backendId: 'claude' },
  { cmd: 'qwen', args: ['--experimental-acp'], name: 'Qwen Code', backendId: 'qwen' },
  { cmd: 'iflow', args: ['--experimental-acp'], name: 'iFlow CLI', backendId: 'iflow' },
  { cmd: 'codex', args: ['--experimental-acp'], name: 'Codex', backendId: 'codex' },

  // 使用 acp 子命令的 CLI
  { cmd: 'goose', args: ['acp'], name: 'Goose', backendId: 'goose' },
  { cmd: 'opencode', args: ['acp'], name: 'OpenCode', backendId: 'opencode' },

  // 使用 --acp 标志的 CLI
  { cmd: 'auggie', args: ['--acp'], name: 'Augment Code', backendId: 'auggie' },
  { cmd: 'kimi', args: ['--acp'], name: 'Kimi CLI', backendId: 'kimi' },
];

/**
 * Configuration for an ACP backend agent.
 * Used for both built-in backends (claude, gemini, qwen) and custom user agents.
 */
export interface AcpBackendConfig {
  /** Unique identifier for the backend (e.g., 'claude', 'gemini', 'custom') */
  id: string;

  /** Display name shown in the UI (e.g., 'Goose', 'Claude Code') */
  name: string;

  /**
   * CLI command name used for detection via `which` command.
   * Example: 'goose', 'claude', 'qwen'
   * Only needed if the binary name differs from id.
   */
  cliCommand?: string;

  /**
   * Full CLI path with optional arguments (space-separated).
   * Used when spawning the process.
   * Examples:
   *   - 'goose' (simple binary)
   *   - 'npx @qwen-code/qwen-code' (npx package)
   *   - '/usr/local/bin/my-agent --verbose' (full path with args)
   * Note: '--experimental-acp' is auto-appended for non-custom backends.
   */
  defaultCliPath?: string;

  /** Whether this backend requires authentication before use */
  authRequired?: boolean;

  /** Whether this backend is enabled and should appear in the UI */
  enabled?: boolean;

  /** Whether this backend supports streaming responses */
  supportsStreaming?: boolean;

  /**
   * Custom environment variables to pass to the spawned process.
   * Merged with process.env when spawning.
   * Example: { "ANTHROPIC_API_KEY": "sk-...", "DEBUG": "true" }
   */
  env?: Record<string, string>;

  /**
   * Arguments to enable ACP mode when spawning the CLI.
   * Different CLIs use different conventions:
   *   - ['--experimental-acp'] for claude, qwen (default if not specified)
   *   - ['acp'] for goose (subcommand)
   *   - ['--acp'] for auggie
   * If not specified, defaults to ['--experimental-acp'].
   */
  acpArgs?: string[];
}

// 所有后端配置 - 包括暂时禁用的
export const ACP_BACKENDS_ALL: Record<AcpBackendAll, AcpBackendConfig> = {
  claude: {
    id: 'claude',
    name: 'Claude Code',
    cliCommand: 'claude',
    authRequired: true,
    enabled: true,
    supportsStreaming: false,
  },
  gemini: {
    id: 'gemini',
    name: 'Google CLI',
    cliCommand: 'gemini',
    authRequired: true,
    enabled: false,
    supportsStreaming: true,
  },
  qwen: {
    id: 'qwen',
    name: 'Qwen Code',
    cliCommand: 'qwen',
    defaultCliPath: 'npx @qwen-code/qwen-code',
    authRequired: true,
    enabled: true, // ✅ 已验证支持：Qwen CLI v0.0.10+ 支持 --experimental-acp
    supportsStreaming: true,
  },
  iflow: {
    id: 'iflow',
    name: 'iFlow CLI',
    cliCommand: 'iflow',
    authRequired: true,
    enabled: true,
    supportsStreaming: false,
  },
  codex: {
    id: 'codex',
    name: 'Codex ',
    cliCommand: 'codex',
    authRequired: false,
    enabled: true, // ✅ 已验证支持：Codex CLI v0.4.0+ 支持 acp 模式
    supportsStreaming: false,
  },
  goose: {
    id: 'goose',
    name: 'Goose',
    cliCommand: 'goose',
    authRequired: false,
    enabled: true, // ✅ Block's Goose CLI，使用 `goose acp` 启动
    supportsStreaming: false,
    acpArgs: ['acp'], // goose 使用子命令而非 flag
  },
  auggie: {
    id: 'auggie',
    name: 'Augment Code',
    cliCommand: 'auggie',
    authRequired: false,
    enabled: true, // ✅ Augment Code CLI，使用 `auggie --acp` 启动
    supportsStreaming: false,
    acpArgs: ['--acp'], // auggie 使用 --acp flag
  },
  kimi: {
    id: 'kimi',
    name: 'Kimi CLI',
    cliCommand: 'kimi',
    authRequired: false,
    enabled: true, // ✅ Kimi CLI (Moonshot)，使用 `kimi --acp` 启动
    supportsStreaming: false,
    acpArgs: ['--acp'], // kimi 使用 --acp flag
  },
  opencode: {
    id: 'opencode',
    name: 'OpenCode',
    cliCommand: 'opencode',
    authRequired: false,
    enabled: true, // ✅ OpenCode CLI，使用 `opencode acp` 启动
    supportsStreaming: false,
    acpArgs: ['acp'], // opencode 使用 acp 子命令
  },
  custom: {
    id: 'custom',
    name: 'Custom Agent',
    cliCommand: undefined, // User-configured via settings
    authRequired: false,
    enabled: true,
    supportsStreaming: false,
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
