/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

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

/**
 * @description 跟对话相关的消息类型申明 及相关处理
 */

type TMessageType = 'text' | 'tips' | 'tool_call' | 'tool_group' | 'acp_status' | 'acp_permission' | 'acp_tool_call' | 'codex_elicitation' | 'codex_patch_request';
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
    backend: string; // allow codex as well
    status: 'connecting' | 'connected' | 'authenticated' | 'session_active' | 'disconnected' | 'error';
    message: string;
  }
>;

// Extended permission request with additional UI fields
interface ExtendedAcpPermissionRequest extends Omit<AcpPermissionRequest, 'options'> {
  title?: string;
  description?: string;
  agentType?: string;
  requestId?: string;
  options: Array<{
    optionId: string;
    name: string;
    kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always';
    description?: string;
  }>;
}

export type IMessageAcpPermission = IMessage<'acp_permission', ExtendedAcpPermissionRequest>;

export type IMessageAcpToolCall = IMessage<'acp_tool_call', ToolCallUpdate>;

// Codex specific message types
export type IMessageCodexElicitation = IMessage<
  'codex_elicitation',
  {
    elicitationType: string; // e.g., 'patch-approval'
    message: string;
    requestedSchema: Record<string, any>;
    codex_call_id: string;
    codex_changes?: Record<string, any>;
  }
>;

export type IMessageCodexPatchRequest = IMessage<
  'codex_patch_request',
  {
    call_id: string;
    changes: Record<string, any>;
    description?: string;
  }
>;

export type TMessage = IMessageText | IMessageTips | IMessageToolCall | IMessageToolGroup | IMessageAcpStatus | IMessageAcpPermission | IMessageAcpToolCall | IMessageCodexElicitation | IMessageCodexPatchRequest;

/**
 * @description 将后端返回的消息转换为前端消息
 * */
