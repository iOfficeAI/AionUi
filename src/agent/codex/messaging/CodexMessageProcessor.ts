/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { uuid } from '@/common/utils';
import type { CodexAgentEventType, CodexAgentEvent } from '@/common/codexTypes';
import type { ICodexMessageEmitter } from '@/agent/codex/messaging/CodexMessageEmitter';

export class CodexMessageProcessor {
  private currentLoadingId: string | null = null;
  private currentContent: string = '';
  private deltaTimeout: NodeJS.Timeout | null = null;

  constructor(
    private conversation_id: string,
    private messageEmitter: ICodexMessageEmitter
  ) {}

  processMessageDelta(evt: Extract<CodexAgentEvent, { type: CodexAgentEventType.AGENT_MESSAGE_DELTA }>) {
    // 只在没有当前loading ID时创建新的，不因requestId变化而重置
    if (!this.currentLoadingId) {
      // Clear any existing timeout
      if (this.deltaTimeout) {
        clearTimeout(this.deltaTimeout);
        this.deltaTimeout = null;
      }

      this.currentLoadingId = uuid();
      this.currentContent = ''; // 重置累积内容
    }

    // 累积 delta 内容，但要兼容 Codex 可能返回全量 message 的情况，避免重复追加
    const rawDelta = typeof evt.data?.delta === 'string' ? evt.data.delta : undefined;
    const fullMessage = typeof evt.data?.message === 'string' ? evt.data.message : '';

    if (fullMessage) {
      // 如果服务端提供了完整内容，直接采用，避免重复拼接
      this.currentContent = this.cleanDeltaContent(fullMessage);
    } else if (typeof rawDelta === 'string' && rawDelta.length) {
      // 在累积之前先清理 delta 内容
      const cleanedDelta = this.cleanDeltaContent(rawDelta);

      // 如果清理后的内容为空，跳过这个 delta
      if (!cleanedDelta) {
        return;
      }

      const hasExisting = !!this.currentContent;
      const looksLikeFullReplay = hasExisting && cleanedDelta.length > this.currentContent.length && cleanedDelta.startsWith(this.currentContent);
      const isExactRepeat = hasExisting && cleanedDelta === this.currentContent && cleanedDelta.length > 1;

      if (looksLikeFullReplay) {
        // Codex 可能把累计内容作为 delta 重新下发，此时覆盖即可
        this.currentContent = cleanedDelta;
      } else if (!isExactRepeat) {
        // 常规增量场景，安全追加
        this.currentContent += cleanedDelta;
      }
    }

    // 发送完整累积的内容，使用相同的msg_id确保替换loading
    const deltaMessage = this.createContentMessage(this.currentContent, this.currentLoadingId!);
    if (deltaMessage) {
      // 只通过stream发送，避免重复处理
      this.messageEmitter.emitMessage(deltaMessage);
    }

    // Set/reset timeout to auto-finalize message if no completion event is received
    if (this.deltaTimeout) {
      clearTimeout(this.deltaTimeout);
    }
    this.deltaTimeout = setTimeout(() => {
      if (this.currentContent && this.currentContent.trim() && this.currentLoadingId) {
        // Send finish signal to UI - but don't pass through transformMessage as it's internal
        const finishMessage = {
          type: 'finish' as const,
          conversation_id: this.conversation_id,
          msg_id: this.currentLoadingId,
          data: {},
        };
        this.messageEmitter.emitMessage(finishMessage);
      }

      // Reset state
      this.currentLoadingId = null;
      this.currentContent = '';
      this.deltaTimeout = null;
    }, 3000); // 3 second timeout
  }

  processMessage(evt: Extract<CodexAgentEvent, { type: CodexAgentEventType.AGENT_MESSAGE }>) {
    // Clear timeout since we're finalizing the message
    if (this.deltaTimeout) {
      clearTimeout(this.deltaTimeout);
      this.deltaTimeout = null;
    }

    // 只在没有当前loading ID时创建新的，保持消息连续性
    if (!this.currentLoadingId) {
      this.currentLoadingId = uuid();
    }

    const messageContent = evt.data?.message || '';

    // Use accumulated content if available, otherwise use the direct message
    const finalContent = this.currentContent || messageContent;

    const message = this.createContentMessage(finalContent, this.currentLoadingId);
    if (message) {
      // 发送并持久化消息
      this.messageEmitter.emitAndPersistMessage(message, true);
    } else {
      // createContentMessage returned null
    }

    // Clear state after processing to prevent duplicate sends in processTaskComplete
    this.currentLoadingId = null;
    this.currentContent = '';
  }

