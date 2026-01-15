/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpBackend, AcpBackendConfig } from '@/types/acpTypes';
import { storage } from '@office-ai/platform';

/**
 * @description 聊天相关的存储
 */
export const ChatStorage = storage.buildStorage<IChatConversationRefer>('agent.chat');

// 聊天消息存储
export const ChatMessageStorage = storage.buildStorage('agent.chat.message');

// 系统配置存储
export const ConfigStorage = storage.buildStorage<IConfigStorageRefer>('agent.config');

// 系统环境变量存储
export const EnvStorage = storage.buildStorage<IEnvStorageRefer>('agent.env');

export interface IConfigStorageRefer {
  'gemini.config': {
    authType: string;
    proxy: string;
    GOOGLE_GEMINI_BASE_URL?: string;
    /** @deprecated Use accountProjects instead. Kept for backward compatibility migration. */
    GOOGLE_CLOUD_PROJECT?: string;
    /** 按 Google 账号存储的 GCP 项目 ID / GCP project IDs stored per Google account */
    accountProjects?: Record<string, string>;
    yoloMode?: boolean;
  };
  'acp.config': {
    [backend in AcpBackend]?: {
      authMethodId?: string;
      authToken?: string;
      lastAuthTime?: number;
      cliPath?: string;
    };
  };
  'acp.customAgents'?: AcpBackendConfig[];
  'model.config': IProvider[];
  'mcp.config': IMcpServer[];
  'mcp.agentInstallStatus': Record<string, string[]>;
  language: string;
  theme: string;
  colorScheme: string;
  customCss: string; // 自定义 CSS 样式
  'css.themes': ICssTheme[]; // 自定义 CSS 主题列表 / Custom CSS themes list
  'css.activeThemeId': string; // 当前激活的主题 ID / Currently active theme ID
  'gemini.defaultModel': string;
  'tools.imageGenerationModel': TProviderWithModel & {
    switch: boolean;
  };
  // 是否在粘贴文件到工作区时询问确认（true = 不再询问）
  'workspace.pasteConfirm'?: boolean;
  // guid 页面上次选择的 agent 类型 / Last selected agent type on guid page
  'guid.lastSelectedAgent'?: string;
  // 迁移标记：修复老版本中助手 enabled 默认值问题 / Migration flag: fix assistant enabled default value issue
  'migration.assistantEnabledFixed'?: boolean;
}

export interface IEnvStorageRefer {
  'aionui.dir': {
    workDir: string;
    cacheDir: string;
  };
}

interface IChatConversation<T, Extra> {
  createTime: number;
  modifyTime: number;
  name: string;
  desc?: string;
  id: string;
  type: T;
  extra: Extra;
  model: TProviderWithModel;
  status?: 'pending' | 'running' | 'finished' | undefined;
}

// Token 使用统计数据类型
export interface TokenUsageData {
  totalTokens: number;
}

export type TChatConversation =
  | IChatConversation<
      'gemini',
      {
        workspace: string;
        customWorkspace?: boolean; // true 用户指定工作目录 false 系统默认工作目录
        webSearchEngine?: 'google' | 'default'; // 搜索引擎配置
        lastTokenUsage?: TokenUsageData; // 上次的 token 使用统计
        contextFileName?: string;
        contextContent?: string;
        // 系统规则支持 / System rules support
        presetRules?: string; // 系统规则，在初始化时注入 / System rules, injected at initialization
        /** 启用的 skills 列表，用于过滤 SkillManager 加载的 skills / Enabled skills list for filtering SkillManager skills */
        enabledSkills?: string[];
        /** 预设助手 ID，用于在会话面板显示助手名称和头像 / Preset assistant ID for displaying name and avatar in conversation panel */
        presetAssistantId?: string;
      }
    >
  | Omit<
      IChatConversation<
        'acp',
        {
          workspace?: string;
          backend: AcpBackend;
          cliPath?: string;
          customWorkspace?: boolean;
          agentName?: string;
          customAgentId?: string; // UUID for identifying specific custom agent
          presetContext?: string; // 智能助手的预设规则/提示词 / Preset context from smart assistant
          /** 启用的 skills 列表，用于过滤 SkillManager 加载的 skills / Enabled skills list for filtering SkillManager skills */
          enabledSkills?: string[];
          /** 预设助手 ID，用于在会话面板显示助手名称和头像 / Preset assistant ID for displaying name and avatar in conversation panel */
          presetAssistantId?: string;
        }
      >,
      'model'
    >
  | Omit<
      IChatConversation<
        'codex',
        {
          workspace?: string;
          cliPath?: string;
          customWorkspace?: boolean;
          sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access'; // Codex sandbox permission mode
          presetContext?: string; // 智能助手的预设规则/提示词 / Preset context from smart assistant
          /** 启用的 skills 列表，用于过滤 SkillManager 加载的 skills / Enabled skills list for filtering SkillManager skills */
          enabledSkills?: string[];
          /** 预设助手 ID，用于在会话面板显示助手名称和头像 / Preset assistant ID for displaying name and avatar in conversation panel */
          presetAssistantId?: string;
        }
      >,
      'model'
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
  baseUrl: string;
  apiKey: string;
  model: string[];
  /**
   * 模型能力标签列表。打了标签就是支持，没打就是不支持
   */
  capabilities?: ModelCapability[];
  /**
   * 上下文token限制，可选字段，只在明确知道时填写
   */
  contextLimit?: number;
}

export type TProviderWithModel = Omit<IProvider, 'model'> & { useModel: string };

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

export type IMcpServerTransport = IMcpServerTransportStdio | IMcpServerTransportSSE | IMcpServerTransportHTTP | IMcpServerTransportStreamableHTTP;

export interface IMcpServer {
  id: string;
  name: string;
  description?: string;
  enabled: boolean; // 是否已安装到 CLI agents（控制 Switch 状态）
  transport: IMcpServerTransport;
  tools?: IMcpTool[];
  status?: 'connected' | 'disconnected' | 'error' | 'testing'; // 连接状态（同时表示服务可用性）
  lastConnected?: number;
  createdAt: number;
  updatedAt: number;
  originalJson: string; // 存储原始JSON配置，用于编辑时的准确显示
}

export interface IMcpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
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
  isPreset?: boolean; // 是否为预设主题 / Whether it's a preset theme
  createdAt: number; // 创建时间 / Creation time
  updatedAt: number; // 更新时间 / Update time
}
