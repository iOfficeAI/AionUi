/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chatLib';
import { transformMessage } from '@/common/chatLib';
import type { IResponseMessage } from '@/common/ipcBridge';
import type { IMcpServer, TProviderWithModel } from '@/common/storage';
import { ProcessConfig } from '@/process/initStorage';
import { getDatabase } from '@process/database';
import { addMessage, addOrUpdateMessage, nextTickToLocalFinish } from '../message';
import BaseAgentManager from './BaseAgentManager';

// gemini agent管理器类
export class GeminiAgentManager extends BaseAgentManager<{
  workspace: string;
  model: TProviderWithModel;
  imageGenerationModel?: TProviderWithModel;
  webSearchEngine?: 'google' | 'default';
  mcpServers?: Record<string, any>;
}> {
  workspace: string;
  model: TProviderWithModel;
  private bootstrap: Promise<void>;

  private async injectHistoryFromDatabase(): Promise<void> {
    try {
      const result = getDatabase().getConversationMessages(this.conversation_id, 0, 10000);
      const data = result.data || [];
      const lines = data
        .filter((m) => m.type === 'text')
        .slice(-20)
        .map((m) => `${m.position === 'right' ? 'User' : 'Assistant'}: ${(m as any)?.content?.content || ''}`);
      const text = lines.join('\n').slice(-4000);
      if (text) {
        await this.postMessagePromise('init.history', { text });
      }
    } catch (e) {
      // ignore history injection errors
    }
  }

  constructor(
    data: {
      workspace: string;
      conversation_id: string;
      webSearchEngine?: 'google' | 'default';
    },
    model: TProviderWithModel
  ) {
    super('gemini', { ...data, model });
    this.workspace = data.workspace;
    this.conversation_id = data.conversation_id;
    this.model = model;
    this.bootstrap = Promise.all([ProcessConfig.get('gemini.config'), this.getImageGenerationModel(), this.getMcpServers()])
      .then(([config, imageGenerationModel, mcpServers]) => {
        return this.start({
          ...config,
          workspace: this.workspace,
          model: this.model,
          imageGenerationModel,
          webSearchEngine: data.webSearchEngine,
          mcpServers,
        });
      })
      .then(async () => {
        await this.injectHistoryFromDatabase();
      });
  }

  private getImageGenerationModel(): Promise<TProviderWithModel | undefined> {
    return ProcessConfig.get('tools.imageGenerationModel')
      .then((imageGenerationModel) => {
        if (imageGenerationModel && imageGenerationModel.switch) {
          return imageGenerationModel;
        }
        return undefined;
      })
      .catch(() => Promise.resolve(undefined));
  }

  private async getMcpServers(): Promise<Record<string, any>> {
    try {
      const mcpServers = await ProcessConfig.get('mcp.config');
      if (!mcpServers || !Array.isArray(mcpServers)) {
        return {};
      }

      // 转换为 aioncli-core 期望的格式
      const mcpConfig: Record<string, any> = {};
      mcpServers
        .filter((server: IMcpServer) => server.enabled && server.status === 'connected') // 只使用启用且连接成功的服务器
        .forEach((server: IMcpServer) => {
          // 只处理 stdio 类型的传输方式，因为 aioncli-core 只支持这种类型
          if (server.transport.type === 'stdio') {
            mcpConfig[server.name] = {
              command: server.transport.command,
              args: server.transport.args || [],
              env: server.transport.env || {},
              description: server.description,
            };
          }
        });

      return mcpConfig;
    } catch (error) {
      return {};
    }
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
      // console.log('gemini.message', data);
      if (data.type === 'finish') {
        this.status = 'finished';
      }
      if (data.type === 'start') {
        this.status = 'running';
      }
      data.conversation_id = this.conversation_id;
      // Transform and persist message (skip transient UI state messages)
      if (data.type !== 'thought') {
        const tMessage = transformMessage(data as IResponseMessage);
        if (tMessage) {
          addOrUpdateMessage(this.conversation_id, tMessage, 'gemini');
        }
      }
      ipcBridge.geminiConversation.responseStream.emit(data);
    });
  }

  // 发送tools用户确认的消息
  confirmMessage(data: { confirmKey: string; msg_id: string; callId: string }) {
    return this.postMessagePromise(data.callId, data.confirmKey);
  }

  // Manually trigger context reload
  async reloadContext(): Promise<void> {
    await this.injectHistoryFromDatabase();
  }
}
