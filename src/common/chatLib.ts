/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IResponseMessage } from './ipcBridge';
import { uuid } from './utils';
import type { AcpBackend, AcpPermissionRequest, ToolCallUpdate } from '@/types/acpTypes';
import type { CodexPermissionRequest } from '@/common/codex/types';
import type { ExecCommandBeginData, ExecCommandOutputDeltaData, ExecCommandEndData, PatchApplyBeginData, PatchApplyEndData, McpToolCallBeginData, McpToolCallEndData, WebSearchBeginData, WebSearchEndData, TurnDiffData } from '@/common/codex/types/eventData';

/**
 * 安全的路径拼接函数，兼容Windows和Mac
 * @param basePath 基础路径
 * @param relativePath 相对路径
 * @returns 拼接后的绝对路径
 */
export const joinPath = (basePath: string, relativePath: string): string => {
  // 标准化路径分隔符为 /
  const normalizePath = (path: string) => path.replace(/\\/g, '/');

  const base = normalizePath(basePath);
  const relative = normalizePath(relativePath);

  // 去掉base路径末尾的斜杠
  const cleanBase = base.replace(/\/+$/, '');

  // 处理相对路径中的 ./ 和 ../
  const parts = relative.split('/');
  const resultParts = [];

  for (const part of parts) {
    if (part === '.' || part === '') {
      continue; // 跳过 . 和空字符串
    } else if (part === '..') {
      // 处理上级目录
      if (resultParts.length > 0) {
        resultParts.pop(); // 移除最后一个部分
      }
    } else {
      resultParts.push(part);
    }
  }

  // 拼接路径
  const result = cleanBase + '/' + resultParts.join('/');

  // 确保路径格式正确
  return result.replace(/\/+/g, '/'); // 将多个连续的斜杠替换为单个
};

/**
 * @description 跟对话相关的消息类型申明 及相关处理
 */

type TMessageType = 'text' | 'tips' | 'tool_call' | 'tool_group' | 'agent_status' | 'acp_permission' | 'acp_tool_call' | 'codex_permission' | 'codex_tool_call';

interface IMessage<T extends TMessageType, Content extends Record<string, any>> {
  /**
   * 唯一ID
   */
  id: string;
  /**
   * 消息来源ID，
   */
  msg_id?: string;

  //消息会话ID
  conversation_id: string;
  /**
   * 消息类型
   */
  type: T;
  /**
   * 消息内容
   */
  content: Content;
  /**
   * 消息创建时间
   */
  createdAt?: number;
  /**
   * 消息位置
   */
  position?: 'left' | 'right' | 'center' | 'pop';
  /**
   * 消息状态
   */
  status?: 'finish' | 'pending' | 'error' | 'work';
}

export type IMessageText = IMessage<'text', { content: string }>;

export type IMessageTips = IMessage<'tips', { content: string; type: 'error' | 'success' | 'warning' }>;

export type IMessageToolCall = IMessage<
  'tool_call',
  {
    callId: string;
    name: string;
    args: Record<string, any>;
    error?: string;
    status?: 'success' | 'error';
  }
>;

type IMessageToolGroupConfirmationDetailsBase<Type, Extra extends Record<string, any>> = {
  type: Type;
  title: string;
} & Extra;

export type IMessageToolGroup = IMessage<
  'tool_group',
  Array<{
    callId: string;
    description: string;
    name: string;
    renderOutputAsMarkdown: boolean;
    resultDisplay?:
      | string
      | {
          fileDiff: string;
          fileName: string;
        }
      | {
          img_url: string;
          relative_path: string;
        };
    status: 'Executing' | 'Success' | 'Error' | 'Canceled' | 'Pending' | 'Confirming';
    confirmationDetails?:
      | IMessageToolGroupConfirmationDetailsBase<
          'edit',
          {
            fileName: string;
            fileDiff: string;
            isModifying?: boolean;
          }
        >
      | IMessageToolGroupConfirmationDetailsBase<
          'exec',
          {
            rootCommand: string;
            command: string;
          }
        >
      | IMessageToolGroupConfirmationDetailsBase<
          'info',
          {
            urls: string[];
            prompt: string;
          }
        >
      | IMessageToolGroupConfirmationDetailsBase<
          'mcp',
          {
            toolName: string;
            toolDisplayName: string;
            serverName: string;
          }
        >;
  }>
>;

// Unified agent status message type for all ACP-based agents (Claude, Qwen, Codex, etc.)
export type IMessageAgentStatus = IMessage<
  'agent_status',
  {
    backend: AcpBackend; // Agent identifier: 'claude', 'qwen', 'codex', etc.
    status: 'connecting' | 'connected' | 'authenticated' | 'session_active' | 'disconnected' | 'error';
    // Optional legacy fields for backward compatibility
    sessionId?: string;
    isConnected?: boolean;
    hasActiveSession?: boolean;
  }
