/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpBackend, AcpBackendAll, AcpBackendConfig } from '@/common/types/acpTypes';
import type { SpeechToTextConfig } from '@/common/types/speech';
import { storage } from '@office-ai/platform';

// 系统配置存储
export const ConfigStorage = storage.buildStorage<IConfigStorageRefer>('agent.config');

// 系统环境变量存储
export const EnvStorage = storage.buildStorage<IEnvStorageRefer>('agent.env');

export interface IConfigStorageRefer {
  'google.config': {
    /** Proxy URL for Google OAuth endpoint reachability / Google OAuth 端点代理 */
    proxy?: string;
  };
  'codex.config'?: {
    cli_path?: string;
    yoloMode?: boolean;
    sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access';
  };
  'acp.config': {
    [backend in AcpBackend]?: {
      auth_methodId?: string;
      authToken?: string;
      lastAuthTime?: number;
      cli_path?: string;
      yoloMode?: boolean;
      /** Preferred session mode for new conversations / 新会话的默认模式 */
      preferredMode?: string;
      /** Preferred model ID for new conversations / 新会话的默认模型 */
      preferredModelId?: string;
      /** LLM prompt timeout in seconds (default: 300) / LLM 请求超时时间（秒，默认 300） */
      promptTimeout?: number;
    };
  };
  /** Global LLM prompt timeout in seconds (default: 300). Per-backend promptTimeout overrides this. */
  'acp.promptTimeout'?: number;
  /** Idle timeout in minutes before an ACP agent process is killed to reclaim memory (default: 5). */
  'acp.agentIdleTimeout'?: number;
  /** User-defined custom ACP agents (is_preset !== true, require defaultCliPath). */
  'acp.customAgents'?: AcpBackendConfig[];
  // Cached initialize results per ACP backend (persisted across sessions)
  'acp.cachedInitializeResult'?: Record<string, import('@/common/types/acpTypes').AcpInitializeResult>;
  // Cached model lists per ACP backend for Guid page pre-selection
  'acp.cachedModels'?: Record<string, import('@/common/types/acpTypes').AcpModelInfo>;
  // Cached config options per ACP backend for Guid page pre-selection
  'acp.cached_config_options'?: Record<string, import('@/common/types/acpTypes').AcpSessionConfigOption[]>;
  // Cached modes per ACP backend for Guid page / AgentModeSelector
  'acp.cachedModes'?: Record<string, import('@/common/types/acpTypes').AcpSessionModes>;
  'mcp.config': IMcpServer[];
  'mcp.agentInstallStatus': Record<string, string[]>;
  language: string;
  theme: string;
  colorScheme: string;
  /** Persisted app-wide UI zoom factor for Display settings */
  'ui.zoomFactor'?: number;
  /** 桌面模式下是否自动启用 WebUI / Auto-enable WebUI in desktop mode */
  'webui.desktop.enabled'?: boolean;
  /** 桌面模式下是否允许远程访问 / Allow remote access in desktop mode */
  'webui.desktop.allowRemote'?: boolean;
  /** 桌面模式下 WebUI 端口 / WebUI port in desktop mode */
  'webui.desktop.port'?: number;
  customCss: string; // 自定义 CSS 样式
  'css.themes': ICssTheme[]; // 自定义 CSS 主题列表 / Custom CSS themes list
  'css.activeThemeId': string; // 当前激活的主题 ID / Currently active theme ID
  'aionrs.config'?: {
    /** Preferred session mode for new conversations / 新会话的默认模式 */
    preferredMode?: string;
  };
  'aionrs.defaultModel'?: { id: string; use_model: string };
  'tools.imageGenerationModel': TProviderWithModel & {
    /** @deprecated Image generation is now controlled via built-in MCP server toggle */
    switch?: boolean;
  };
  'tools.speechToText'?: SpeechToTextConfig;
  // 是否在粘贴文件到工作区时询问确认（true = 不再询问）
  'workspace.pasteConfirm'?: boolean;
  // 上传的文件是否保存到工作区目录（true = 保存到工作区，false = 保存到缓存目录）
  'upload.saveToWorkspace'?: boolean;
  // guid 页面上次选择的 agent 类型 / Last selected agent type on guid page
  'guid.lastSelectedAgent'?: string;
  // 迁移标记：修复老版本中助手 enabled 默认值问题 / Migration flag: fix assistant enabled default value issue
  'migration.assistantEnabledFixed'?: boolean;
  // 迁移标记：为 cowork 助手添加默认启用的 skills / Migration flag: add default enabled skills for cowork assistant
  /** @deprecated Use migration.builtinDefaultSkillsAdded_v2 instead */
  'migration.coworkDefaultSkillsAdded'?: boolean;
  // 迁移标记：为所有内置助手添加默认启用的 skills / Migration flag: add default enabled skills for all builtin assistants
  'migration.builtinDefaultSkillsAdded_v2'?: boolean;
  // 迁移标记：为所有内置助手添加 promptsI18n / Migration flag: add promptsI18n for all builtin assistants
  'migration.promptsI18nAdded'?: boolean;
  /** Migration flag: split 'assistants' into presets-only + 'acp.customAgents' (user-defined customs). */
  'migration.assistantsSplitCustom'?: boolean;
  /** Migration flag: Electron desktop config has been imported to server config */
  'migration.electronConfigImported'?: boolean;
  // 关闭窗口时最小化到系统托盘 / Minimize to system tray when closing window
  'system.closeToTray'?: boolean;
  // 任务完成时显示系统通知 / Show system notification when task completes
  'system.notificationEnabled'?: boolean;
  // 定时任务完成时显示系统通知 / Show system notification when scheduled task completes
  'system.cronNotificationEnabled'?: boolean;
  // 阻止系统休眠以保证定时任务执行 / Prevent system sleep to ensure scheduled tasks run
  'system.keepAwake'?: boolean;
  // Automatically preview newly created Office files in the current workspace
  'system.autoPreviewOfficeFiles'?: boolean;
  // Telegram assistant default model / Telegram 助手默认模型
  'assistant.telegram.defaultModel'?: {
    id: string;
    use_model: string;
  };
  // Telegram assistant agent selection / Telegram 助手所使用的 Agent
  'assistant.telegram.agent'?: {
    backend: string;
    custom_agent_id?: string;
    name?: string;
  };
  // Lark assistant default model / Lark 助手默认模型
  'assistant.lark.defaultModel'?: {
    id: string;
    use_model: string;
  };
  // Lark assistant agent selection / Lark 助手所使用的 Agent
  'assistant.lark.agent'?: {
    backend: string;
    custom_agent_id?: string;
    name?: string;
  };
  // DingTalk assistant default model / DingTalk 助手默认模型
  'assistant.dingtalk.defaultModel'?: {
    id: string;
    use_model: string;
  };
  // DingTalk assistant agent selection / DingTalk 助手所使用的 Agent
  'assistant.dingtalk.agent'?: {
    backend: string;
    custom_agent_id?: string;
    name?: string;
  };
  // WeChat assistant default model / WeChat 助手默认模型
  'assistant.weixin.defaultModel'?: {
    id: string;
    use_model: string;
  };
  // WeChat assistant agent selection / WeChat 助手所使用的 Agent
  'assistant.weixin.agent'?: {
    backend: string;
    custom_agent_id?: string;
    name?: string;
  };
  // WeCom assistant default model / 企业微信助手默认模型
  'assistant.wecom.defaultModel'?: {
    id: string;
    use_model: string;
  };
  // WeCom assistant agent selection / 企业微信助手所使用的 Agent
  'assistant.wecom.agent'?: {
    backend: string;
    custom_agent_id?: string;
    name?: string;
  };
  // Skills Market: whether the aionui-skills builtin skill is enabled
  'skillsMarket.enabled'?: boolean;
  // Desktop Pet: whether the desktop pet feature is enabled
  'pet.enabled'?: boolean;
  // Desktop Pet: size in pixels (200, 280, or 360)
  'pet.size'?: number;
  // Desktop Pet: do not disturb mode (pet stays idle, ignores AI events)
  'pet.dnd'?: boolean;
  // Desktop Pet: whether tool-call confirmations are routed to the pet's bubble
  // (true) or remain in the main chat window (false). Default true.
  'pet.confirmEnabled'?: boolean;
}

