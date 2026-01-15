/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ACP Backend 类型定义
 * ACP Backend Type Definitions
 *
 * 为了更好的扩展性，将所有支持的 ACP 后端定义在此处
 * 当需要支持新的后端时，只需要在这里添加即可
 * For better extensibility, all supported ACP backends are defined here.
 * When adding a new backend, simply add it here.
 */

/**
 * 预设助手的主 Agent 类型，用于决定创建哪种类型的对话
 * The primary agent type for preset assistants, used to determine which conversation type to create.
 */
export type PresetAgentType = 'gemini' | 'claude' | 'codex';

// 全部后端类型定义 - 包括暂时不支持的 / All backend types - including temporarily unsupported ones
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
 *
 * Potential ACP CLI tools list.
 * Used for auto-detecting CLI tools installed on user's local machine.
 * When new ACP CLI tools are released, simply add them to this list.
 */
export interface PotentialAcpCli {
  /** CLI 可执行文件名 / CLI executable filename */
  cmd: string;
  /** ACP 启动参数 / ACP launch arguments */
  args: string[];
  /** 显示名称 / Display name */
  name: string;
  /** 对应的 backend id / Corresponding backend id */
  backendId: AcpBackendAll;
}

/** 默认的 ACP 启动参数 / Default ACP launch arguments */
const DEFAULT_ACP_ARGS = ['--experimental-acp'];

/**
 * 从 ACP_BACKENDS_ALL 生成可检测的 CLI 列表
 * 仅包含有 cliCommand 且已启用的后端（排除 gemini 和 custom）
 * Generate detectable CLI list from ACP_BACKENDS_ALL
 * Only includes enabled backends with cliCommand (excludes gemini and custom)
 */
function generatePotentialAcpClis(): PotentialAcpCli[] {
  // 需要在 ACP_BACKENDS_ALL 定义之后调用，所以使用延迟初始化
  // Must be called after ACP_BACKENDS_ALL is defined, so use lazy initialization
  return Object.entries(ACP_BACKENDS_ALL)
    .filter(([id, config]) => {
      // 排除没有 CLI 命令的后端（gemini 内置，custom 用户配置）
      // Exclude backends without CLI command (gemini is built-in, custom is user-configured)
      if (!config.cliCommand) return false;
      if (id === 'gemini' || id === 'custom') return false;
      return config.enabled;
    })
    .map(([id, config]) => ({
      cmd: config.cliCommand!,
      args: config.acpArgs || DEFAULT_ACP_ARGS,
      name: config.name,
      backendId: id as AcpBackendAll,
    }));
}

// 延迟初始化，避免循环依赖 / Lazy initialization to avoid circular dependency
let _potentialAcpClis: PotentialAcpCli[] | null = null;

/**
 * 已知支持 ACP 协议的 CLI 工具列表
 * 检测时会遍历此列表，用 `which` 命令检查是否安装
 * 从 ACP_BACKENDS_ALL 自动生成，避免数据冗余
 */
export const POTENTIAL_ACP_CLIS: PotentialAcpCli[] = new Proxy([] as PotentialAcpCli[], {
  get(_target, prop) {
    if (_potentialAcpClis === null) {
      _potentialAcpClis = generatePotentialAcpClis();
    }
    if (prop === 'length') return _potentialAcpClis.length;
    if (typeof prop === 'string' && !isNaN(Number(prop))) {
      return _potentialAcpClis[Number(prop)];
    }
    if (prop === Symbol.iterator) {
      return function* () {
        yield* _potentialAcpClis!;
      };
    }
    if (prop === 'map') return _potentialAcpClis.map.bind(_potentialAcpClis);
    if (prop === 'filter') return _potentialAcpClis.filter.bind(_potentialAcpClis);
    if (prop === 'forEach') return _potentialAcpClis.forEach.bind(_potentialAcpClis);
    return Reflect.get(_potentialAcpClis, prop);
  },
});

/**
 * ACP 后端 Agent 配置
 * 用于内置后端（claude, gemini, qwen）和用户自定义 Agent
 *
 * Configuration for an ACP backend agent.
 * Used for both built-in backends (claude, gemini, qwen) and custom user agents.
 */
export interface AcpBackendConfig {
  /** 后端唯一标识符 / Unique identifier for the backend (e.g., 'claude', 'gemini', 'custom') */
  id: string;

