/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { CodexAgentEventType, type McpInvocation, type CodexAgentEvent } from '@/common/codexTypes';
import i18n from '@/renderer/i18n';

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

// 事件数据类型定义
export type EventDataMap = {
  [CodexAgentEventType.EXEC_COMMAND_BEGIN]: Extract<CodexAgentEvent, { type: CodexAgentEventType.EXEC_COMMAND_BEGIN }>['data'];
  [CodexAgentEventType.EXEC_COMMAND_OUTPUT_DELTA]: Extract<CodexAgentEvent, { type: CodexAgentEventType.EXEC_COMMAND_OUTPUT_DELTA }>['data'];
  [CodexAgentEventType.EXEC_COMMAND_END]: Extract<CodexAgentEvent, { type: CodexAgentEventType.EXEC_COMMAND_END }>['data'];
  [CodexAgentEventType.APPLY_PATCH_APPROVAL_REQUEST]: Extract<CodexAgentEvent, { type: CodexAgentEventType.APPLY_PATCH_APPROVAL_REQUEST }>['data'];
  [CodexAgentEventType.PATCH_APPLY_BEGIN]: Extract<CodexAgentEvent, { type: CodexAgentEventType.PATCH_APPLY_BEGIN }>['data'];
  [CodexAgentEventType.PATCH_APPLY_END]: Extract<CodexAgentEvent, { type: CodexAgentEventType.PATCH_APPLY_END }>['data'];
  [CodexAgentEventType.MCP_TOOL_CALL_BEGIN]: Extract<CodexAgentEvent, { type: CodexAgentEventType.MCP_TOOL_CALL_BEGIN }>['data'];
  [CodexAgentEventType.MCP_TOOL_CALL_END]: Extract<CodexAgentEvent, { type: CodexAgentEventType.MCP_TOOL_CALL_END }>['data'];
  [CodexAgentEventType.WEB_SEARCH_BEGIN]: Extract<CodexAgentEvent, { type: CodexAgentEventType.WEB_SEARCH_BEGIN }>['data'];
  [CodexAgentEventType.WEB_SEARCH_END]: Extract<CodexAgentEvent, { type: CodexAgentEventType.WEB_SEARCH_END }>['data'];
};

/**
 * 工具注册表 - 负责管理所有工具的注册、发现和解析
 */