  processTaskComplete() {
    // Clear timeout since we're finalizing the task
    if (this.deltaTimeout) {
      clearTimeout(this.deltaTimeout);
      this.deltaTimeout = null;
    }

    // If we have accumulated content but no final agent_message was sent, send it now
    if (this.currentContent && this.currentContent.trim() && this.currentLoadingId) {
      const message = this.createContentMessage(this.currentContent, this.currentLoadingId);
      if (message) {
        // 发送并持久化消息
        this.messageEmitter.emitAndPersistMessage(message, true);
      }
    }

    // Send finish signal to UI - but don't pass through transformMessage as it's internal
    const finishMessage = {
      type: 'finish' as const,
      conversation_id: this.conversation_id,
      msg_id: this.currentLoadingId || uuid(),
      data: {},
    };
    this.messageEmitter.emitMessage(finishMessage);

    // 延迟重置，确保所有消息都使用同一个ID
    setTimeout(() => {
      this.currentLoadingId = null;
      this.currentContent = '';
    }, 100);
  }

  processStreamError(evt: Extract<CodexAgentEvent, { type: CodexAgentEventType.STREAM_ERROR }>) {
    const message = evt.data?.message || 'Codex stream error';
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
      data: message,
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

  private createContentMessage(content: string, loadingId: string) {
    if (!content.trim()) {
      return null;
    }

    // 过滤重复的格式化标记和准备消息
    const filteredContent = this.filterInternalMarkers(content);

    if (!filteredContent.trim()) {
      return null;
    }

    // 额外检查：如果内容几乎全是换行符或空白字符，则过滤掉
    const contentWithoutWhitespace = filteredContent.replace(/\s/g, '');
    if (contentWithoutWhitespace.length === 0) {
      return null;
    }

    return {
      type: 'content' as const, // Use standard content type instead of ai_content
      conversation_id: this.conversation_id,
      msg_id: loadingId,
      data: filteredContent, // 使用过滤后的内容
    };
  }

  private cleanDeltaContent(content: string): string {
    if (!content || typeof content !== 'string') {
      return '';
    }

    // 过滤只包含空白字符的内容
    if (!content.trim()) {
      return '';
    }

    return (
      content
        // 清理多余的连续换行符
        .replace(/\n{3,}/g, '\n\n')
        // 注意：不要使用 .trim()，因为这会移除 delta 之间重要的空格
        // 只清理尾部的多余换行符
        .replace(/\n+$/, '')
    );
  }

  private filterInternalMarkers(content: string): string {
    // 定义需要过滤的模式 - 使用更精确的匹配，避免误删正常文本
    const filterPatterns = [
      /^\*\*Preparing.*$/gim, // 过滤 "**Preparing..."
      /^Preparing\s+.*$/gim, // 过滤独立的 "Preparing ..." 行
      /^\*\*Considering.*$/gim, // 过滤 "**Considering..."
      /^Considering\s+user\s+input.*$/gim, // 更精确地匹配 "Considering user input..."
      /^\*\*Thinking.*$/gim, // 过滤 "**Thinking..."
      /^\*\*Processing.*$/gim, // 过滤 "**Processing..."
      /^\*\*Analyzing.*$/gim, // 过滤 "**Analyzing..."
      /^\*\*Evaluating.*$/gim, // 过滤 "**Evaluating..."
      /^\*\*Generating.*$/gim, // 过滤 "**Generating..."
      /^\*\*Formulating.*$/gim, // 过滤 "**Formulating..."
      /^\*\*Crafting.*$/gim, // 过滤 "**Crafting..."
      /^\*\*Creating.*$/gim, // 过滤 "**Creating..."
      /^---+\s*$/gm, // 过滤纯横线分隔符
      /^\s*\.\.\.\s*$/gm, // 过滤省略号行
      /^\s*Loading\.\.\.\s*$/gim, // 过滤 "Loading..."
      /^\s*Please\s+wait\.\.\.\s*$/gim, // 过滤 "Please wait..."
    ];

    let filtered = content;

    // 应用所有过滤模式
    filterPatterns.forEach((pattern) => {
      filtered = filtered.replace(pattern, '');
    });

    // 温和的清理逻辑，保留正常的文本空格
    filtered = filtered
      // 清理只包含空白字符的行
      .replace(/^\s*$/gm, '')
      // 清理多余的连续换行符（超过2个的情况）
      .replace(/\n{3,}/g, '\n\n')
      // 清理多余的连续空行
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      // 清理开头和结尾的空白
      .trim();

    return filtered;
  }

  cleanup() {
    if (this.deltaTimeout) {
      clearTimeout(this.deltaTimeout);
      this.deltaTimeout = null;
    }
  }
}