  /** UI 显示名称 / Display name shown in the UI (e.g., 'Goose', 'Claude Code') */
  name: string;

  /** 本地化名称 / Localized names (e.g., { 'zh-CN': '...', 'en-US': '...' }) */
  nameI18n?: Record<string, string>;

  /** 助手列表或设置中显示的简短描述 / Short description shown in assistant lists or settings */
  description?: string;

  /** 本地化描述 / Localized descriptions (e.g., { 'zh-CN': '...', 'en-US': '...' }) */
  descriptionI18n?: Record<string, string>;

  /** 助手头像 - 可以是 emoji 或图片路径 / Avatar for the assistant - can be an emoji string or image path */
  avatar?: string;

  /**
   * 用于 `which` 命令检测的 CLI 命令名
   * 仅当二进制文件名与 id 不同时需要
   *
   * CLI command name used for detection via `which` command.
   * Example: 'goose', 'claude', 'qwen'
   * Only needed if the binary name differs from id.
   */
  cliCommand?: string;

  /**
   * 完整 CLI 路径（可包含空格分隔的参数）
   * 用于启动进程
   *
   * Full CLI path with optional arguments (space-separated).
   * Used when spawning the process.
   * Examples:
   *   - 'goose' (simple binary)
   *   - 'npx @qwen-code/qwen-code' (npx package)
   *   - '/usr/local/bin/my-agent --verbose' (full path with args)
   * Note: '--experimental-acp' is auto-appended for non-custom backends.
   */
  defaultCliPath?: string;

  /** 使用前是否需要认证 / Whether this backend requires authentication before use */
  authRequired?: boolean;

  /** 是否启用并显示在 UI 中 / Whether this backend is enabled and should appear in the UI */
  enabled?: boolean;

  /** 是否支持流式响应 / Whether this backend supports streaming responses */
  supportsStreaming?: boolean;

  /**
   * 传递给子进程的自定义环境变量
   * 启动时与 process.env 合并
   *
   * Custom environment variables to pass to the spawned process.
   * Merged with process.env when spawning.
   * Example: { "ANTHROPIC_API_KEY": "sk-...", "DEBUG": "true" }
   */
  env?: Record<string, string>;

  /**
   * 启用 ACP 模式时的参数
   * 不同 CLI 使用不同约定：
   *   - ['--experimental-acp'] 用于 claude, qwen（未指定时的默认值）
   *   - ['acp'] 用于 goose（子命令）
   *   - ['--acp'] 用于 auggie
   *
   * Arguments to enable ACP mode when spawning the CLI.
   * Different CLIs use different conventions:
   *   - ['--experimental-acp'] for claude, qwen (default if not specified)
   *   - ['acp'] for goose (subcommand)
   *   - ['--acp'] for auggie
   * If not specified, defaults to ['--experimental-acp'].
   */
  acpArgs?: string[];

  /** 是否为基于提示词的预设（无需 CLI 二进制文件）/ Whether this is a prompt-based preset (no CLI binary required) */
  isPreset?: boolean;

  /** 此预设的系统提示词或规则上下文 / The system prompt or rule context for this preset */
  context?: string;

  /** 此预设的本地化提示词 / Localized prompts for this preset (e.g., { 'zh-CN': '...', 'en-US': '...' }) */
  contextI18n?: Record<string, string>;

  /**
   * 此预设的主 Agent 类型（仅 isPreset=true 时生效）
   * 决定选择此预设时创建哪种类型的对话
   * - 'gemini': 创建 Gemini 对话
   * - 'claude': 创建使用 Claude 后端的 ACP 对话
   * - 'codex': 创建 Codex 对话
   * 为向后兼容默认为 'gemini'
   *
   * The primary agent type for this preset (only applies when isPreset=true).
   * Determines which conversation type to create when selecting this preset.
   * - 'gemini': Creates a Gemini conversation
   * - 'claude': Creates an ACP conversation with Claude backend
   * - 'codex': Creates a Codex conversation
   * Defaults to 'gemini' for backward compatibility.
   */
  presetAgentType?: PresetAgentType;

  /**
   * 此助手可用的模型列表（仅 isPreset=true 时生效）
   * 如果未指定，将使用系统默认的模型列表
   *
   * Available models for this assistant (only applies when isPreset=true).
   * If not specified, system default models will be used.
   */
  models?: string[];

