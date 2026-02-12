/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import WorkerManage from '@/process/WorkerManage';
import { getDatabase } from '@/process/database';
import type BaseAgentManager from '@/process/task/BaseAgentManager';
import { composeMessage, transformMessage, type TMessage } from '../../common/chatLib';
import { uuid } from '../../common/utils';
import { channelEventBus, type IAgentMessageEvent } from './ChannelEventBus';

/**
 * Streaming callback for progress updates
 */
export type StreamCallback = (chunk: TMessage, insert: boolean) => void;

/**
 * 消息流状态
 * Message stream state
 */
interface IStreamState {
  msgId: string;
  callback: StreamCallback;
  buffer: string;
  resolve: (value: string) => void;
  reject: (error: Error) => void;
}

/**
 * ChannelMessageService - Manages message sending for Channel
 *
 * Architecture (分离设计):
 * 1. 全局事件监听：通过 ChannelEventBus 监听 Agent 消息
 * 2. sendMessage(): 仅发送消息和注册流回调
 * 3. handleAgentMessage(): 处理消息事件
 *
 * 不直接与 Agent Task 交互，完全通过全局事件总线解耦
 */
export class ChannelMessageService {
  /**
   * 活跃消息流缓存：conversationId -> 流状态
   * Active message stream cache: conversationId -> stream state
   */
  private activeStreams: Map<string, IStreamState> = new Map();

  /**
   * 全局事件监听器清理函数
   * Global event listener cleanup function
   */
  private eventCleanup: (() => void) | null = null;

  /**
   * 是否已初始化
   * Whether initialized
   */
  private initialized = false;

  private messageListMap = new Map<string, TMessage[]>();

  /**
   * 初始化服务，注册全局事件监听
   * Initialize service, register global event listener
   */
  initialize(): void {
    if (this.initialized) {
      return;
    }

    // 监听全局 Agent 消息事件
    // Listen to global agent message events
    this.eventCleanup = channelEventBus.onAgentMessage((event) => {
      this.handleAgentMessage(event);
    });

    this.initialized = true;
  }

  /**
   * 处理 Agent 消息事件
   * Handle agent message event
   */
  private handleAgentMessage(event: IAgentMessageEvent): void {
    const conversationId = event.conversation_id;
    const stream = this.activeStreams.get(conversationId);
    if (!stream) {
      // 没有活跃的流，忽略消息
      // No active stream, ignore message
      return;
    }

    // 转换消息
    // Transform message
    const message = transformMessage(event);
    if (!message) {
      // transformMessage 返回 undefined 表示不需要处理的消息类型（如 thought, start）
      // transformMessage returns undefined for message types that don't need processing (like thought, start)
      return;
    }

    let messageList = this.messageListMap.get(conversationId);
    if (!messageList) {
      messageList = [];
    }

    messageList = composeMessage(message, messageList, (type, msg: TMessage) => {
      // insert: true 表示新消息，false 表示更新现有消息
      // insert: true means new message, false means update existing message

      const isInsert = type === 'insert';
      stream.callback(msg, isInsert);
    });
    this.messageListMap.set(conversationId, messageList.slice(-20));
  }