export interface IEnvStorageRefer {
  'aionui.dir': {
    workDir: string;
    cacheDir: string;
  };
}

/**
 * Conversation source type - identifies where the conversation was created
 * 会话来源类型 - 标识会话创建的来源
 */
export type ConversationSource = 'aionui' | 'telegram' | 'lark' | 'dingtalk' | 'weixin' | 'wecom' | (string & {});

interface IChatConversation<T, Extra> {
  created_at: number;
  modified_at: number;
  name: string;
  desc?: string;
  id: string;
  type: T;
  extra: Extra;
  model: TProviderWithModel;
  status?: 'pending' | 'running' | 'finished' | undefined;
  /** 会话来源，默认为 aionui / Conversation source, defaults to aionui */
  source?: ConversationSource;
  /** Channel chat isolation ID (e.g. user:xxx, group:xxx) */
  channel_chat_id?: string;
}

// Token 使用统计数据类型
export interface TokenUsageData {
  total_tokens: number;
}

export type TChatConversation =
  | Omit<
      IChatConversation<
        'acp',
        {
          workspace?: string;
          backend: AcpBackend;
          cli_path?: string;
          custom_workspace?: boolean;
          agent_name?: string;
          custom_agent_id?: string; // UUID for identifying specific custom agent
          preset_context?: string; // 智能助手的预设规则/提示词 / Preset context from smart assistant
          /** 启用的 skills 列表，用于过滤 SkillManager 加载的 skills / Enabled skills list for filtering SkillManager skills */
          enabled_skills?: string[];
          /** 排除的内置自动注入 skills / Builtin auto-injected skills to exclude */
          excludeBuiltinSkills?: string[];
          /** 实际加载的 skills 快照 / Snapshot of actually loaded skills */
          loaded_skills?: Array<{ name: string; description: string }>;
          /** 预设助手 ID，用于在会话面板显示助手名称和头像 / Preset assistant ID for displaying name and avatar in conversation panel */
          preset_assistant_id?: string;
          /** 是否置顶会话 / Whether this conversation is pinned */
          pinned?: boolean;
          /** 置顶时间戳（毫秒）/ Pin timestamp in milliseconds */
          pinned_at?: number;
          /** ACP 后端的 session UUID，用于会话恢复 / ACP backend session UUID for session resume */
          acp_session_id?: string;
          /** Conversation ID that owns the ACP session / 拥有该 ACP session 的会话 ID */
          acp_session_conversation_id?: string;
          /** ACP session 最后更新时间 / Last update time of ACP session */
          acp_session_updated_at?: number;
          /** Last context usage from usage_update */
          last_token_usage?: TokenUsageData;
          /** Context window capacity from usage_update */
          last_context_limit?: number;
          /** Persisted session mode for resume support / 持久化的会话模式，用于恢复 */
          session_mode?: string;
          /** Persisted model ID for resume support / 持久化的模型 ID，用于恢复 */
          current_model_id?: string;
          /** Cached config options from ACP backend / 缓存的 ACP 配置选项 */
          cached_config_options?: import('@/common/types/acpTypes').AcpSessionConfigOption[];
          /** Pending config option selections from Guid page / Guid 页面待应用的配置选项 */
          pending_config_options?: Record<string, string>;
          /** Explicit marker for temporary health-check conversations */
          is_health_check?: boolean;
          /** Cron job ID that spawned this conversation */
          cron_job_id?: string;
        }
      >,
      'model'
    >
  | Omit<
      IChatConversation<
        'codex',
        {
          workspace?: string;
          cli_path?: string;
          custom_workspace?: boolean;
          sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access'; // Codex sandbox permission mode
          preset_context?: string; // 智能助手的预设规则/提示词 / Preset context from smart assistant
          /** 启用的 skills 列表，用于过滤 SkillManager 加载的 skills / Enabled skills list for filtering SkillManager skills */
          enabled_skills?: string[];
          /** 实际加载的 skills 快照 / Snapshot of actually loaded skills */
          loaded_skills?: Array<{ name: string; description: string }>;
          /** 预设助手 ID，用于在会话面板显示助手名称和头像 / Preset assistant ID for displaying name and avatar in conversation panel */
          preset_assistant_id?: string;
          /** 是否置顶会话 / Whether this conversation is pinned */
          pinned?: boolean;
          /** 置顶时间戳（毫秒）/ Pin timestamp in milliseconds */
          pinned_at?: number;
          /** Persisted session mode for resume support / 持久化的会话模式，用于恢复 */
          session_mode?: string;
          /** User-selected Codex model from Guid page / 用户在引导页选择的 Codex 模型 */
          codexModel?: string;
          /** Explicit marker for temporary health-check conversations */
          is_health_check?: boolean;
          /** Cron job ID that spawned this conversation */
          cron_job_id?: string;
        }
      >,
      'model'
    >
  | Omit<
      IChatConversation<
        'openclaw-gateway',
        {
          workspace?: string;
          backend?: AcpBackendAll;
          agent_name?: string;
          custom_workspace?: boolean;
          /** Gateway configuration */
          gateway?: {
            host?: string;
            port?: number;
            token?: string;
            password?: string;
            useExternalGateway?: boolean;
            cli_path?: string;
          };
          /** Session key for resume */
          sessionKey?: string;
          /** Runtime validation snapshot used for post-switch strong checks */
          runtimeValidation?: {
            expectedWorkspace?: string;
            expectedBackend?: string;
            expectedAgentName?: string;
            expectedCliPath?: string;
            expectedModel?: string;
            expectedIdentityHash?: string | null;
            switchedAt?: number;
          };
          /** 启用的 skills 列表 / Enabled skills list */
          enabled_skills?: string[];
          /** 实际加载的 skills 快照 / Snapshot of actually loaded skills */
          loaded_skills?: Array<{ name: string; description: string }>;
          /** 预设助手 ID / Preset assistant ID */
          preset_assistant_id?: string;
          /** 是否置顶会话 / Whether this conversation is pinned */
          pinned?: boolean;
          /** 置顶时间戳（毫秒）/ Pin timestamp in milliseconds */
          pinned_at?: number;
          /** Explicit marker for temporary health-check conversations */
          is_health_check?: boolean;
          /** Cron job ID that spawned this conversation */
          cron_job_id?: string;
        }
      >,
      'model'
    >
  // Legacy Gemini conversations. Kept solely so that the renderer can
  // open historical rows with type='gemini' (message history is served
  // by the shared messages table). The backend factory rejects any
  // attempt to resume this conversation — see
  // aionui-backend/crates/aionui-common/src/enums.rs and factory.rs.
  // Every field is optional because legacy rows shape-varies across
  // several older Gemini-runtime versions.
  | Omit<
      IChatConversation<
        'gemini',
        {
          workspace?: string;
          custom_workspace?: boolean;
          agent_name?: string;
          preset_assistant_id?: string;
          pinned?: boolean;
          pinned_at?: number;
          is_health_check?: boolean;
          cron_job_id?: string;
          // Other legacy-only keys (session_mode, preset_rules, etc.)
          // deliberately omitted — they're not read by the renderer.
        }
      >,
      'model'
    >
  | Omit<
      IChatConversation<
        'nanobot',
        {
          workspace?: string;
          custom_workspace?: boolean;
          /** 启用的 skills 列表 / Enabled skills list */
          enabled_skills?: string[];
          /** 实际加载的 skills 快照 / Snapshot of actually loaded skills */
          loaded_skills?: Array<{ name: string; description: string }>;
          /** 预设助手 ID / Preset assistant ID */
          preset_assistant_id?: string;
          /** 是否置顶会话 / Whether this conversation is pinned */
          pinned?: boolean;
          /** 置顶时间戳（毫秒）/ Pin timestamp in milliseconds */
          pinned_at?: number;
          /** Explicit marker for temporary health-check conversations */
          is_health_check?: boolean;
          /** Cron job ID that spawned this conversation */
          cron_job_id?: string;
        }
      >,
      'model'
    >
  | Omit<
      IChatConversation<
        'remote',
        {
          workspace?: string;
          custom_workspace?: boolean;
          /** Remote agent config ID (FK to remote_agents table) */
          remoteAgentId: string;
          /** Remote session key for resume */
          sessionKey?: string;
          /** Enabled skills list */
          enabled_skills?: string[];
          /** Snapshot of actually loaded skills */
          loaded_skills?: Array<{ name: string; description: string }>;
          /** Preset assistant ID */
          preset_assistant_id?: string;
          /** Whether this conversation is pinned */
          pinned?: boolean;
          /** Pin timestamp in milliseconds */
          pinned_at?: number;
          /** Explicit marker for temporary health-check conversations */
          is_health_check?: boolean;
          /** Cron job ID that spawned this conversation */
          cron_job_id?: string;
        }
      >,
      'model'
    >
  | IChatConversation<
      'aionrs',
      {
        workspace: string;
        custom_workspace?: boolean;
        proxy?: string;
        /** System rules injected at initialization */
        preset_rules?: string;
        /** Enabled skills list */
        enabled_skills?: string[];
        /** Snapshot of actually loaded skills */
        loaded_skills?: Array<{ name: string; description: string }>;
        /** Preset assistant ID */
        preset_assistant_id?: string;
        /** Whether this conversation is pinned */
        pinned?: boolean;
        /** Pin timestamp in milliseconds */
        pinned_at?: number;
        /** Max tokens per response */
        maxTokens?: number;
        /** Max agentic turns */
        maxTurns?: number;
        /** Persisted session mode for resume support */
        session_mode?: string;
        /** Explicit marker for temporary health-check conversations */
        is_health_check?: boolean;
        /** Last token usage stats */
        last_token_usage?: TokenUsageData;
        /** Cron job ID that spawned this conversation */
        cron_job_id?: string;
      }
    >;

