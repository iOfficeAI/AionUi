/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import type { IResponseMessage } from '@/common/ipcBridge';

/**
 * Channel 全局事件类型
 * Channel global event types
 */
export const ChannelEvents = {
  /** Agent 消息事件 / Agent message event */
  AGENT_MESSAGE: 'channel.agent.message',
} as const;

/**
 * Agent 消息事件数据
 * Agent message event data
 */
export interface IAgentMessageEvent extends IResponseMessage {
  conversation_id: string;
}

/**
 * ChannelEventBus - 全局事件总线
 *
 * 用于 Agent 消息的全局分发，解耦 ChannelMessageService 与 Agent Task
 *
 * Usage:
 * ```typescript
 * // 发送事件（在 GeminiAgentManager 等中）
 * channelEventBus.emitAgentMessage(conversationId, data);
 *
 * // 监听事件（在 ChannelMessageService 中）
 * channelEventBus.onAgentMessage((event) => {
 *   // 处理消息
 * });
 * ```
 */
class ChannelEventBus extends EventEmitter {
  constructor() {
    super();
    // 增加监听器上限，避免警告
    this.setMaxListeners(100);
  }

  /**
   * 发送 Agent 消息事件
   * Emit agent message event
   */
  emitAgentMessage(conversationId: string, data: IResponseMessage): void {
    const event: IAgentMessageEvent = {
      ...data,
      conversation_id: conversationId,
    };
    this.emit(ChannelEvents.AGENT_MESSAGE, event);
  }

  /**
   * 监听 Agent 消息事件
   * Listen to agent message event
   */
  onAgentMessage(handler: (event: IAgentMessageEvent) => void): () => void {
    this.on(ChannelEvents.AGENT_MESSAGE, handler);
    return () => {
      this.off(ChannelEvents.AGENT_MESSAGE, handler);
    };
  }

  /**
   * 移除 Agent 消息监听器
   * Remove agent message listener
   */
  offAgentMessage(handler: (event: IAgentMessageEvent) => void): void {
    this.off(ChannelEvents.AGENT_MESSAGE, handler);
  }
}

// 单例
export const channelEventBus = new ChannelEventBus();