  /**
   * Send a message and get streaming response
   *
   * @param _sessionId - User session ID (kept for API compatibility)
   * @param conversationId - Conversation ID for context
   * @param message - User message text
   * @param onStream - Callback for streaming updates
   * @returns Promise that resolves when streaming is complete
   */
  async sendMessage(_sessionId: string, conversationId: string, message: string, onStream: StreamCallback): Promise<string> {
    // 确保服务已初始化
    // Ensure service is initialized
    this.initialize();

    // 生成消息 ID
    // Generate message ID
    const msgId = `channel_msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // 获取任务
    // Get task
    let task: BaseAgentManager<unknown>;
    try {
      // 检查会话来源，如果来自 Channel 则开启 yoloMode (自动同意)
      // Check conversation source, enable yoloMode if it's from a Channel
      const db = getDatabase();
      const dbResult = db.getConversation(conversationId);
      const isFromChannel = dbResult.success && (dbResult.data?.source === 'lark' || dbResult.data?.source === 'telegram');

      task = await WorkerManage.getTaskByIdRollbackBuild(conversationId, {
        yoloMode: isFromChannel,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to get conversation task';
      console.error(`[ChannelMessageService] Failed to get task:`, errorMsg);
      onStream(
        {
          type: 'tips',
          id: uuid(),
          conversation_id: conversationId,
          content: {
            type: 'error',
            content: `Error: ${errorMsg}`,
          },
        },
        true
      );
      throw error;
    }

    return new Promise((resolve, reject) => {
      // 注册流状态
      // Register stream state
      this.activeStreams.set(conversationId, {
        msgId,
        callback: onStream,
        buffer: '',
        resolve,
        reject,
      });

      // Build payload based on agent type.
      // Gemini expects { input }, ACP/Codex expect { content }.
      const payload: { input?: string; content?: string; msg_id: string } = task.type === 'gemini' ? { input: message, msg_id: msgId } : task.type === 'acp' || task.type === 'codex' ? { content: message, msg_id: msgId } : { content: message, msg_id: msgId };

      task.sendMessage(payload).catch((error: Error) => {
        const errorMessage = `Error: ${error.message || 'Failed to send message'}`;
        console.error(`[ChannelMessageService] Send error:`, error);
        onStream({ type: 'tips', id: uuid(), conversation_id: conversationId, content: { type: 'error', content: errorMessage } }, true);
        this.activeStreams.delete(conversationId);
        reject(error);
      });
    });
  }

  /**
   * Clear conversation context for a session
   * Note: Agent cleanup is handled by WorkerManage.
   *
   * 清理会话上下文。Agent 的清理由 WorkerManage 处理。
   */
  async clearContext(_sessionId: string): Promise<void> {
    // Agent cleanup is handled by WorkerManage
  }

  /**
   * Clear active stream for a conversation
   * 清理指定会话的活跃流
   */
  clearStreamByConversationId(conversationId: string): void {
    const stream = this.activeStreams.get(conversationId);
    if (stream) {
      this.activeStreams.delete(conversationId);
    }
  }

  /**
   * Stop streaming for a conversation
   */
  async stopStreaming(conversationId: string): Promise<void> {
    try {
      const task = WorkerManage.getTaskById(conversationId);
      if (task) {
        await task.stop();
      }
    } catch (error) {
      console.warn(`[ChannelMessageService] Failed to stop streaming:`, error);
    }
    this.clearStreamByConversationId(conversationId);
  }

  /**
   * Confirm a tool call for a conversation
   * 确认工具调用
   *
   * @param conversationId - Conversation ID
   * @param callId - Tool call ID
   * @param value - Confirmation value (e.g., 'proceed_once', 'cancel')
   */
  async confirm(conversationId: string, callId: string, value: string): Promise<void> {
    try {
      const task = WorkerManage.getTaskById(conversationId);
      if (!task) {
        throw new Error(`Task not found for conversation ${conversationId}`);
      }

      // 调用 agent 的 confirm 方法
      // Call agent's confirm method
      task.confirm(conversationId, callId, value);
    } catch (error) {
      console.error(`[ChannelMessageService] Failed to confirm tool call:`, error);
      throw error;
    }
  }

  /**
   * Shutdown service
   * Called during application shutdown
   */
  async shutdown(): Promise<void> {
    // 清理所有活跃流
    // Clear all active streams
    for (const [conversationId] of this.activeStreams) {
      this.clearStreamByConversationId(conversationId);
    }
    this.activeStreams.clear();

    // 移除全局事件监听
    // Remove global event listener
    if (this.eventCleanup) {
      this.eventCleanup();
      this.eventCleanup = null;
    }

    this.initialized = false;
  }
}

// Singleton instance
let serviceInstance: ChannelMessageService | null = null;

export function getChannelMessageService(): ChannelMessageService {
  if (!serviceInstance) {
    serviceInstance = new ChannelMessageService();
  }
  return serviceInstance;
}

// Backward compatibility export
// 向后兼容的导出
export { ChannelMessageService as ChannelGeminiService, getChannelMessageService as getChannelGeminiService };
