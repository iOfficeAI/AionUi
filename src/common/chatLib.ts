/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpBackend } from './acpTypes';
import type { IResponseMessage } from './ipcBridge';
import { uuid } from './utils';
import type { AcpPermissionRequest, ToolCallUpdate } from '@/common/acpTypes';

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

// Normalize LLM text with awkward line breaks/zero‑width chars while preserving code blocks.
function normalizeLLMText(raw: string): string {
  if (!raw || typeof raw !== 'string') return raw as any;
  const ZW = /[\u200B-\u200D\uFEFF]/g;
  const chunks = raw
    .replace(/[\r\t]+/g, (m) => (m.includes('\t') ? ' ' : ''))
    .replace(ZW, '')
    .split('```');
  const out: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    let seg = chunks[i];
    if (i % 2 === 1) {
      out.push('```' + seg + '```');
      continue;
    }
    // Join words split by stray newlines: "Div\nis\nibility" -> "Divisibility"
    seg = seg.replace(/([A-Za-z])\s*\n\s*([a-z])/g, '$1$2');
    // Join hyphen alone lines: "Power\n-\nof" -> "Power-of"
    seg = seg.replace(/([A-Za-z])\s*\n\s*-\s*\n\s*([A-Za-z])/g, '$1-$2');
    // Replace single newlines between non-terminal contexts with space
    // Note: character class excludes terminal punctuation [.!?:;]
    seg = seg.replace(/([^.!?:;])\n(?!\n|\s*[-*#\d])/g, '$1 ');
    // Collapse excessive blank lines
    seg = seg.replace(/\n{3,}/g, '\n\n');
    // Normalize multiple spaces
    seg = seg.replace(/ {2,}/g, ' ');
    out.push(seg);
  }
  return out.join('');
}

/**
 * @description 跟对话相关的消息类型申明 及相关处理
 */

type TMessageType = 'text' | 'tips' | 'tool_call' | 'tool_group' | 'acp_status' | 'acp_permission' | 'acp_tool_call' | 'codex_status' | 'codex_permission';

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
    name: 'GoogleSearch' | 'Shell' | 'WriteFile' | 'ReadFile' | 'ImageGeneration';
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

export type IMessageAcpStatus = IMessage<
  'acp_status',
  {
    backend: AcpBackend;
    status: 'connecting' | 'connected' | 'authenticated' | 'session_active' | 'disconnected' | 'error';
    message: string;
  }
>;

export type IMessageAcpPermission = IMessage<'acp_permission', AcpPermissionRequest>;

export type IMessageAcpToolCall = IMessage<'acp_tool_call', ToolCallUpdate>;

export type IMessageCodexStatus = IMessage<
  'codex_status',
  {
    status: string;
    message: string;
    sessionId?: string;
    isConnected?: boolean;
    hasActiveSession?: boolean;
  }
>;

export type IMessageCodexPermission = IMessage<'codex_permission', Record<string, any>>;

export type TMessage = IMessageText | IMessageTips | IMessageToolCall | IMessageToolGroup | IMessageAcpStatus | IMessageAcpPermission | IMessageAcpToolCall | IMessageCodexStatus | IMessageCodexPermission;

/**
 * @description 将后端返回的消息转换为前端消息
 * */
export const transformMessage = (message: IResponseMessage): TMessage | undefined => {
  console.log('🔄 [transformMessage] Processing message:', {
    type: message.type,
    msg_id: message.msg_id,
    conversation_id: message.conversation_id,
    dataType: typeof message.data,
    dataContent: message.data,
    fullMessage: message,
  });

  try {
    switch (message.type) {
      case 'error': {
        console.log('🔴 [transformMessage] Processing error message');
        return {
          id: uuid(),
          type: 'tips',
          msg_id: message.msg_id,
          position: 'center',
          conversation_id: message.conversation_id,
          content: {
            content: message.data,
            type: 'error',
          },
        };
      }
      case 'content': {
        console.log('💬 [transformMessage] Processing content message');
        return {
          id: uuid(),
          type: 'text',
          msg_id: message.msg_id,
          position: 'left',
          conversation_id: message.conversation_id,
          content: {
            content: normalizeLLMText(message.data),
          },
        };
      }
      case 'user_content': {
        return {
          id: uuid(),
          type: 'text',
          msg_id: message.msg_id,
          position: 'right',
          conversation_id: message.conversation_id,
          content: {
            content: message.data,
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
          content: message.data,
        };
      }
      case 'tool_group': {
        return {
          type: 'tool_group',
          id: uuid(),
          msg_id: message.msg_id,
          conversation_id: message.conversation_id,
          content: message.data,
        };
      }
      case 'acp_status': {
        return {
          id: uuid(),
          type: 'acp_status',
          msg_id: message.msg_id,
          position: 'center',
          conversation_id: message.conversation_id,
          content: message.data,
        };
      }
      case 'acp_permission': {
        console.log('🔐 [transformMessage] Processing ACP permission message');
        return {
          id: uuid(),
          type: 'acp_permission',
          msg_id: message.msg_id,
          position: 'left',
          conversation_id: message.conversation_id,
          content: message.data,
        };
      }
      case 'acp_tool_call': {
        return {
          id: uuid(),
          type: 'acp_tool_call',
          msg_id: message.msg_id,
          position: 'left',
          conversation_id: message.conversation_id,
          content: message.data,
        };
      }
      case 'start':
      case 'finish':
      case 'thought':
        return undefined;
      default:
        console.log('⚠️ [transformMessage] Unknown message type, using default transformation:', message.type);
        return {
          type: message.type,
          content: message.data,
          position: 'left',
          id: uuid(),
        } as any;
    }
  } catch (error) {
    console.error('❌ [transformMessage] Error processing message:', error);
    console.error('❌ [transformMessage] Problematic message:', message);

    // Return a safe error message instead of crashing
    return {
      id: uuid(),
      type: 'tips',
      msg_id: message.msg_id || uuid(),
      position: 'center',
      conversation_id: message.conversation_id || '',
      content: {
        content: `Message processing error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error',
      },
    };
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
      const message = list[i];
      if (message.type === 'tool_group') {
        if (!message.content.length) continue;
        message.content.forEach((tool) => {
          const newToolIndex = tools.findIndex((t) => t.callId === tool.callId);
          if (newToolIndex === -1) return;
          Object.assign(tool, tools[newToolIndex]);
          tools.splice(newToolIndex, 1);
        });
      }
    }
    if (tools.length) {
      message.content = tools;
      list.push(message);
    }
    return list;
  }

  if (last.msg_id !== message.msg_id || last.type !== message.type) return list.concat(message);
  if (message.type === 'text' && last.type === 'text') {
    // 对于Codex流式消息，直接替换内容而不是拼接
    // 如果新消息内容包含旧消息内容，说明是累积更新，直接替换
    const lastContent = String(last.content.content || '');
    const newContent = String(message.content.content || '');

    // 如果内容完全相同，跳过处理
    if (lastContent === newContent) {
      return list;
    }

    if (newContent.includes(lastContent) || lastContent === 'loading...') {
      // 新内容包含旧内容或旧内容是loading，直接替换
      message.content.content = newContent;
    } else if (lastContent.includes(newContent)) {
      // New is a subset of last; keep last
      message.content.content = lastContent;
    } else {
      // 否则进行拼接
      message.content.content = lastContent + newContent;
    }
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
