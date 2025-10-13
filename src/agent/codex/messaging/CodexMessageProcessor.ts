/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { uuid } from '@/common/utils';
import type { CodexEventMsg } from '@/common/codex/types';
import type { ICodexMessageEmitter } from '@/agent/codex/messaging/CodexMessageEmitter';
import { ERROR_CODES, globalErrorService } from '@/agent/codex/core/ErrorService';
import { addOrUpdateMessage } from '@/process/message';

export class CodexMessageProcessor {
  private currentLoadingId: string | null = null;
  private deltaTimeout: NodeJS.Timeout | null = null;
  private reasoningMsgId: string | null = null;
  private currentReason: string = '';

  constructor(
    private conversation_id: string,
    private messageEmitter: ICodexMessageEmitter
  ) {}

  processTaskStart() {
    this.currentLoadingId = uuid();
    this.reasoningMsgId = uuid();
    this.currentReason = '';
  }

  processReasonSectionBreak() {
    this.currentReason = '';
  }

  processTaskComplete() {
    this.currentLoadingId = null;
    this.reasoningMsgId = null;
    this.currentReason = '';

    this.messageEmitter.emitAndPersistMessage(
      {
        type: 'finish',
        msg_id: uuid(),
        conversation_id: this.conversation_id,
        data: null,
      },
      false
    );
  }

  handleReasoningMessage(msg: Extract<CodexEventMsg, { type: 'agent_reasoning_delta' }> | Extract<CodexEventMsg, { type: 'agent_reasoning' }> | Extract<CodexEventMsg, { type: 'agent_reasoning_section_break' }>) {
    // 根据事件类型处理不同的数据结构 - TypeScript 自动类型缩窄
    let deltaText = '';
    if (msg.type === 'agent_reasoning_delta') {
      deltaText = msg.delta ?? '';
      console.log(`[CodexMessageProcessor] Reasoning delta: "${deltaText}"`);
    } else if (msg.type === 'agent_reasoning') {
      deltaText = msg.text ?? '';
      console.log(`[CodexMessageProcessor] Reasoning text: "${deltaText}"`);
    }
    // AGENT_REASONING_SECTION_BREAK 不添加内容，只是重置当前reasoning

    this.currentReason = this.currentReason + deltaText;
    console.log(`[CodexMessageProcessor] Emitting thought message, total length: ${this.currentReason.length}`);
    this.messageEmitter.emitAndPersistMessage(
      {
        type: 'thought',
        msg_id: this.reasoningMsgId, // 使用固定的msg_id确保消息合并
        conversation_id: this.conversation_id,
        data: {
          description: this.currentReason,
          subject: 'Thinking',
        },
      },
      false
    );
  }

  processMessageDelta(msg: Extract<CodexEventMsg, { type: 'agent_message_delta' }>) {
    const rawDelta = msg.delta;
    const deltaMessage = {
      type: 'content' as const,
      conversation_id: this.conversation_id,
      msg_id: this.currentLoadingId,
      data: rawDelta,
    };
    // 仅发送到前端，不持久化（persist: false）
    // 最终消息会通过 agent_message 事件持久化
    this.messageEmitter.emitAndPersistMessage(deltaMessage, false);
  }

  processFinalMessage(msg: Extract<CodexEventMsg, { type: 'agent_message' }>) {
    // agent_message 包含完整的最终消息内容
    // 只持久化到数据库，不发送到前端（前端已通过 delta 流式显示）
    console.log(`[CodexMessageProcessor] Processing final message: ${msg.message.length} chars`);

    const transformedMessage = {
      id: this.currentLoadingId || uuid(),
      msg_id: this.currentLoadingId,
      type: 'text' as const,
      position: 'left' as const,
      conversation_id: this.conversation_id,
      content: { content: msg.message },
      createdAt: Date.now(),
      _isFinalMessage: true, // 标记为最终完整消息，用于替换而非累积
    };

    // 直接调用数据库存储，跳过 emit
    addOrUpdateMessage(this.conversation_id, transformedMessage as any);
    console.log(`[CodexMessageProcessor] Final message persisted successfully`);
  }

  processStreamError(message: string) {
    // Use error service to create standardized error
    const codexError = globalErrorService.createError(ERROR_CODES.NETWORK_UNKNOWN, message, {
      context: 'CodexMessageProcessor.processStreamError',
      technicalDetails: {
        originalMessage: message,
        eventType: 'STREAM_ERROR',
      },
    });

    // Process through error service for user-friendly message
    const processedError = globalErrorService.handleError(codexError);

    const errorHash = this.generateErrorHash(message);

    // 检测消息类型：重试消息 vs 最终错误消息
    const isRetryMessage = message.includes('retrying');
    const isFinalError = !isRetryMessage && message.includes('error sending request');

    let msgId: string;
    if (isRetryMessage) {
      // 所有重试消息使用同一个ID，这样会被合并更新
      msgId = `stream_retry_${errorHash}`;
    } else if (isFinalError) {
      // 最终错误消息也使用重试消息的ID，这样会替换掉重试消息
      msgId = `stream_retry_${errorHash}`;
    } else {
      // 其他错误使用唯一ID
      msgId = `stream_error_${errorHash}`;
    }

    // Use error code for structured error handling
    // The data will contain error code info that can be translated on frontend
    const errorData = processedError.code ? `ERROR_${processedError.code}: ${message}` : processedError.userMessage || message;

    const errMsg = {
      type: 'error' as const,
      conversation_id: this.conversation_id,
      msg_id: msgId,
      data: errorData,
    };
    this.messageEmitter.emitAndPersistMessage(errMsg);
  }

  processGenericError(evt: { type: 'error'; data: { message?: string } | string }) {
    const message = typeof evt.data === 'string' ? evt.data : evt.data.message || 'Unknown error';

    // 为相同的错误消息生成一致的msg_id以避免重复显示
    const errorHash = this.generateErrorHash(message);

    const errMsg = {
      type: 'error' as const,
      conversation_id: this.conversation_id,
      msg_id: `error_${errorHash}`,
      data: message,
    };

    this.messageEmitter.emitAndPersistMessage(errMsg);
  }

  private generateErrorHash(message: string): string {
    // 对于重试类型的错误消息，提取核心错误信息
    const normalizedMessage = this.normalizeRetryMessage(message);

    // 为相同的错误消息生成一致的简短hash
    let hash = 0;
    for (let i = 0; i < normalizedMessage.length; i++) {
      const char = normalizedMessage.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private normalizeRetryMessage(message: string): string {
    // 如果是重试消息，提取核心错误信息，忽略重试次数和延迟时间
    if (message.includes('retrying')) {
      // 匹配 "retrying X/Y in Zms..." 模式并移除它
      return message.replace(/;\s*retrying\s+\d+\/\d+\s+in\s+[\d.]+[ms]+[^;]*$/i, '');
    }

    // 其他类型的错误消息直接返回
    return message;
  }

  cleanup() {
    if (this.deltaTimeout) {
      clearTimeout(this.deltaTimeout);
      this.deltaTimeout = null;
    }
  }
}
