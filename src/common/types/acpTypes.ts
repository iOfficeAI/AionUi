/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const CODEX_ACP_BRIDGE_VERSION = '0.9.5';
export const CODEX_ACP_NPX_PACKAGE = `@zed-industries/codex-acp@${CODEX_ACP_BRIDGE_VERSION}`;

export const CLAUDE_ACP_BRIDGE_VERSION = '0.29.2';
export const CLAUDE_ACP_NPX_PACKAGE = `@agentclientprotocol/claude-agent-acp@${CLAUDE_ACP_BRIDGE_VERSION}`;

export const CODEBUDDY_ACP_BRIDGE_VERSION = '2.73.0';
export const CODEBUDDY_ACP_NPX_PACKAGE = `@tencent-ai/codebuddy-code@${CODEBUDDY_ACP_BRIDGE_VERSION}`;

// ACP 后端类型定义 — 仅包含 ACP 协议相关的后端
// ACP backend types — only ACP protocol backends
export type AcpBackendAll =
  | 'claude' // Claude ACP
  // | 'gemini' // Google Gemini — not an ACP agent, handled by AgentRegistry directly
  | 'qwen' // Qwen Code ACP
  | 'codex' // OpenAI Codex ACP (via codex-acp bridge)
  | 'codebuddy' // Tencent CodeBuddy Code CLI
  | 'droid' // Factory Droid CLI (ACP via `droid exec --output-format acp`)
  | 'goose' // Block's Goose CLI
  | 'auggie' // Augment Code CLI
  | 'kimi' // Kimi CLI (Moonshot)
  | 'opencode' // OpenCode CLI
  | 'copilot' // GitHub Copilot CLI
  | 'qoder' // Qoder CLI
  | 'vibe' // Mistral Vibe CLI
  | 'cursor' // Cursor AI Agent CLI
  | 'kiro' // Kiro CLI (AWS)
  | 'hermes' // Hermes Agent CLI (Nous Research)
  | 'snow' // Snow AI CLI
  | 'custom'; // User-configured custom ACP agent (extension adapters)

// Superset type covering all execution engine backends (ACP + non-ACP).
export type AgentBackend = AcpBackendAll | 'gemini' | 'remote' | 'aionrs' | 'nanobot' | 'openclaw-gateway';

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
 * 仅包含有 cliCommand 且已启用的后端（排除 custom）
 * Generate detectable CLI list from ACP_BACKENDS_ALL
 * Only includes enabled backends with cliCommand (excludes custom)
 */
