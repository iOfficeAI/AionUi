/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chatLib';
import { transformMessage } from '@/common/chatLib';
import type { TProviderWithModel } from '@/common/storage';
import { ProcessConfig } from '@/process/initStorage';
import { addMessage, addOrUpdateMessage, nextTickToLocalFinish } from '../message';
import BaseAgentTask from './BaseAgentTask';

// gemini agent管理器类
export class GeminiAgentManager extends BaseAgentTask<{
  workspace: string;
  model: TProviderWithModel;
  imageGenerationModel?: TProviderWithModel;
  webSearchEngine?: 'google' | 'default';
}> {
  workspace: string;
  model: TProviderWithModel;
  private bootstrap: Promise<void>;
  constructor(data: { workspace: string; conversation_id: string; webSearchEngine?: 'google' | 'default' }, model: TProviderWithModel) {
    super('gemini', { ...data, model });
    this.workspace = data.workspace;
    this.conversation_id = data.conversation_id;
    this.model = model;
    this.bootstrap = Promise.all([ProcessConfig.get('gemini.config'), this.getImageGenerationModel()]).then(([config, imageGenerationModel]) => {
      return this.start({
        ...config,
        workspace: this.workspace,
        model: this.model,
        imageGenerationModel,
        webSearchEngine: data.webSearchEngine,
      });
    });
  }
  private async getImageGenerationModel(): Promise<TProviderWithModel | undefined> {
    return ProcessConfig.get('tools.imageGenerationModel')
      .then((imageGenerationModel) => {
        if (imageGenerationModel && imageGenerationModel.switch) {
          return imageGenerationModel;
        }
        return undefined;
      })
      .catch(() => Promise.resolve(undefined));
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
          nextTickToLocalFinish(() => {
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
      const message = transformMessage(data);
      addOrUpdateMessage(this.conversation_id, message);
    });
  }
  // 发送tools用户确认的消息
  async confirmMessage(data: { confirmKey: string; msg_id: string; callId: string }) {
    return this.postMessagePromise(data.callId, data.confirmKey);
  }
}