>;

export type IMessageAcpPermission = IMessage<'acp_permission', AcpPermissionRequest>;

export type IMessageAcpToolCall = IMessage<'acp_tool_call', ToolCallUpdate>;

export type IMessageCodexPermission = IMessage<'codex_permission', CodexPermissionRequest>;

// Base interface for all tool call updates
interface BaseCodexToolCallUpdate {
  toolCallId: string;
  status: 'pending' | 'executing' | 'success' | 'error' | 'canceled';
  title?: string; // Optional - can be derived from data or kind
  kind: 'execute' | 'patch' | 'mcp' | 'web_search';

  // UI display data
  description?: string;
  content?: Array<{
    type: 'text' | 'diff' | 'output';
    text?: string;
    output?: string;
    filePath?: string;
    oldText?: string;
    newText?: string;
  }>;

  // Timing
  startTime?: number;
  endTime?: number;
}

// Specific subtypes using the original event data structures
export type CodexToolCallUpdate =
  | (BaseCodexToolCallUpdate & {
      subtype: 'exec_command_begin';
      data: ExecCommandBeginData;
    })
  | (BaseCodexToolCallUpdate & {
      subtype: 'exec_command_output_delta';
      data: ExecCommandOutputDeltaData;
    })
  | (BaseCodexToolCallUpdate & {
      subtype: 'exec_command_end';
      data: ExecCommandEndData;
    })
  | (BaseCodexToolCallUpdate & {
      subtype: 'patch_apply_begin';
      data: PatchApplyBeginData;
    })
  | (BaseCodexToolCallUpdate & {
      subtype: 'patch_apply_end';
      data: PatchApplyEndData;
    })
  | (BaseCodexToolCallUpdate & {
      subtype: 'mcp_tool_call_begin';
      data: McpToolCallBeginData;
    })
  | (BaseCodexToolCallUpdate & {
      subtype: 'mcp_tool_call_end';
      data: McpToolCallEndData;
    })
  | (BaseCodexToolCallUpdate & {
      subtype: 'web_search_begin';
      data: WebSearchBeginData;
    })
  | (BaseCodexToolCallUpdate & {
      subtype: 'web_search_end';
      data: WebSearchEndData;
    })
  | (BaseCodexToolCallUpdate & {
      subtype: 'turn_diff';
      data: TurnDiffData;
    })
  | (BaseCodexToolCallUpdate & {
      subtype: 'generic';
      data?: any; // For generic updates that don't map to specific events
    });

export type IMessageCodexToolCall = IMessage<'codex_tool_call', CodexToolCallUpdate>;

// eslint-disable-next-line max-len
export type TMessage = IMessageText | IMessageTips | IMessageToolCall | IMessageToolGroup | IMessageAgentStatus | IMessageAcpPermission | IMessageAcpToolCall | IMessageCodexPermission | IMessageCodexToolCall;

/**
 * @description 将后端返回的消息转换为前端消息
 * */
export const transformMessage = (message: IResponseMessage): TMessage => {
  switch (message.type) {
    case 'error': {
      return {
        id: uuid(),
        type: 'tips',
        msg_id: message.msg_id,
        position: 'center',
        conversation_id: message.conversation_id,
        content: {
          content: message.data as string,
          type: 'error',
        },
      };
    }
    case 'content':
    case 'user_content': {
      return {
        id: uuid(),
        type: 'text',
        msg_id: message.msg_id,
        position: message.type === 'content' ? 'left' : 'right',
        conversation_id: message.conversation_id,
        content: {
          content: message.data as string,
        },
      };
    }
    case 'tool_call': {
      return {
        id: uuid(),
        type: 'tool_call',
        msg_id: message.msg_id,
        conversation_id: message.conversation_id,
        position: 'left',
        content: message.data as any,
      };
    }
    case 'tool_group': {
      return {
        type: 'tool_group',
        id: uuid(),
        msg_id: message.msg_id,
        conversation_id: message.conversation_id,
        content: message.data as any,
      };
    }
    case 'agent_status': {
      return {
        id: uuid(),
        type: 'agent_status',
        msg_id: message.msg_id,
        position: 'center',
        conversation_id: message.conversation_id,
        content: message.data as any,
      };
    }
    case 'acp_permission': {
      return {
        id: uuid(),
        type: 'acp_permission',
        msg_id: message.msg_id,
        position: 'left',
        conversation_id: message.conversation_id,
        content: message.data as any,
      };
    }
    case 'acp_tool_call': {
      return {
        id: uuid(),
        type: 'acp_tool_call',
        msg_id: message.msg_id,
        position: 'left',
        conversation_id: message.conversation_id,
        content: message.data as any,
      };
    }
    case 'codex_permission': {
      return {
        id: uuid(),
        type: 'codex_permission',
        msg_id: message.msg_id,
        position: 'left',
        conversation_id: message.conversation_id,
        content: message.data as any,
      };
    }
    case 'codex_tool_call': {
      return {
        id: uuid(),
        type: 'codex_tool_call',
        msg_id: message.msg_id,
        position: 'left',
        conversation_id: message.conversation_id,
        content: message.data as any,
      };
    }
    case 'start':
    case 'finish':
    case 'thought':
      break;
    default: {
      throw new Error(`Unsupported message type '${message.type}'. All non-standard message types should be pre-processed by respective AgentManagers.`);
    }
  }
};