export const transformMessage = (message: IResponseMessage): TMessage | undefined => {
  switch (message.type) {
    case 'error': {
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
      // 安全地处理消息数据，确保它是字符串格式
      let contentData = message.data;
      if (typeof contentData !== 'string') {
        if (contentData === null || contentData === undefined) {
          return undefined; // 过滤掉空内容
        } else if (typeof contentData === 'object') {
          // 如果是空对象，过滤掉整个消息
          if (Object.keys(contentData).length === 0) {
            return undefined;
          } else {
            // 尝试提取有意义的内容
            const extracted = contentData.content || contentData.message || contentData.text;
            if (extracted) {
              contentData = extracted;
            } else {
              // 如果没有有意义的内容，过滤掉整个消息
              return undefined;
            }
          }
        } else {
          contentData = String(contentData);
        }
      }

      // 如果最终内容为空字符串，也过滤掉
      if (!contentData || contentData.trim() === '') {
        return undefined;
      }

      return {
        id: uuid(),
        type: 'text',
        msg_id: message.msg_id,
        position: 'left',
        conversation_id: message.conversation_id,
        content: {
          content: contentData,
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
    case 'apply_patch_approval_request': {
      // Transform Codex patch request to standard permission request
      const patchData = message.data;
      // Create unique ID combining message type and call_id to avoid conflicts
      const uniqueRequestId = `patch_${patchData.call_id}`;

      return {
        id: uuid(),
        type: 'acp_permission',
        msg_id: message.msg_id,
        position: 'center',
        conversation_id: message.conversation_id,
        content: {
          title: 'File Write Permission',
          description: `Codex wants to write ${Object.keys(patchData.changes || {}).length} file(s) to your workspace`,
          agentType: 'codex',
          sessionId: '',
          options: [
            {
              optionId: 'allow_once',
              name: 'Allow',
              kind: 'allow_once' as const,
              description: 'Allow this file operation',
            },
            {
              optionId: 'reject_once',
              name: 'Reject',
              kind: 'reject_once' as const,
              description: 'Reject this file operation',
            },
          ],
          requestId: uniqueRequestId,
          toolCall: {
            title: 'Write File',
            toolCallId: uniqueRequestId,
            rawInput: {
              description: `Apply changes to ${Object.keys(patchData.changes || {}).length} file(s)`,
            },
          },
        } as ExtendedAcpPermissionRequest,
      };
    }
    case 'elicitation/create': {
      // Handle Codex native elicitation requests
      const elicitationData = message.data;

      // Handle different types of elicitations
      if (elicitationData.codex_elicitation === 'patch-approval') {
        // Create unique ID combining message type and call_id to avoid conflicts
        const uniqueRequestId = `elicitation_${elicitationData.codex_call_id}`;

        // File write permission request
        return {
          id: uuid(),
          type: 'acp_permission',
          msg_id: message.msg_id,
          position: 'center',
          conversation_id: message.conversation_id,
          content: {
            title: 'File Write Permission',
            description: elicitationData.message || 'Codex wants to apply proposed code changes',
            agentType: 'codex',
            sessionId: '',
            options: [
              {
                optionId: 'allow_once',
                name: 'Allow',
                kind: 'allow_once' as const,
                description: 'Allow this file operation',
              },
              {
                optionId: 'reject_once',
                name: 'Reject',
                kind: 'reject_once' as const,
                description: 'Reject this file operation',
              },
            ],
            requestId: uniqueRequestId,
            toolCall: {
              title: 'Write File',
              toolCallId: uniqueRequestId,
              rawInput: {
                description: elicitationData.message,
              },
            },
          } as ExtendedAcpPermissionRequest,
        };
      }

      // Handle file read permission requests or other permission types
      if (elicitationData.codex_elicitation === 'file-read' || (elicitationData.message && elicitationData.message.toLowerCase().includes('read'))) {
        const uniqueRequestId = `elicitation_${elicitationData.codex_call_id}`;

        return {
          id: uuid(),
          type: 'acp_permission',
          msg_id: message.msg_id,
          position: 'center',
          conversation_id: message.conversation_id,
          content: {
            title: 'File Read Permission',
            description: elicitationData.message || 'Codex wants to read files from your workspace',
            agentType: 'codex',
            sessionId: '',
            options: [
              {
                optionId: 'allow_once',
                name: 'Allow',
                kind: 'allow_once' as const,
                description: 'Allow reading files',
              },
              {
                optionId: 'reject_once',
                name: 'Reject',
                kind: 'reject_once' as const,
                description: 'Reject file access',
              },
            ],
            requestId: uniqueRequestId,
            toolCall: {
              title: 'Read File',
              toolCallId: uniqueRequestId,
              rawInput: {
                description: elicitationData.message,
              },
            },
          } as ExtendedAcpPermissionRequest,
        };
      }

      // For other elicitation types, create a generic elicitation message
      return {
        id: uuid(),
        type: 'codex_elicitation',
        msg_id: message.msg_id,
        position: 'center',
        conversation_id: message.conversation_id,
        content: {
          elicitationType: elicitationData.codex_elicitation,
          message: elicitationData.message,
          requestedSchema: elicitationData.requestedSchema,
          codex_call_id: elicitationData.codex_call_id,
          codex_changes: elicitationData.codex_changes,
        },
      };
    }
    case 'start':
    case 'finish':
    case 'thought':
      // These message types should not be displayed in UI
      return undefined;
    default: {
      // 对于未知消息类型，也需要安全处理数据
      let unknownData = message.data;
      if (typeof unknownData !== 'string') {
        if (unknownData === null || unknownData === undefined) {
          return undefined;
        } else if (typeof unknownData === 'object') {
          if (Object.keys(unknownData).length === 0) {
            return undefined;
          }
          const extracted = unknownData.content || unknownData.message || unknownData.text;
          if (extracted) {
            unknownData = extracted;
          } else {
            return undefined;
          }
        } else {
          unknownData = String(unknownData);
        }
      }

      return {
        type: message.type,
        content: unknownData,
        position: 'left',
        id: uuid(),
      } as any;
    }
  }
};

/**
 * @description 将消息合并到消息列表中
 * */
export const composeMessage = (message: TMessage | undefined, list: TMessage[] | undefined): TMessage[] => {
  if (!message) return list || [];
  if (!list?.length) return message ? [message] : [];
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

    if (newContent.includes(lastContent) || lastContent === 'loading...') {
      // 新内容包含旧内容或旧内容是loading，直接替换
      message.content.content = newContent;
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
