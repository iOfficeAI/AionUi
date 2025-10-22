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
}

export class StreamingMessageBuffer {
  private buffers = new Map<string, StreamBuffer>();

  // 默认配置
  private readonly UPDATE_INTERVAL = 300; // 300ms 更新一次
  private readonly CHUNK_BATCH_SIZE = 20; // 或累积 20 个 chunk
  private readonly mode: 'accumulate' | 'replace' = 'accumulate'; // 默认替换模式

  constructor(private config?: StreamingConfig) {
    if (config?.updateInterval) {
      (this as any).UPDATE_INTERVAL = config.updateInterval;
    }
    if (config?.chunkBatchSize) {
      (this as any).CHUNK_BATCH_SIZE = config.chunkBatchSize;
    }
  }

  /**
   * 追加流式 chunk
   *
   * @param id
   * @param messageId - 合并消息唯一 ID
   * @param conversationId - 会话 ID
   * @param chunk - 文本片段
   *
   * 性能优化：批量写入而非每个 chunk 都写数据库
   * @param mode
   */
  append(id: string, messageId: string, conversationId: string, chunk: string, mode: 'accumulate' | 'replace'): void {
    (this as any).mode = mode;
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
      this.flushBuffer(id, messageId, false);
    } else {
      // 设置延迟更新（防止消息流中断）
      buffer.updateTimer = setTimeout(() => {
        this.flushBuffer(id, messageId, false);
      }, this.UPDATE_INTERVAL);
    }
  }

  /**
   * 刷新缓冲区到数据库
   *
   * @param id
   * @param messageId - 合并消息唯一消息 ID
   * @param clearBuffer - 是否清理缓冲区（默认 false）
   */
  private flushBuffer(id: string, messageId: string, clearBuffer = false): void {
    const buffer = this.buffers.get(messageId);
    if (!buffer) return;

    const db = getDatabase();

    try {
      const message: TMessage = {
        id: id,
        msg_id: messageId,
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
}

// 单例实例
export const streamingBuffer = new StreamingMessageBuffer();
