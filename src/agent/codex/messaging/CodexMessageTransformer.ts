/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chatLib';
import type { IResponseMessage } from '@/common/ipcBridge';
import { uuid } from '@/common/utils';

/**
 * Codex 特定消息类型的转换器
 * 处理 Codex 推理过程相关的消息类型
 */
export class CodexMessageTransformer {
  /**
   * 清理 Codex 消息内容中的多余换行符
   */
  private static cleanCodexContent(content: string): string {
    if (!content || typeof content !== 'string') {
      return '';
    }

    // 首先检查是否只包含空白字符（包括换行符）
    if (!content.trim()) {
      return '';
    }

    return content;
  }

  /**
   * 转换 Codex 特定的消息类型
   * @param message 原始消息
   * @returns 转换后的 TMessage 或 undefined
   */
  static transformCodexMessage(message: IResponseMessage): TMessage | undefined {
    // Processing Codex message

    try {
      switch (message.type) {
        case 'acp_permission': {
          // Check if this is actually a Codex permission request
          if (message.data?.agentType === 'codex') {
            return {
              id: uuid(),
              type: 'codex_permission',
              msg_id: message.msg_id,
              position: 'left',
              conversation_id: message.conversation_id,
              content: message.data,
            };
          }
          // Return undefined for non-Codex ACP permissions
          return undefined;
        }

        case 'codex_permission': {
          return {
            id: uuid(),
            type: 'codex_permission',
            msg_id: message.msg_id,
            position: 'left',
            conversation_id: message.conversation_id,
            content: message.data,
          };
        }

        case 'codex_status': {
          return {
            id: uuid(),
            type: 'codex_status',
            msg_id: 'codex_status_global', // 使用全局ID确保只显示最新状态
            position: 'center',
            conversation_id: message.conversation_id,
            content: message.data,
          };
        }

        case 'agent_message_delta': {
          const cleanedContent = this.cleanCodexContent(message.data?.delta || '');
          if (!cleanedContent) {
            return undefined;
          }
          return {
            id: uuid(),
            type: 'text',
            msg_id: message.msg_id || 'agent_message_delta',
            position: 'left',
            conversation_id: message.conversation_id,
            content: {
              content: cleanedContent,
            },
          };
        }

        case 'agent_message': {
          const cleanedContent = this.cleanCodexContent(message.data?.message || '');
          if (!cleanedContent) {
            return undefined;
          }
          return {
            id: uuid(),
            type: 'text',
            msg_id: message.msg_id || 'agent_message',
            position: 'left',
            conversation_id: message.conversation_id,
            content: {
              content: cleanedContent,
            },
          };
        }

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

        default:
          // 返回 undefined 表示这不是 Codex 特定的消息类型
          return undefined;
      }
    } catch (error) {
      // 返回安全的错误消息
      return {
        id: uuid(),
        type: 'tips',
        msg_id: message.msg_id || uuid(),
        position: 'center',
        conversation_id: message.conversation_id || '',
        content: {
          content: `Codex message processing error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          type: 'error',
        },
      };
    }
  }

  /**
   * 检查是否为 Codex 特定的消息类型
   * @param messageType 消息类型
   * @returns 是否为 Codex 特定类型
   */
  static isCodexSpecificMessage(messageType: string): boolean {
    const codexTypes = ['agent_reasoning', 'agent_reasoning_delta', 'agent_reasoning_raw_content', 'agent_reasoning_raw_content_delta', 'agent_reasoning_section_break', 'acp_permission', 'codex_permission', 'codex_status', 'agent_message_delta', 'agent_message', 'error'];
    return codexTypes.includes(messageType);
  }
}
