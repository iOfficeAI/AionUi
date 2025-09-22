/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { transformMessage } from '@/common/chatLib';
import type { IResponseMessage } from '@/common/ipcBridge';
import { uuid } from '@/common/utils';
import type { CodexAgentEventType, CodexAgentEvent } from '@/common/codexTypes';
import { addOrUpdateMessage } from '../../message';

export class CodexMessageProcessor {
  private currentLoadingId: string | null = null;
  private currentContent: string = '';
  private deltaTimeout: NodeJS.Timeout | null = null;

  constructor(private conversation_id: string) {}

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
      ipcBridge.codexConversation.responseStream.emit(deltaMessage);
    }

    // Set/reset timeout to auto-finalize message if no completion event is received
    if (this.deltaTimeout) {
      clearTimeout(this.deltaTimeout);
    }
    this.deltaTimeout = setTimeout(() => {
      if (this.currentContent && this.currentContent.trim() && this.currentLoadingId) {
        // Send finish signal to UI - but don't pass through transformMessage as it's internal
        const finishMessage: IResponseMessage = {
          type: 'finish',
          conversation_id: this.conversation_id,
          msg_id: this.currentLoadingId,
          data: {},
        };
        ipcBridge.codexConversation.responseStream.emit(finishMessage);
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
      // 先保存到后端存储
      const transformedMessage = transformMessage(message);
      if (transformedMessage) {
        addOrUpdateMessage(this.conversation_id, transformedMessage, true);
      }

      // 然后发送到前端UI
      ipcBridge.codexConversation.responseStream.emit(message);
    } else {
      console.warn('⚠️ [CodexMessageProcessor] createContentMessage returned null');
    }
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
        // 先保存到后端存储
        const transformedMessage = transformMessage(message);
        if (transformedMessage) {
          addOrUpdateMessage(this.conversation_id, transformedMessage, true);
        }

        // 然后发送到前端UI
        ipcBridge.codexConversation.responseStream.emit(message);
      }
    }

    // Send finish signal to UI - but don't pass through transformMessage as it's internal
    const finishMessage: IResponseMessage = {
      type: 'finish',
      conversation_id: this.conversation_id,
      msg_id: this.currentLoadingId || uuid(),
      data: {},
    };
    ipcBridge.codexConversation.responseStream.emit(finishMessage);

    // 延迟重置，确保所有消息都使用同一个ID
    setTimeout(() => {
      this.currentLoadingId = null;
      this.currentContent = '';
    }, 100);
  }

  processStreamError(evt: Extract<CodexAgentEvent, { type: CodexAgentEventType.STREAM_ERROR }>) {
    const errMsg: IResponseMessage = {
      type: 'error',
      conversation_id: this.conversation_id,
      msg_id: uuid(),
      data: evt.data?.message || 'Codex stream error',
    };
    // 只通过stream发送，避免重复处理
    ipcBridge.codexConversation.responseStream.emit(errMsg);
  }

  private createContentMessage(content: string, loadingId: string): IResponseMessage | null {
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
      type: 'content', // Use standard content type instead of ai_content
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
        // 清理开头和结尾的空白
        .trim()
    );
  }

  private filterInternalMarkers(content: string): string {
    // 定义需要过滤的模式
    const filterPatterns = [
      /^\*\*[Pp]reparing.*$/gim, // 过滤所有 "**Preparing..." 变体（包括 preparingfriendlyresponse）
      /^[Pp]reparing\s+.*$/gim, // 过滤 "Preparing ..." 变体
      /^\*\*[Cc]onsidering.*$/gim, // 过滤所有 "**Considering..." 变体
      /^[Cc]onsidering\s+.*$/gim, // 过滤 "Considering ..." 变体
      /^\*\*[Tt]hinking.*$/gim, // 过滤 "**Thinking..."
      /^\*\*[Pp]rocessing.*$/gim, // 过滤 "**Processing..."
      /^\*\*[Aa]nalyzing.*$/gim, // 过滤 "**Analyzing..."
      /^\*\*[Ee]valuating.*$/gim, // 过滤 "**Evaluating..."
      /^\*\*[Gg]enerating.*$/gim, // 过滤 "**Generating..."
      /^\*\*[Ff]ormulating.*$/gim, // 过滤 "**Formulating..."
      /^\*\*[Cc]rafting.*$/gim, // 过滤 "**Crafting..."
      /^\*\*[Cc]reating.*$/gim, // 过滤 "**Creating..."
      /^---+\s*$/gm, // 过滤纯横线分隔符
      /^\s*\.\.\.\s*$/gm, // 过滤省略号行
      /^\s*Loading\.\.\.\s*$/gim, // 过滤 "Loading..."
      /^\s*Please\s+wait\.\.\.\s*$/gim, // 过滤 "Please wait..."
      /^\*\*\w+ing\w*\s*$/gim, // 过滤所有以 "**" 开头的动词进行时形式
      /^[A-Z][a-z]+ing\s+.*ambiguity.*$/gim, // 过滤类似 "Considering user input ambiguity" 的文本
      /^[A-Z][a-z]+ing\s+.*input.*$/gim, // 过滤包含 "input" 的思考过程文本
    ];

    let filtered = content;

    // 应用所有过滤模式
    filterPatterns.forEach((pattern) => {
      filtered = filtered.replace(pattern, '');
    });

    // 更强的换行和空行清理逻辑
    filtered = filtered
      // 清理只包含空白字符的行
      .replace(/^\s*$/gm, '')
      // 清理多余的连续换行符（超过1个的情况，更严格）
      .replace(/\n{2,}/g, '\n')
      // 清理行首和行尾的空白字符
      .replace(/[ \t]+$/gm, '')
      .replace(/^[ \t]+/gm, '')
      // 再次清理可能产生的连续空行
      .replace(/\n\s*\n/g, '\n')
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