function generatePotentialAcpClis(): PotentialAcpCli[] {
  // 需要在 ACP_BACKENDS_ALL 定义之后调用，所以使用延迟初始化
  // Must be called after ACP_BACKENDS_ALL is defined, so use lazy initialization
  return Object.entries(ACP_BACKENDS_ALL)
    .filter(([id, config]) => {
      // Exclude backends without CLI command (custom is user-configured)
      if (!config.cliCommand) return false;
      if (id === 'custom') return false;
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
   * 扩展声明的 API Key 字段列表
   * 用户可在 Settings UI 中配置这些值，配置后作为环境变量注入到子进程
   *
   * API Key fields declared by extensions for user configuration in Settings UI.
   * User-entered values are injected as environment variables when spawning the process.
   * Example: [{ key: "MY_API_KEY", label: "API Key", type: "password", required: true }]
   */
  apiKeyFields?: Array<{
    key: string;
    label: string;
    type: 'text' | 'password' | 'select' | 'number' | 'boolean';
    required?: boolean;
    options?: string[];
    default?: string | number | boolean;
  }>;

  /**
   * 启用 ACP 模式时的参数
   * 不同 CLI 使用不同约定：
   *   - ['--experimental-acp'] 用于 claude（未指定时的默认值）
   *   - ['--acp'] 用于 qwen, auggie
   *   - ['acp'] 用于 goose（子命令）
   *
   * Arguments to enable ACP mode when spawning the CLI.
   * Different CLIs use different conventions:
   *   - ['--experimental-acp'] for claude (default if not specified)
   *   - ['--acp'] for qwen, auggie
   *   - ['acp'] for goose (subcommand)
   * If not specified, defaults to ['--experimental-acp'].
   */
  acpArgs?: string[];

  /**
   * 原生 skill 发现目录（相对于 workspace 根目录）
   * 只有配置了此字段的 CLI 才支持原生 skill 发现（CLI 自动扫描目录中的 SKILL.md）
   * 未配置的 backend 将 fallback 到首条消息注入（prompt injection）
   *
   * Native skill discovery directories (relative to workspace root).
   * Only CLIs with this field support native skill discovery (CLI auto-scans directory for SKILL.md).
   * Backends without this field will fallback to first-message injection (prompt injection).
   */
  skillsDirs?: string[];

  /** 是否为基于提示词的预设（无需 CLI 二进制文件）/ Whether this is a prompt-based preset (no CLI binary required) */
  isPreset?: boolean;

  /** 此预设的系统提示词或规则上下文 / The system prompt or rule context for this preset */
  context?: string;

  /** 此预设的本地化提示词 / Localized prompts for this preset (e.g., { 'zh-CN': '...', 'en-US': '...' }) */
  contextI18n?: Record<string, string>;

  /** 此预设的示例 prompts / Example prompts for this preset */
  prompts?: string[];

  /** 本地化示例 prompts / Localized example prompts */
  promptsI18n?: Record<string, string[]>;

  /**
   * 此预设的主 Agent 类型（仅 isPreset=true 时生效）
   * 决定选择此预设时创建哪种类型的对话
   * - 'gemini': 创建 Gemini 对话
   * - 'claude': 创建使用 Claude 后端的 ACP 对话
   * - 'codex': 创建 Codex 对话
   * - 任意字符串: 扩展贡献的 ACP 适配器 ID（如 'ext-buddy'）
   * 为向后兼容默认为 'gemini'
   *
   * The primary agent type for this preset (only applies when isPreset=true).
   * Determines which conversation type to create when selecting this preset.
   * - 'gemini': Creates a Gemini conversation
   * - 'claude': Creates an ACP conversation with Claude backend
   * - 'codex': Creates a Codex conversation
   * - any string: Extension-contributed ACP adapter ID (e.g. 'ext-buddy')
   * Defaults to 'gemini' for backward compatibility.
   */
  presetAgentType?: string;

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

  /**
   * 通过 "Add Skills" 添加的自定义 skills 名称列表（仅 isPreset=true 时生效）
   * 这些 skills 会显示在 Custom Skills 区域，即使已经被导入
   *
   * List of custom skill names added via "Add Skills" button (only applies when isPreset=true).
   * These skills will be displayed in the Custom Skills section even after being imported.
   */
  customSkillNames?: string[];

  /**
   * 禁用的内置自动注入 skills 列表（仅 isPreset=true 时生效）
   * 内置 skills（_builtin/ 目录下）默认自动注入所有对话，此列表中的 skills 将被排除
   *
   * Disabled builtin auto-injected skills (only applies when isPreset=true).
   * Builtin skills (in _builtin/ directory) are auto-injected by default; skills in this list will be excluded.
   */
  disabledBuiltinSkills?: string[];
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
    skillsDirs: ['.claude/skills'],
  },
  // gemini: not an ACP agent — handled by AgentRegistry as a dedicated DetectedAgentKind
  // gemini: {
  //   id: 'gemini',
  //   name: 'Google CLI',
  //   cliCommand: 'gemini',
  //   authRequired: true,
  //   enabled: false,
  //   supportsStreaming: true,
  //   skillsDirs: ['.gemini/skills'],
  // },
  qwen: {
    id: 'qwen',
    name: 'Qwen Code',
    cliCommand: 'qwen',
    defaultCliPath: 'npx @qwen-code/qwen-code',
    authRequired: true,
    enabled: true, // ✅ 已验证支持：Qwen CLI v0.0.10+ 支持 --acp
    supportsStreaming: true,
    acpArgs: ['--acp'], // Use --acp instead of deprecated --experimental-acp
    skillsDirs: ['.qwen/skills'],
  },
  codex: {
    id: 'codex',
    name: 'Codex',
    cliCommand: 'codex', // Detect local codex CLI (codex-acp bridge invokes it)
    defaultCliPath: `npx ${CODEX_ACP_NPX_PACKAGE}`,
    authRequired: true, // Needs OPENAI_API_KEY or ChatGPT auth
    enabled: true, // ✅ Codex via codex-acp ACP bridge
    supportsStreaming: false,
    acpArgs: [], // codex-acp is ACP by default, no flag needed
    skillsDirs: ['.codex/skills'],
  },
  codebuddy: {
    id: 'codebuddy',
    name: 'CodeBuddy',
    cliCommand: 'codebuddy',
    defaultCliPath: `npx ${CODEBUDDY_ACP_NPX_PACKAGE}`,
    authRequired: true,
    enabled: true, // ✅ Tencent CodeBuddy Code CLI，使用 `codebuddy --acp` 启动
    supportsStreaming: false,
    acpArgs: ['--acp'], // codebuddy 使用 --acp flag
    skillsDirs: ['.codebuddy/skills'],
  },
  goose: {
    id: 'goose',
    name: 'Goose',
    cliCommand: 'goose',
    authRequired: false,
    enabled: true, // ✅ Block's Goose CLI，使用 `goose acp` 启动
    supportsStreaming: false,
    acpArgs: ['acp'], // goose 使用子命令而非 flag
    skillsDirs: ['.goose/skills'],
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
    enabled: true, // ✅ Kimi CLI (Moonshot)，使用 `kimi acp` 启动
    supportsStreaming: false,
    acpArgs: ['acp'], // kimi 使用 acp 子命令
    skillsDirs: ['.kimi/skills'],
  },
  opencode: {
    id: 'opencode',
    name: 'OpenCode',
    cliCommand: 'opencode',
    authRequired: false,
    enabled: true, // ✅ OpenCode CLI，使用 `opencode acp` 启动
    supportsStreaming: false,
    acpArgs: ['acp'], // opencode 使用 acp 子命令
    skillsDirs: ['.opencode/skills'],
  },
  droid: {
    id: 'droid',
    name: 'Factory Droid',
    cliCommand: 'droid',
    // Droid uses FACTORY_API_KEY from environment, not an interactive auth flow.
    authRequired: false,
    enabled: true, // ✅ Factory docs: `droid exec --output-format acp` (JetBrains/Zed ACP integration)
    supportsStreaming: false,
    acpArgs: ['exec', '--output-format', 'acp'],
    skillsDirs: ['.factory/skills'],
  },
  copilot: {
    id: 'copilot',
    name: 'GitHub Copilot',
    cliCommand: 'copilot',
    authRequired: false,
    enabled: true, // ✅ GitHub Copilot CLI，使用 `copilot --acp --stdio` 启动
    supportsStreaming: false,
    acpArgs: ['--acp', '--stdio'], // copilot 使用 --acp --stdio 启动 ACP mode
  },
  qoder: {
    id: 'qoder',
    name: 'Qoder CLI',
    cliCommand: 'qodercli',
    authRequired: false,
    enabled: true, // ✅ Qoder CLI，使用 `qodercli --acp` 启动
    supportsStreaming: false,
    acpArgs: ['--acp'], // qoder 使用 --acp flag
  },
  vibe: {
    id: 'vibe',
    name: 'Mistral Vibe',
    cliCommand: 'vibe-acp',
    authRequired: false,
    enabled: true, // ✅ Mistral Vibe CLI，使用 `vibe-acp` 启动
    supportsStreaming: false,
    acpArgs: [],
    skillsDirs: ['.vibe/skills'],
  },
  cursor: {
    id: 'cursor',
    name: 'Cursor Agent',
    // Note: Cursor CLI uses the generic command name "agent". Detection relies on `which agent`
    // which may match other tools. Users should ensure the Cursor CLI is the `agent` on their PATH.
    cliCommand: 'agent',
    authRequired: true, // Requires active Cursor subscription
    enabled: true, // ✅ Cursor AI Agent CLI, launched via `agent acp`
    supportsStreaming: false,
    acpArgs: ['acp'], // Cursor uses `agent acp` subcommand
    skillsDirs: ['.cursor/skills'],
  },
  kiro: {
    id: 'kiro',
    name: 'Kiro',
    cliCommand: 'kiro-cli',
    authRequired: true, // Requires Kiro / AWS Builder ID login
    enabled: true, // ✅ Kiro CLI, launched via `kiro-cli acp`
    supportsStreaming: false,
    acpArgs: ['acp'], // Kiro uses `kiro-cli acp` subcommand
  },
  hermes: {
    id: 'hermes',
    name: 'Hermes Agent',
    description: 'AI agent by Nous Research with 90+ tools, persistent memory, and multi-platform support',
    cliCommand: 'hermes',
    authRequired: true,
    enabled: true, // ✅ Nous Research Hermes Agent，使用 `hermes acp` 启动
    supportsStreaming: false,
    acpArgs: ['acp'], // hermes 使用 acp 子命令
  },
  snow: {
    id: 'snow',
    name: 'Snow CLI',
    cliCommand: 'snow',
    authRequired: false,
    enabled: true,
    supportsStreaming: false,
    acpArgs: ['--acp'],
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
export const ACP_ENABLED_BACKENDS: Record<string, AcpBackendConfig> = Object.fromEntries(
  Object.entries(ACP_BACKENDS_ALL).filter(([_, config]) => config.enabled)
);

// 当前启用的后端类型 / Currently enabled backend types
export type AcpBackend = keyof typeof ACP_BACKENDS_ALL;
/**
 * Skill directories for non-ACP agents (DetectedAgentKind not in ACP_BACKENDS_ALL).
 * These agents have their own execution engines but still support native skill discovery.
 */
const NON_ACP_SKILLS_DIRS: Record<string, string[]> = {
  gemini: ['.gemini/skills'],
  aionrs: ['.aionrs/skills'],
};

/**
 * 检查给定 agent 类型/backend 是否支持原生 skill 发现
 * Check if a given agent type/backend supports native skill discovery.
 * When false, callers should fallback to prompt injection for skills.
 */
export function hasNativeSkillSupport(agentTypeOrBackend: string | undefined): boolean {
  if (!agentTypeOrBackend) return false;
  const acpConfig = ACP_BACKENDS_ALL[agentTypeOrBackend as AcpBackendAll];
  if (acpConfig?.skillsDirs?.length) return true;
  return !!NON_ACP_SKILLS_DIRS[agentTypeOrBackend]?.length;
}

/**
 * 获取指定 backend 的原生 skill 目录列表
 * Get native skill directories for a given backend.
 * Returns undefined if the backend does not support native skill discovery.
 */
export function getSkillsDirsForBackend(agentTypeOrBackend: string | undefined): string[] | undefined {
  if (!agentTypeOrBackend) return undefined;
  return ACP_BACKENDS_ALL[agentTypeOrBackend as AcpBackendAll]?.skillsDirs ?? NON_ACP_SKILLS_DIRS[agentTypeOrBackend];
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
  authMethods: AcpAuthMethod[];
  /**
   * Top-level modes advertised at initialize time (e.g. qwen-code returns
   * availableModes here rather than on session/new).
   */
  modes: AcpSessionModes | null;
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

function parseSessionModes(raw: unknown): AcpSessionModes | null {
  if (!isRecord(raw)) return null;
  const availableRaw = raw.availableModes;
  if (!Array.isArray(availableRaw)) return null;
  const availableModes: AcpAvailableMode[] = availableRaw.flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== 'string') return [];
    return [
      {
        id: item.id,
        ...(typeof item.name === 'string' && { name: item.name }),
        ...(typeof item.description === 'string' && { description: item.description }),
      },
    ];
  });
  if (availableModes.length === 0) return null;
  return {
    ...(typeof raw.currentModeId === 'string' && { currentModeId: raw.currentModeId }),
    availableModes,
  };
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
    authMethods: parseAuthMethods(result?.authMethods),
    modes: parseSessionModes(result?.modes),
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
  currentValue?: string;
  selectedValue?: string; // Some agents may use selectedValue instead of currentValue
  options?: AcpConfigSelectOption[];
}

/** Config options update notification (within session/update) */
export interface ConfigOptionsUpdatePayload extends BaseSessionUpdate {
  update: {
    sessionUpdate: 'config_option_update';
    configOptions: AcpSessionConfigOption[];
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
  totalTokens: number;
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
  modelId?: string; // OpenCode uses modelId instead of id
  name?: string;
}

/** Models info returned by session/new (unstable API) */
export interface AcpSessionModels {
  currentModelId?: string;
  availableModels?: AcpAvailableModel[];
}

/** Mode entry in the top-level `modes` object of session/new response */
export interface AcpAvailableMode {
  id: string;
  name?: string;
  description?: string;
}

/** Modes info returned by session/new (used by qoder, opencode, etc.) */
export interface AcpSessionModes {
  currentModeId?: string;
  availableModes?: AcpAvailableMode[];
}

// ===== Unified model info for UI =====

/** Unified model info that abstracts over both stable and unstable APIs */
export type AcpModelInfoSourceDetail =
  | 'cc-switch'
  | 'acp-config-option'
  | 'acp-models'
  | 'persisted-model'
  | 'codex-stream';

export interface AcpModelInfo {
  /** Currently active model ID */
  currentModelId: string | null;
  /** Display label for the current model */
  currentModelLabel: string | null;
  /** Available models for switching */
  availableModels: Array<{ id: string; label: string }>;
  /** Whether the user can switch models */
  canSwitch: boolean;
  /** Source of the model info: 'configOption' (stable) or 'models' (unstable) */
  source: 'configOption' | 'models';
  /** More specific source detail for UI diagnostics */
  sourceDetail?: AcpModelInfoSourceDetail;
  /** Config option ID (only when source is 'configOption') */
  configOptionId?: string;
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
  optionId: string;
  name: string;
  kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always';
}
export interface AcpPermissionRequest {
  sessionId: string;
  options: Array<AcpPermissionOption>;
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
export type AcpIncomingMessage =
  | AcpSessionUpdateNotification
  | AcpPermissionRequestMessage
  | AcpFileReadMessage
  | AcpFileWriteMessage;
