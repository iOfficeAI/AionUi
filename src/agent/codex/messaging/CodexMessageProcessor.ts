/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { uuid } from '@/common/utils';
import type { CodexAgentEventType, CodexAgentEvent, AgentReasoningDeltaData, AgentReasoningData, BaseCodexEventData } from '@/common/codex/types';
import type { ICodexMessageEmitter } from '@/agent/codex/messaging/CodexMessageEmitter';
import { globalErrorService, ERROR_CODES } from '@/agent/codex/core/ErrorService';

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

  handleReasoningMessage(
    evt:
      | Extract<
          CodexAgentEvent,
          {
            type: CodexAgentEventType.AGENT_REASONING_DELTA;
          }
        >
      | Extract<CodexAgentEvent, { type: CodexAgentEventType.AGENT_REASONING }>
      | Extract<
          CodexAgentEvent,
          {
            type: CodexAgentEventType.AGENT_REASONING_SECTION_BREAK;
          }
        >
  ) {
    const eventData = evt.data as AgentReasoningDeltaData | AgentReasoningData | BaseCodexEventData | undefined;
    this.currentReason = this.currentReason + (eventData as AgentReasoningDeltaData)?.delta || (eventData as AgentReasoningData)?.text || '';
    this.messageEmitter.emitAndPersistMessage(
      {
        type: 'thought',
        msg_id: this.reasoningMsgId, // 使用固定的msg_id确保消息合并
        conversation_id: this.conversation_id,
        data: {
          description: this.currentReason,
          subject: '',
        },
      },
      false
    );
  }

  processMessageDelta(evt: Extract<CodexAgentEvent, { type: CodexAgentEventType.AGENT_MESSAGE_DELTA }>) {
    const rawDelta = typeof evt.data?.delta === 'string' ? evt.data.delta : '';
    const deltaMessage = {
      type: 'content' as const,
      conversation_id: this.conversation_id,
      msg_id: this.currentLoadingId,
      data: rawDelta,
    };
    this.messageEmitter.emitAndPersistMessage(deltaMessage);
  }

  processStreamError(evt: Extract<CodexAgentEvent, { type: CodexAgentEventType.STREAM_ERROR }>) {
    const message = evt.data?.message || 'Codex stream error';

    // Use error service to create standardized error
    const codexError = globalErrorService.createError(ERROR_CODES.NETWORK_UNKNOWN, message, {
      context: 'CodexMessageProcessor.processStreamError',
      technicalDetails: {
        originalEvent: evt,
        eventType: 'STREAM_ERROR',
      },
    });

    // Process through error service for user-friendly message
    const processedError = globalErrorService.handleError(codexError, 'stream_processing');

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

    const errMsg = {
      type: 'error' as const,
      conversation_id: this.conversation_id,
      msg_id: msgId,
      data: processedError.userMessage || message,
    };
    this.messageEmitter.emitAndPersistMessage(errMsg);
  }

  processGenericError(evt: { type: 'error'; data: { message?: string } | string }) {
    const message = typeof evt.data === 'string' ? evt.data : evt.data?.message || 'Unknown error';

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
