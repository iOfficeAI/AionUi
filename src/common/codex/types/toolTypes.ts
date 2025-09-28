/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CodexAgentEventType } from './eventTypes';

// 工具类别枚举
export enum ToolCategory {
  EXECUTION = 'execution', // shell, bash, python等
  FILE_OPS = 'file_ops', // 读写、编辑、搜索文件
  SEARCH = 'search', // 各种搜索方式
  ANALYSIS = 'analysis', // 代码分析、图表生成
  COMMUNICATION = 'communication', // 网络请求、API调用
  CUSTOM = 'custom', // MCP工具等自定义工具
}

// 输出格式枚举
export enum OutputFormat {
  TEXT = 'text',
  MARKDOWN = 'markdown',
  JSON = 'json',
  IMAGE = 'image',
  CHART = 'chart',
  DIAGRAM = 'diagram',
  TABLE = 'table',
}

// 渲染器类型枚举
export enum RendererType {
  STANDARD = 'standard', // 标准文本渲染
  MARKDOWN = 'markdown', // Markdown渲染
  CODE = 'code', // 代码高亮渲染
  CHART = 'chart', // 图表渲染
  IMAGE = 'image', // 图像渲染
  INTERACTIVE = 'interactive', // 交互式渲染
  COMPOSITE = 'composite', // 复合渲染
}

// 工具可用性配置
export interface ToolAvailability {
  platforms: string[]; // ['darwin', 'linux', 'win32']
  requires?: string[]; // 依赖的工具或服务
  experimental?: boolean; // 是否为实验性功能
}

// 工具能力配置
export interface ToolCapabilities {
  supportsStreaming: boolean;
  supportsImages: boolean;
  supportsCharts: boolean;
  supportsMarkdown: boolean;
  supportsInteraction: boolean; // 是否需要用户交互
  outputFormats: OutputFormat[];
}

// 渲染器配置
export interface ToolRenderer {
  type: RendererType;
  config: Record<string, any>;
}

// 工具定义接口
export interface ToolDefinition {
  id: string;
  name: string;
  displayNameKey: string; // i18n key for display name
  category: ToolCategory;
  priority: number; // 优先级，数字越小优先级越高
  availability: ToolAvailability;
  capabilities: ToolCapabilities;
  renderer: ToolRenderer;
  icon?: string; // 工具图标
  descriptionKey: string; // i18n key for description
  schema?: any; // 工具Schema
}

// MCP工具信息
export interface McpToolInfo {
  name: string;
  serverName: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

// 事件数据类型定义 (simplified using CodexEventMsg structure)
export type EventDataMap = {
  [CodexAgentEventType.EXEC_COMMAND_BEGIN]: Extract<import('./eventData').CodexEventMsg, { type: 'exec_command_begin' }>;
  [CodexAgentEventType.EXEC_COMMAND_OUTPUT_DELTA]: Extract<import('./eventData').CodexEventMsg, { type: 'exec_command_output_delta' }>;
  [CodexAgentEventType.EXEC_COMMAND_END]: Extract<import('./eventData').CodexEventMsg, { type: 'exec_command_end' }>;
  [CodexAgentEventType.APPLY_PATCH_APPROVAL_REQUEST]: Extract<import('./eventData').CodexEventMsg, { type: 'apply_patch_approval_request' }>;
  [CodexAgentEventType.PATCH_APPLY_BEGIN]: Extract<import('./eventData').CodexEventMsg, { type: 'patch_apply_begin' }>;
  [CodexAgentEventType.PATCH_APPLY_END]: Extract<import('./eventData').CodexEventMsg, { type: 'patch_apply_end' }>;
  [CodexAgentEventType.MCP_TOOL_CALL_BEGIN]: Extract<import('./eventData').CodexEventMsg, { type: 'mcp_tool_call_begin' }>;
  [CodexAgentEventType.MCP_TOOL_CALL_END]: Extract<import('./eventData').CodexEventMsg, { type: 'mcp_tool_call_end' }>;
  [CodexAgentEventType.WEB_SEARCH_BEGIN]: Extract<import('./eventData').CodexEventMsg, { type: 'web_search_begin' }>;
  [CodexAgentEventType.WEB_SEARCH_END]: Extract<import('./eventData').CodexEventMsg, { type: 'web_search_end' }>;
};
