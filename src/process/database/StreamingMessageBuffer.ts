/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chatLib';
import { getDatabase } from './index';

/**
 * 流式消息缓冲管理器
 *
 * 作用：优化流式消息的数据库写入性能
 *
 * 核心策略：
 * - 延迟更新：不是每个 chunk 都写数据库，而是定期批量更新
 * - 批量写入：每 300ms 或累积 20 个 chunk 后写入一次
 *
 * 性能提升：
 * - 原本：1000 次 UPDATE（每个 chunk 一次）
 * - 优化后：~10 次 UPDATE（定期批量）
 * - 提升：100 倍
 */

interface StreamBuffer {
  messageId: string;
  conversationId: string;
  currentContent: string;
  chunkCount: number;
  lastDbUpdate: number;
  updateTimer?: NodeJS.Timeout;
}

interface StreamingConfig {
  updateInterval?: number; // 更新间隔（毫秒）
  chunkBatchSize?: number; // 每多少个 chunk 更新一次
  mode?: 'accumulate' | 'replace'; // 累积模式或替换模式
}

export class StreamingMessageBuffer {
  private buffers = new Map<string, StreamBuffer>();

  // 默认配置
  private readonly UPDATE_INTERVAL = 300; // 300ms 更新一次
  private readonly CHUNK_BATCH_SIZE = 20; // 或累积 20 个 chunk
  private readonly mode: 'accumulate' | 'replace' = 'replace'; // 默认替换模式

  constructor(private config?: StreamingConfig) {
    if (config?.updateInterval) {
      (this as any).UPDATE_INTERVAL = config.updateInterval;
    }
    if (config?.chunkBatchSize) {
      (this as any).CHUNK_BATCH_SIZE = config.chunkBatchSize;
    }
    if (config?.mode) {
      (this as any).mode = config.mode;
    }
  }

  /**
   * 追加流式 chunk
   *
   * @param messageId - 消息 ID
   * @param conversationId - 会话 ID
   * @param chunk - 文本片段
   *
   * 性能优化：批量写入而非每个 chunk 都写数据库
   */
  append(messageId: string, conversationId: string, chunk: string): void {
    let buffer = this.buffers.get(messageId);

    if (!buffer) {
      // 首次 chunk，初始化缓冲区
      buffer = {
        messageId,
        conversationId,
        currentContent: chunk,
        chunkCount: 1,
        lastDbUpdate: Date.now(),
      };
      this.buffers.set(messageId, buffer);
    } else {
      // 根据模式累积或替换内容
      if (this.mode === 'accumulate') {
        buffer.currentContent += chunk;
      } else {
        buffer.currentContent = chunk; // 替换模式：直接覆盖
      }
      buffer.chunkCount++;
    }

    // 清除旧的定时器
    if (buffer.updateTimer) {
      clearTimeout(buffer.updateTimer);
      buffer.updateTimer = undefined;
    }

    // 判断是否需要更新数据库（仅基于数量和时间）
    const shouldUpdate =
      buffer.chunkCount % this.CHUNK_BATCH_SIZE === 0 || // 累积足够的 chunk
      Date.now() - buffer.lastDbUpdate > this.UPDATE_INTERVAL; // 超过时间间隔

    if (shouldUpdate) {
      // 立即更新
      this.flushBuffer(messageId, false);
    } else {
      // 设置延迟更新（防止消息流中断）
      buffer.updateTimer = setTimeout(() => {
        this.flushBuffer(messageId, false);
      }, this.UPDATE_INTERVAL);
    }
  }

  /**
   * 刷新缓冲区到数据库
   *
   * @param messageId - 消息 ID
   * @param clearBuffer - 是否清理缓冲区（默认 false）
   */
  private flushBuffer(messageId: string, clearBuffer = false): void {
    const buffer = this.buffers.get(messageId);
    if (!buffer) return;

    const db = getDatabase();

    try {
      const message: TMessage = {
        id: messageId,
        conversation_id: buffer.conversationId,
        type: 'text',
        content: { content: buffer.currentContent },
        status: 'pending',
        position: 'left',
        createdAt: Date.now(),
      };

      // Check if message exists in database
      const existing = db.getMessageByMsgId(buffer.conversationId, messageId);

      if (existing.success && existing.data) {
        // Message exists - update it
        db.updateMessage(existing.data.id, message);
      } else {
        // Message doesn't exist - insert it
        db.insertMessage(message);
      }

      // 更新最后写入时间
      buffer.lastDbUpdate = Date.now();

      // 如果需要，清理缓冲区
      if (clearBuffer) {
        this.buffers.delete(messageId);
      }
    } catch (error) {
      console.error(`[StreamingBuffer] Failed to flush buffer for ${messageId}:`, error);
    }
  }

  /**
   * 强制刷新指定消息（用于异常情况）
   *
   * @param messageId - 消息 ID
   */
  forceFlush(messageId: string): void {
    this.flushBuffer(messageId, true);
  }

  /**
   * 强制刷新所有缓冲区（用于应用退出等情况）
   */
  flushAll(): void {
    for (const messageId of this.buffers.keys()) {
      this.flushBuffer(messageId, true);
    }
  }

  /**
   * 强制刷新指定会话的所有缓冲区（用于会话结束时）
   *
   * @param conversationId - 会话 ID
   */
  flushConversation(conversationId: string): void {
    for (const [messageId, buffer] of this.buffers.entries()) {
      if (buffer.conversationId === conversationId) {
        this.flushBuffer(messageId, true);
      }
    }
  }

  /**
   * 获取当前缓冲区的内容（用于调试）
   *
   * @param messageId - 消息 ID
   */
  getBufferContent(messageId: string): string | undefined {
    return this.buffers.get(messageId)?.currentContent;
  }

  /**
   * 获取缓冲区统计信息（用于监控）
   */
  getStats(): {
    activeBuffers: number;
    totalChunks: number;
    bufferDetails: Array<{
      messageId: string;
      chunkCount: number;
      contentLength: number;
      lastUpdate: number;
    }>;
  } {
    const bufferDetails = Array.from(this.buffers.values()).map((buffer) => ({
      messageId: buffer.messageId,
      chunkCount: buffer.chunkCount,
      contentLength: buffer.currentContent.length,
      lastUpdate: buffer.lastDbUpdate,
    }));

    return {
      activeBuffers: this.buffers.size,
      totalChunks: bufferDetails.reduce((sum, b) => sum + b.chunkCount, 0),
      bufferDetails,
    };
  }
}

// 单例实例
export const streamingBuffer = new StreamingMessageBuffer();
