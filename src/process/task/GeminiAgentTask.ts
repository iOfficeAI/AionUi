/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chatLib';
import { transformMessage } from '@/common/chatLib';
import type { TModelWithConversation } from '@/common/storage';
import { ProcessConfig } from '@/process/initStorage';
import { addMessage, addOrUpdateMessage, nextTickSync } from '../message';
import BaseAgentTask from './BaseAgentTask';

// gemini agent任务类
export class GeminiAgentTask extends BaseAgentTask<{
  workspace: string;
  model: TModelWithConversation;
}> {
  workspace: string;
  model: TModelWithConversation;
  private bootstrap: Promise<void>;
  constructor(data: { workspace: string; conversation_id: string }, model: TModelWithConversation) {
    super('gemini2', { ...data, model });
    this.workspace = data.workspace;
    this.conversation_id = data.conversation_id;
    this.model = model;
    this.bootstrap = ProcessConfig.get('gemini.config').then((config) => {
      return this.start({
        ...config,
        workspace: this.workspace,
        model: this.model,
      });
    });
  }
  sendMessage(data: { input: string; msg_id: string }) {
    const message: TMessage = {
      id: data.msg_id,
      type: 'text',
      position: 'right',
      conversation_id: this.conversation_id,
      content: {
        content: data.input,
      },
    };
    addMessage(this.conversation_id, message);
    this.status = 'pending';
    return this.bootstrap
      .catch((e) => {
        this.emit('gemini.message', {
          type: 'error',
          data: e.message || JSON.stringify(e),
          msg_id: data.msg_id,
        });
        // 需要同步后才返回结果
        // 为什么需要如此?
        // 在某些情况下，消息需要同步到本地文件中，由于是异步，可能导致前端接受响应和无法获取到最新的消息，因此需要等待同步后再返回
        return new Promise((_, reject) => {
          nextTickSync(() => {
            reject(e);
          });
        });
      })
      .then(() => super.sendMessage(data));
  }
  init() {
    super.init();
    // 接受来子进程的对话消息
    this.on('gemini.message', (data) => {
      if (data.type === 'finish') {
        this.status = 'finished';
      }
      if (data.type === 'start') {
        this.status = 'running';
      }
      ipcBridge.geminiConversation.responseStream.emit({
        ...data,
        conversation_id: this.conversation_id,
      });
      data.conversation_id = this.conversation_id;
      addOrUpdateMessage(this.conversation_id, transformMessage(data));
    });
  }
  // 发送tools用户确认的消息
  async confirmMessage(data: { confirmKey: string; msg_id: string; callId: string }) {
    return this.postMessagePromise(data.callId, data.confirmKey);
  }
}