  /** 是否为内置助手（不可编辑/删除）/ Whether this is a built-in assistant (cannot be edited/deleted) */
  isBuiltin?: boolean;

  /**
   * 此助手启用的 skills 列表（仅 isPreset=true 时生效）
   * 如果未指定或为空数组，将加载所有可用 skills
   *
   * Enabled skills for this assistant (only applies when isPreset=true).
   * If not specified or empty array, all available skills will be loaded.
   */
  enabledSkills?: string[];
}

// 所有后端配置 - 包括暂时禁用的 / All backend configurations - including temporarily disabled ones
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

// 仅启用的后端配置 / Enabled backends only
export const ACP_ENABLED_BACKENDS: Record<string, AcpBackendConfig> = Object.fromEntries(Object.entries(ACP_BACKENDS_ALL).filter(([_, config]) => config.enabled));

// 当前启用的后端类型 / Currently enabled backend types
export type AcpBackend = keyof typeof ACP_BACKENDS_ALL;
export type AcpBackendId = AcpBackend; // 向后兼容 / Backward compatibility

// 工具函数 / Utility functions
export function isValidAcpBackend(backend: string): backend is AcpBackend {
  return backend in ACP_ENABLED_BACKENDS;
}

export function getAcpBackendConfig(backend: AcpBackend): AcpBackendConfig {
  return ACP_ENABLED_BACKENDS[backend];
}

// 获取所有启用的后端配置 / Get all enabled backend configurations
export function getEnabledAcpBackends(): AcpBackendConfig[] {
  return Object.values(ACP_ENABLED_BACKENDS);
}

// 获取所有后端配置（包括禁用的）/ Get all backend configurations (including disabled ones)
export function getAllAcpBackends(): AcpBackendConfig[] {
  return Object.values(ACP_BACKENDS_ALL);
}

// 检查后端是否启用 / Check if a backend is enabled
export function isAcpBackendEnabled(backend: AcpBackendAll): boolean {
  return ACP_BACKENDS_ALL[backend]?.enabled ?? false;
}

// ACP 错误类型系统 - 优雅的错误处理 / ACP Error Type System - Elegant error handling
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
  details?: unknown;
}

// ACP 结果类型 - 类型安全的结果处理 / ACP Result Type - Type-safe result handling
export type AcpResult<T = unknown> = { success: true; data: T } | { success: false; error: AcpError };

// 创建 ACP 错误的辅助函数 / Helper function to create ACP errors
export function createAcpError(type: AcpErrorType, message: string, retryable: boolean = false, details?: unknown): AcpError {
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

// 所有会话更新的基础接口 / Base interface for all session updates
export interface BaseSessionUpdate {
  sessionId: string;
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
  oldText?: string | null;
  newText?: string;
}

/** Tool call 位置项类型 / Tool call location item type */
export interface ToolCallLocationItem {
  path: string;
}

// 工具调用更新 / Tool call update
export interface ToolCallUpdate extends BaseSessionUpdate {
  update: {
    sessionUpdate: 'tool_call';
    toolCallId: string;
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

// 当前模式更新 / Current mode update
export interface CurrentModeUpdate extends BaseSessionUpdate {
  update: {
    sessionUpdate: 'current_mode_update';
    mode: string;
    description?: string;
  };
}

// 所有会话更新的联合类型 / Union type for all session updates
export type AcpSessionUpdate = AgentMessageChunkUpdate | AgentThoughtChunkUpdate | ToolCallUpdate | ToolCallUpdateStatus | PlanUpdate | AvailableCommandsUpdate | UserMessageChunkUpdate;
// | CurrentModeUpdate;

// 当前的 ACP 权限请求接口 / Current ACP permission request interface
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
    optionId?: string;
    name?: string;
    kind?: string;
    // 兼容可能的其他字段 / Compatible with other possible fields
    [key: string]: unknown;
  }>;
  toolCall?: {
    toolCallId?: string;
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
    sessionId?: string;
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
    sessionId?: string;
  };
}

/**
 * ACP 入站消息联合类型
 * TypeScript 可根据 method 字段自动窄化类型
 *
 * ACP incoming message union type.
 * TypeScript can automatically narrow the type based on the method field.
 */
export type AcpIncomingMessage = AcpSessionUpdateNotification | AcpPermissionRequestMessage | AcpFileReadMessage | AcpFileWriteMessage;
