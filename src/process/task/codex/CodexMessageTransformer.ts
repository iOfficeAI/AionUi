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
   * 转换 Codex 特定的消息类型
   * @param message 原始消息
   * @returns 转换后的 TMessage 或 undefined
   */
  static transformCodexMessage(message: IResponseMessage): TMessage | undefined {
    console.log('🔄 [CodexMessageTransformer] Processing Codex message:', {
      type: message.type,
      msg_id: message.msg_id,
      conversation_id: message.conversation_id,
      dataType: typeof message.data,
      dataContent: typeof message.data === 'string' ? message.data.substring(0, 100) + '...' : message.data,
    });

    try {
      switch (message.type) {
        case 'agent_reasoning': {
          console.log('🧠 [CodexMessageTransformer] Processing agent reasoning message');
          return {
            id: uuid(),
            type: 'text',
            msg_id: message.msg_id,
            position: 'left',
            conversation_id: message.conversation_id,
            content: {
              content: `💭 思考: ${message.data}`,
            },
          };
        }

        case 'agent_reasoning_delta': {
          console.log('🧠 [CodexMessageTransformer] Processing agent reasoning delta message');
          return {
            id: uuid(),
            type: 'text',
            msg_id: message.msg_id + '_reasoning_delta', // 确保推理delta消息有独特的ID
            position: 'left',
            conversation_id: message.conversation_id,
            content: {
              content: `💭 ${message.data}`,
            },
          };
        }

        case 'agent_reasoning_raw_content': {
          console.log('🧠 [CodexMessageTransformer] Processing agent reasoning raw content message');
          return {
            id: uuid(),
            type: 'text',
            msg_id: message.msg_id,
            position: 'left',
            conversation_id: message.conversation_id,
            content: {
              content: `🔍 推理详情: ${message.data}`,
            },
          };
        }

        case 'agent_reasoning_raw_content_delta': {
          console.log('🧠 [CodexMessageTransformer] Processing agent reasoning raw content delta message');
          return {
            id: uuid(),
            type: 'text',
            msg_id: message.msg_id,
            position: 'left',
            conversation_id: message.conversation_id,
            content: {
              content: message.data,
            },
          };
        }

        case 'agent_reasoning_section_break': {
          console.log('🧠 [CodexMessageTransformer] Processing agent reasoning section break message');
          return {
            id: uuid(),
            type: 'text',
            msg_id: message.msg_id,
            position: 'left',
            conversation_id: message.conversation_id,
            content: {
              content: '📍 ---',
            },
          };
        }

        case 'codex_permission': {
          console.log('🔐 [CodexMessageTransformer] Processing Codex permission message');
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
          console.log('📊 [CodexMessageTransformer] Processing Codex status message');
          return {
            id: uuid(),
            type: 'codex_status',
            msg_id: message.msg_id,
            position: 'center',
            conversation_id: message.conversation_id,
            content: message.data,
          };
        }

        default:
          // 返回 undefined 表示这不是 Codex 特定的消息类型
          return undefined;
      }
    } catch (error) {
      console.error('❌ [CodexMessageTransformer] Error processing Codex message:', error);
      console.error('❌ [CodexMessageTransformer] Problematic message:', message);

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
    const codexTypes = ['agent_reasoning', 'agent_reasoning_delta', 'agent_reasoning_raw_content', 'agent_reasoning_raw_content_delta', 'agent_reasoning_section_break', 'codex_permission', 'codex_status'];
    return codexTypes.includes(messageType);
  }
}
