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
    console.log('📝 [CodexMessageProcessor] Processing message delta:', {
      delta: evt.data?.delta,
      requestId: evt.data?._meta?.requestId || evt.data?.requestId,
      currentLoadingId: this.currentLoadingId,
    });

    // 提取requestId来分离不同的消息流
    const requestId = evt.data?._meta?.requestId || evt.data?.requestId;

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
      this.currentContent = fullMessage;
    } else if (typeof rawDelta === 'string' && rawDelta.length) {
      const hasExisting = !!this.currentContent;
      const looksLikeFullReplay = hasExisting && rawDelta.length > this.currentContent.length && rawDelta.startsWith(this.currentContent);
      const isExactRepeat = hasExisting && rawDelta === this.currentContent && rawDelta.length > 1;

      if (looksLikeFullReplay) {
        // Codex 可能把累计内容作为 delta 重新下发，此时覆盖即可
        this.currentContent = rawDelta;
      } else if (!isExactRepeat) {
        // 常规增量场景，安全追加
        this.currentContent += rawDelta;
      }
    }

    // 发送完整累积的内容，使用相同的msg_id确保替换loading
    const deltaMessage = this.createContentMessage(this.currentContent, this.currentLoadingId!);
    if (deltaMessage) {
      console.log('📤 [CodexMessageProcessor] Emitting delta message:', {
        type: deltaMessage.type,
        msg_id: deltaMessage.msg_id,
        conversation_id: deltaMessage.conversation_id,
        contentLength: typeof deltaMessage.data === 'string' ? deltaMessage.data.length : 0,
      });
      // 只通过stream发送，避免重复处理
      ipcBridge.codexConversation.responseStream.emit(deltaMessage);
      console.log('✅ [CodexMessageProcessor] Delta message emitted successfully');
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
    console.log('✅ [CodexMessageProcessor] Processing final message:', {
      message: evt.data?.message,
      requestId: evt.data?._meta?.requestId || evt.data?.requestId,
      currentContent: this.currentContent,
      currentLoadingId: this.currentLoadingId,
    });

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
      console.log('💾 [CodexMessageProcessor] Adding message to conversation:', {
        messageType: message.type,
        conversation_id: this.conversation_id,
        content: typeof message.data === 'string' ? message.data.substring(0, 100) + '...' : message.data,
      });

      // 先保存到后端存储
      const transformedMessage = transformMessage(message);
      if (transformedMessage) {
        addOrUpdateMessage(this.conversation_id, transformedMessage, true);
        console.log('✅ [CodexMessageProcessor] Message saved to storage');
      }

      // 然后发送到前端UI
      console.log('📡 [CodexMessageProcessor] Emitting message to UI');
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
          console.log('✅ [CodexMessageProcessor] Final accumulated message saved to storage');
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
    console.log('🔍 [CodexMessageProcessor] createContentMessage called with:', {
      content: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
      contentLength: content.length,
      trimmed: content.trim().substring(0, 100) + (content.trim().length > 100 ? '...' : ''),
      loadingId,
    });

    if (!content.trim()) {
      console.log('❌ [CodexMessageProcessor] Content is empty after trim, returning null');
      return null;
    }

    // 过滤重复的格式化标记和准备消息
    const filteredContent = this.filterInternalMarkers(content);

    console.log('🔍 [CodexMessageProcessor] After filtering:', {
      originalLength: content.length,
      filteredLength: filteredContent.length,
      filtered: filteredContent.substring(0, 100) + (filteredContent.length > 100 ? '...' : ''),
      willReturnNull: !filteredContent.trim(),
    });

    if (!filteredContent.trim()) {
      console.log('❌ [CodexMessageProcessor] Filtered content is empty, returning null');
      return null;
    }

    return {
      type: 'content', // Use standard content type instead of ai_content
      conversation_id: this.conversation_id,
      msg_id: loadingId,
      data: filteredContent, // 使用过滤后的内容
    };
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

    // 清理多余的空行（超过2个连续换行的情况）
    filtered = filtered.replace(/\n{3,}/g, '\n\n');

    // 清理开头和结尾的空白
    filtered = filtered.trim();

    console.log('🧹 [CodexMessageProcessor] Content filtering:', {
      original: content.substring(0, 100) + '...',
      filtered: filtered.substring(0, 100) + '...',
      hasChanges: content !== filtered,
    });

    return filtered;
  }

  cleanup() {
    if (this.deltaTimeout) {
      clearTimeout(this.deltaTimeout);
      this.deltaTimeout = null;
    }
  }
}