export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private mcpTools = new Map<string, ToolDefinition>();
  private eventTypeMapping = new Map<CodexAgentEventType, string[]>();

  constructor() {
    this.initializeBuiltinTools();
  }

  /**
   * 初始化内置工具
   */
  private initializeBuiltinTools() {
    // Shell执行工具
    this.registerBuiltinTool({
      id: 'shell_exec',
      name: 'Shell',
      displayNameKey: 'tools.shell.displayName',
      category: ToolCategory.EXECUTION,
      priority: 10,
      availability: {
        platforms: ['darwin', 'linux', 'win32'],
      },
      capabilities: {
        supportsStreaming: true,
        supportsImages: false,
        supportsCharts: false,
        supportsMarkdown: true,
        supportsInteraction: true,
        outputFormats: [OutputFormat.TEXT, OutputFormat.MARKDOWN],
      },
      renderer: {
        type: RendererType.STANDARD,
        config: { showTimestamp: true },
      },
      icon: '🔧',
      descriptionKey: 'tools.shell.description',
    });

    // 文件操作工具
    this.registerBuiltinTool({
      id: 'file_operations',
      name: 'FileOps',
      displayNameKey: 'tools.fileOps.displayName',
      category: ToolCategory.FILE_OPS,
      priority: 20,
      availability: {
        platforms: ['darwin', 'linux', 'win32'],
      },
      capabilities: {
        supportsStreaming: false,
        supportsImages: false,
        supportsCharts: false,
        supportsMarkdown: true,
        supportsInteraction: true,
        outputFormats: [OutputFormat.TEXT, OutputFormat.MARKDOWN],
      },
      renderer: {
        type: RendererType.CODE,
        config: { language: 'diff' },
      },
      icon: '📝',
      descriptionKey: 'tools.fileOps.description',
    });

    // 网页搜索工具
    this.registerBuiltinTool({
      id: 'web_search',
      name: 'WebSearch',
      displayNameKey: 'tools.webSearch.displayName',
      category: ToolCategory.SEARCH,
      priority: 30,
      availability: {
        platforms: ['darwin', 'linux', 'win32'],
      },
      capabilities: {
        supportsStreaming: false,
        supportsImages: true,
        supportsCharts: false,
        supportsMarkdown: true,
        supportsInteraction: false,
        outputFormats: [OutputFormat.TEXT, OutputFormat.MARKDOWN],
      },
      renderer: {
        type: RendererType.MARKDOWN,
        config: { showSources: true },
      },
      icon: '🔍',
      descriptionKey: 'tools.webSearch.description',
    });

    // 设置事件类型映射
    this.eventTypeMapping.set(CodexAgentEventType.EXEC_COMMAND_BEGIN, ['shell_exec']);
    this.eventTypeMapping.set(CodexAgentEventType.EXEC_COMMAND_OUTPUT_DELTA, ['shell_exec']);
    this.eventTypeMapping.set(CodexAgentEventType.EXEC_COMMAND_END, ['shell_exec']);
    this.eventTypeMapping.set(CodexAgentEventType.APPLY_PATCH_APPROVAL_REQUEST, ['file_operations']);
    this.eventTypeMapping.set(CodexAgentEventType.PATCH_APPLY_BEGIN, ['file_operations']);
    this.eventTypeMapping.set(CodexAgentEventType.PATCH_APPLY_END, ['file_operations']);
    this.eventTypeMapping.set(CodexAgentEventType.WEB_SEARCH_BEGIN, ['web_search']);
    this.eventTypeMapping.set(CodexAgentEventType.WEB_SEARCH_END, ['web_search']);
  }

  /**
   * 注册内置工具
   */
  registerBuiltinTool(tool: ToolDefinition) {
    this.tools.set(tool.id, tool);
  }

  /**
   * 注册MCP工具
   */
  registerMcpTool(mcpTool: McpToolInfo) {
    const toolDef = this.adaptMcpTool(mcpTool);
    this.mcpTools.set(toolDef.id, toolDef);
  }

  /**
   * 将MCP工具适配为标准工具定义
   */
  private adaptMcpTool(mcpTool: McpToolInfo): ToolDefinition {
    const fullyQualifiedName = `${mcpTool.serverName}/${mcpTool.name}`;

    return {
      id: fullyQualifiedName,
      name: mcpTool.name,
      displayNameKey: `tools.mcp.${mcpTool.serverName}.${mcpTool.name}.displayName`,
      category: this.inferCategory(mcpTool),
      priority: 100, // MCP工具优先级较低
      availability: {
        platforms: ['darwin', 'linux', 'win32'],
        experimental: true,
      },
      capabilities: this.inferCapabilities(mcpTool.inputSchema),
      renderer: this.selectRenderer(mcpTool),
      icon: this.getIconForCategory(this.inferCategory(mcpTool)),
      descriptionKey: `tools.mcp.${mcpTool.serverName}.${mcpTool.name}.description`,
      schema: mcpTool.inputSchema,
    };
  }

  /**
   * 智能推断工具类别
   */
  private inferCategory(mcpTool: McpToolInfo): ToolCategory {
    const name = mcpTool.name.toLowerCase();
    const description = mcpTool.description?.toLowerCase() || '';

    if (name.includes('search') || name.includes('find') || name.includes('query') || description.includes('search')) {
      return ToolCategory.SEARCH;
    }
    if (name.includes('file') || name.includes('read') || name.includes('write') || name.includes('edit')) {
      return ToolCategory.FILE_OPS;
    }
    if (name.includes('exec') || name.includes('run') || name.includes('command') || name.includes('shell')) {
      return ToolCategory.EXECUTION;
    }
    if (name.includes('chart') || name.includes('plot') || name.includes('analyze') || name.includes('graph')) {
      return ToolCategory.ANALYSIS;
    }
    if (name.includes('http') || name.includes('api') || name.includes('request') || name.includes('fetch')) {
      return ToolCategory.COMMUNICATION;
    }

    return ToolCategory.CUSTOM;
  }

  /**
   * 推断工具能力
   */
  private inferCapabilities(inputSchema?: Record<string, unknown>): ToolCapabilities {
    // 基于Schema推断能力
    const properties = inputSchema?.properties as Record<string, unknown> | undefined;
    const hasStreamParam = properties?.stream !== undefined;
    const hasImageParam = properties?.image !== undefined || properties?.img !== undefined;

    return {
      supportsStreaming: hasStreamParam,
      supportsImages: hasImageParam,
      supportsCharts: false, // 默认不支持图表
      supportsMarkdown: true, // 默认支持markdown
      supportsInteraction: true, // 默认支持交互
      outputFormats: [OutputFormat.TEXT, OutputFormat.MARKDOWN],
    };
  }

  /**
   * 选择合适的渲染器
   */
  private selectRenderer(mcpTool: McpToolInfo): ToolRenderer {
    const category = this.inferCategory(mcpTool);

    switch (category) {
      case ToolCategory.FILE_OPS:
        return { type: RendererType.CODE, config: {} };
      case ToolCategory.ANALYSIS:
        return { type: RendererType.CHART, config: {} };
      case ToolCategory.SEARCH:
        return { type: RendererType.MARKDOWN, config: {} };
      default:
        return { type: RendererType.STANDARD, config: {} };
    }
  }

  /**
   * 根据类别获取图标
   */
  private getIconForCategory(category: ToolCategory): string {
    switch (category) {
      case ToolCategory.EXECUTION:
        return '🔧';
      case ToolCategory.FILE_OPS:
        return '📝';
      case ToolCategory.SEARCH:
        return '🔍';
      case ToolCategory.ANALYSIS:
        return '📊';
      case ToolCategory.COMMUNICATION:
        return '🌐';
      case ToolCategory.CUSTOM:
        return '🔌';
      default:
        return '❓';
    }
  }

  /**
   * 根据事件类型和数据解析对应的工具
   */
  resolveToolForEvent(eventType: CodexAgentEventType, eventData?: EventDataMap[keyof EventDataMap]): ToolDefinition | null {
    // 1. 特殊处理MCP工具调用
    if (eventType === CodexAgentEventType.MCP_TOOL_CALL_BEGIN || eventType === CodexAgentEventType.MCP_TOOL_CALL_END) {
      const mcpData = eventData as EventDataMap[CodexAgentEventType.MCP_TOOL_CALL_BEGIN];
      if (mcpData?.invocation) {
        const toolId = this.inferMcpToolId(mcpData.invocation);
        const mcpTool = this.mcpTools.get(toolId);
        if (mcpTool) return mcpTool;
      }

      // 如果找不到具体的MCP工具，返回通用MCP工具
      return this.createGenericMcpTool(mcpData?.invocation);
    }

    // 2. 基于事件类型的直接映射
    const candidateIds = this.eventTypeMapping.get(eventType) || [];

    // 3. 基于优先级选择最佳匹配
    const availableTools = candidateIds
      .map((id) => this.tools.get(id) || this.mcpTools.get(id))
      .filter(Boolean)
      .filter((tool) => this.isToolAvailable(tool!))
      .sort((a, b) => a!.priority - b!.priority);

    return availableTools[0] || this.getDefaultTool(eventType);
  }

  /**
   * 从MCP调用信息推断工具ID
   */
  private inferMcpToolId(invocation: McpInvocation): string {
    // 尝试从invocation中提取方法名
    const method = this.extractMethodFromInvocation(invocation);
    if (!method) return '';

    // 尝试匹配已注册的MCP工具
    for (const [toolId, tool] of this.mcpTools) {
      if (toolId.endsWith(`/${method}`) || tool.name === method) {
        return toolId;
      }
    }

    return '';
  }

  /**
   * 从MCP调用中提取方法名
   */
  private extractMethodFromInvocation(invocation: McpInvocation): string {
    // 根据实际的McpInvocation类型结构来提取方法名
    // 这里需要根据具体的类型定义来实现
    if ('method' in invocation && typeof invocation.method === 'string') {
      return invocation.method;
    }
    if ('name' in invocation && typeof invocation.name === 'string') {
      return invocation.name;
    }
    return '';
  }

  /**
   * 创建通用MCP工具定义
   */
  private createGenericMcpTool(invocation?: McpInvocation): ToolDefinition {
    const method = invocation ? this.extractMethodFromInvocation(invocation) || 'McpTool' : 'McpTool';

    return {
      id: `generic_mcp_${method}`,
      name: method,
      displayNameKey: 'tools.mcp.generic.displayName',
      category: ToolCategory.CUSTOM,
      priority: 200,
      availability: {
        platforms: ['darwin', 'linux', 'win32'],
        experimental: true,
      },
      capabilities: {
        supportsStreaming: false,
        supportsImages: true,
        supportsCharts: true,
        supportsMarkdown: true,
        supportsInteraction: false,
        outputFormats: [OutputFormat.TEXT, OutputFormat.MARKDOWN, OutputFormat.JSON],
      },
      renderer: {
        type: RendererType.STANDARD,
        config: {},
      },
      icon: '🔌',
      descriptionKey: 'tools.mcp.generic.description',
    };
  }

  /**
   * 检查工具是否可用
   */
  private isToolAvailable(tool: ToolDefinition): boolean {
    const currentPlatform = process.platform;
    return tool.availability.platforms.includes(currentPlatform);
  }

  /**
   * 获取默认工具
   */
  private getDefaultTool(eventType: CodexAgentEventType): ToolDefinition {
    return {
      id: 'unknown',
      name: 'Unknown',
      displayNameKey: 'tools.unknown.displayName',
      category: ToolCategory.CUSTOM,
      priority: 999,
      availability: {
        platforms: ['darwin', 'linux', 'win32'],
      },
      capabilities: {
        supportsStreaming: false,
        supportsImages: false,
        supportsCharts: false,
        supportsMarkdown: false,
        supportsInteraction: false,
        outputFormats: [OutputFormat.TEXT],
      },
      renderer: {
        type: RendererType.STANDARD,
        config: {},
      },
      icon: '❓',
      descriptionKey: 'tools.unknown.description',
    };
  }

  /**
   * 获取所有已注册的工具
   */
  getAllTools(): ToolDefinition[] {
    return [...Array.from(this.tools.values()), ...Array.from(this.mcpTools.values())];
  }

  /**
   * 根据类别获取工具
   */
  getToolsByCategory(category: ToolCategory): ToolDefinition[] {
    return this.getAllTools().filter((tool) => tool.category === category);
  }

  /**
   * 获取工具定义
   */
  getTool(id: string): ToolDefinition | undefined {
    return this.tools.get(id) || this.mcpTools.get(id);
  }

  /**
   * 获取工具的本地化显示名称
   */
  getToolDisplayName(tool: ToolDefinition, fallbackParams?: Record<string, string>): string {
    try {
      return i18n.t(tool.displayNameKey, fallbackParams || {});
    } catch {
      // 如果没有找到翻译，返回工具名称
      return tool.name;
    }
  }

  /**
   * 获取工具的本地化描述
   */
  getToolDescription(tool: ToolDefinition, fallbackParams?: Record<string, string>): string {
    try {
      return i18n.t(tool.descriptionKey, fallbackParams || {});
    } catch {
      // 如果没有找到翻译，返回基础描述
      return `Tool: ${tool.name}`;
    }
  }

  /**
   * 为MCP工具生成本地化参数
   */
  getMcpToolI18nParams(tool: ToolDefinition): Record<string, string> {
    if (tool.id.includes('/')) {
      const [serverName, toolName] = tool.id.split('/');
      return { toolName, serverName };
    }
    return { toolName: tool.name };
  }
}