export type IChatConversationRefer = {
  'chat.history': TChatConversation[];
};

export type ModelType =
  | 'text' // 文本对话
  | 'vision' // 视觉理解
  | 'function_calling' // 工具调用
  | 'image_generation' // 图像生成
  | 'web_search' // 网络搜索
  | 'reasoning' // 推理模型
  | 'embedding' // 嵌入模型
  | 'rerank' // 重排序模型
  | 'excludeFromPrimary'; // 排除：不适合作为主力模型

export type ModelCapability = {
  type: ModelType;
  /**
   * 是否为用户手动选择，如果为true，则表示用户手动选择了该类型，否则表示用户手动禁止了该模型；如果为undefined，则表示使用默认值
   */
  isUserSelected?: boolean;
};

export interface IProvider {
  id: string;
  platform: string;
  name: string;
  base_url: string;
  api_key: string;
  models: string[];
  /**
   * 模型能力标签列表。打了标签就是支持，没打就是不支持
   */
  capabilities?: ModelCapability[];
  /**
   * 上下文token限制，可选字段，只在明确知道时填写
   */
  context_limit?: number;
  /**
   * 每个模型的协议覆盖配置。映射模型名称到协议字符串。
   * 仅在 platform 为 'new-api' 时使用。
   * Per-model protocol overrides. Maps model name to protocol string.
   * Only used when platform is 'new-api'.
   * e.g. { "gemini-2.5-pro": "gemini", "claude-sonnet-4": "anthropic", "gpt-4o": "openai" }
   */
  model_protocols?: Record<string, string>;
  /**
   * AWS Bedrock specific configuration
   * Only used when platform is 'bedrock'
   */
  bedrock_config?: {
    auth_method: 'accessKey' | 'profile';
    region: string;
    // For access key method
    access_key_id?: string;
    secret_access_key?: string;
    // For profile method
    profile?: string;
  };
  /**
   * 供应商启用状态，默认为 true
   * Provider enabled state, defaults to true
   */
  enabled?: boolean;
  /**
   * 各个模型的启用状态，默认全部为 true
   * Individual model enabled states, defaults to all true
   */
  model_enabled?: Record<string, boolean>;
  /**
   * 各个模型的健康检测结果（仅用于 UI 显示，不影响启用状态）
   * Model health check results (for UI display only, does not affect enabled state)
   */
  model_health?: Record<
    string,
    {
      status: 'unknown' | 'healthy' | 'unhealthy';
      last_check?: number; // 时间戳 / timestamp
      latency?: number; // 延迟时间（毫秒）/ latency in milliseconds
      error?: string; // 错误信息 / error message
    }
  >;
}