/**
 * @description 将消息合并到消息列表中
 * */
export const composeMessage = (message: TMessage | undefined, list: TMessage[] | undefined): TMessage[] => {
  if (!message) return list || [];
  if (!list?.length) return [message];
  const last = list[list.length - 1];

  if (message.type === 'tool_group') {
    const tools = message.content.slice();
    for (let i = 0, len = list.length; i < len; i++) {
      const existingMessage = list[i];
      if (existingMessage.type === 'tool_group') {
        if (!existingMessage.content.length) continue;
        // Create a new content array with merged tool data
        const newContent = existingMessage.content.map((tool) => {
          const newToolIndex = tools.findIndex((t) => t.callId === tool.callId);
          if (newToolIndex === -1) return tool;
          // Create new object instead of mutating original
          const merged = { ...tool, ...tools[newToolIndex] };
          tools.splice(newToolIndex, 1);
          return merged;
        });
        // Create a new message object instead of mutating the existing one
        // This ensures database update detection works correctly
        list[i] = { ...existingMessage, content: newContent };
      }
    }
    if (tools.length) {
      message.content = tools;
      list.push(message);
    }
    return list;
  }

  // Handle Gemini tool_call message merging
  if (message.type === 'tool_call') {
    for (let i = 0, len = list.length; i < len; i++) {
      const msg = list[i];
      if (msg.type === 'tool_call' && msg.content.callId === message.content.callId) {
        // Create new object instead of mutating original
        const merged = { ...msg.content, ...message.content };
        list[i] = { ...msg, content: merged };
        return list;
      }
    }
    // If no existing tool call found, add new one
    list.push(message);
    return list;
  }

  // Handle codex_tool_call message merging
  if (message.type === 'codex_tool_call') {
    for (let i = 0, len = list.length; i < len; i++) {
      const msg = list[i];
      if (msg.type === 'codex_tool_call' && msg.content.toolCallId === message.content.toolCallId) {
        // Create new object instead of mutating original
        const merged = { ...msg.content, ...message.content };
        list[i] = { ...msg, content: merged };
        return list;
      }
    }
    // If no existing tool call found, add new one
    list.push(message);
    return list;
  }

  // Handle acp_tool_call message merging (same logic as codex_tool_call)
  if (message.type === 'acp_tool_call') {
    for (let i = 0, len = list.length; i < len; i++) {
      const msg = list[i];
      if (msg.type === 'acp_tool_call' && msg.content.update?.toolCallId === message.content.update?.toolCallId) {
        // Create new object instead of mutating original
        const merged = { ...msg.content, ...message.content };
        list[i] = { ...msg, content: merged };
        return list;
      }
    }
    // If no existing tool call found, add new one
    list.push(message);
    return list;
  }

  if (last.msg_id !== message.msg_id || last.type !== message.type) return list.concat(message);
  if (message.type === 'text' && last.type === 'text') {
    message.content.content = last.content.content + message.content.content;
  }
  Object.assign(last, message);
  return list;
};

export const handleImageGenerationWithWorkspace = (message: TMessage, workspace: string): TMessage => {
  // 只处理text类型的消息
  if (message.type !== 'text') {
    return message;
  }

  // 深拷贝消息以避免修改原始对象
  const processedMessage = {
    ...message,
    content: {
      ...message.content,
      content: message.content.content.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, imagePath) => {
        // 如果是绝对路径、http链接或data URL，保持不变
        if (imagePath.startsWith('http') || imagePath.startsWith('data:') || imagePath.startsWith('/') || imagePath.startsWith('file:') || imagePath.startsWith('\\') || /^[A-Za-z]:/.test(imagePath)) {
          return match;
        }
        // 如果是相对路径，与workspace拼接
        const absolutePath = joinPath(workspace, imagePath);
        return `![${alt}](${encodeURI(absolutePath)})`;
      }),
    },
  };

  return processedMessage;
};
