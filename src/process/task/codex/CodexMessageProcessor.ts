/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/ipcBridge';
import { transformMessage } from '@/common/chatLib';
import { uuid } from '@/common/utils';
import { addOrUpdateMessage } from '../../message';
import type { CodexAgentEventType, CodexAgentEvent } from '@/common/codexTypes';

export class CodexMessageProcessor {
  private currentLoadingId: string | null = null;
  private currentContent: string = '';
  private currentRequestId: number | null = null;
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

    // 如果这是新的请求，重置累积状态
    if (requestId !== this.currentRequestId || !this.currentLoadingId) {
      // Clear any existing timeout
      if (this.deltaTimeout) {
        clearTimeout(this.deltaTimeout);
        this.deltaTimeout = null;
      }

      this.currentLoadingId = uuid();
      this.currentContent = ''; // 重置累积内容
      this.currentRequestId = requestId;
    }

    // 累积delta内容
    const delta = evt.data?.delta || evt.data?.message || '';
    this.currentContent += delta;

    // 发送完整累积的内容，使用相同的msg_id确保替换loading
    const deltaMessage = this.createContentMessage(this.currentContent, this.currentLoadingId!);
    if (deltaMessage) {
      addOrUpdateMessage(this.conversation_id, transformMessage(deltaMessage));
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
      this.currentRequestId = null;
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

    // 提取requestId确保与对应的delta消息关联
    const requestId = evt.data?._meta?.requestId || evt.data?.requestId;

    // 如果没有当前loading ID或requestId不匹配，创建新的
    if (requestId !== this.currentRequestId || !this.currentLoadingId) {
      this.currentLoadingId = uuid();
      this.currentRequestId = requestId;
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

      const transformedMessage = transformMessage(message);
      if (transformedMessage) {
        addOrUpdateMessage(this.conversation_id, transformedMessage);
        console.log('📡 [CodexMessageProcessor] Emitting message to UI');
      } else {
        console.warn('⚠️ [CodexMessageProcessor] transformMessage returned undefined');
      }
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
        addOrUpdateMessage(this.conversation_id, transformMessage(message));
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
    addOrUpdateMessage(this.conversation_id, transformMessage(errMsg));
    ipcBridge.codexConversation.responseStream.emit(errMsg);
  }

  private createContentMessage(content: string, loadingId: string): IResponseMessage | null {
    if (!content.trim()) return null;

    return {
      type: 'content', // Use standard content type instead of ai_content
      conversation_id: this.conversation_id,
      msg_id: loadingId,
      data: content, // Simplified data format for standard content type
    };
  }

  cleanup() {
    if (this.deltaTimeout) {
      clearTimeout(this.deltaTimeout);
      this.deltaTimeout = null;
    }
  }
}