export type TProviderWithModel = Omit<IProvider, 'models'> & {
  use_model: string;
};

// MCP Server Configuration Types
export type McpTransportType = 'stdio' | 'sse' | 'http';

export interface IMcpServerTransportStdio {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface IMcpServerTransportSSE {
  type: 'sse';
  url: string;
  headers?: Record<string, string>;
}

export interface IMcpServerTransportHTTP {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
}

export interface IMcpServerTransportStreamableHTTP {
  type: 'streamable_http';
  url: string;
  headers?: Record<string, string>;
}

export type IMcpServerTransport =
  | IMcpServerTransportStdio
  | IMcpServerTransportSSE
  | IMcpServerTransportHTTP
  | IMcpServerTransportStreamableHTTP;

export interface IMcpServer {
  id: string;
  name: string;
  description?: string;
  enabled: boolean; // 是否已安装到 CLI agents（控制 Switch 状态）
  transport: IMcpServerTransport;
  tools?: IMcpTool[];
  status?: 'connected' | 'disconnected' | 'error' | 'testing'; // 连接状态（同时表示服务可用性）
  last_connected?: number;
  created_at: number;
  updated_at: number;
  original_json: string; // 存储原始JSON配置，用于编辑时的准确显示
  /** Built-in MCP server managed by AionUi (hide edit/delete in UI) */
  builtin?: boolean;
}

/** Stable ID for the built-in image generation MCP server */
export const BUILTIN_IMAGE_GEN_ID = 'builtin-image-gen';

export interface IMcpTool {
  name: string;
  description?: string;
  input_schema?: unknown;
  _meta?: Record<string, unknown>;
}

/**
 * CSS 主题配置接口 / CSS Theme configuration interface
 * 用于存储用户自定义的 CSS 皮肤 / Used to store user-defined CSS skins
 */
export interface ICssTheme {
  id: string; // 唯一标识 / Unique identifier
  name: string; // 主题名称 / Theme name
  cover?: string; // 封面图片 base64 或 URL / Cover image base64 or URL
  css: string; // CSS 样式代码 / CSS style code
  is_preset?: boolean; // 是否为预设主题 / Whether it's a preset theme
  created_at: number; // 创建时间 / Creation time
  updated_at: number; // 更新时间 / Update time
}
