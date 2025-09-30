/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chatLib';
import { transformMessage } from '@/common/chatLib';
import type { TProviderWithModel, IMcpServer } from '@/common/storage';
import { ProcessConfig } from '@/process/initStorage';
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
  constructor(data: { workspace: string; conversation_id: string; webSearchEngine?: 'google' | 'default' }, model: TProviderWithModel) {
    super('gemini', { ...data, model });
    this.workspace = data.workspace;
    this.conversation_id = data.conversation_id;
    this.model = model;
    this.bootstrap = Promise.all([ProcessConfig.get('gemini.config'), this.getImageGenerationModel(), this.getMcpServers()]).then(([config, imageGenerationModel, mcpServers]) => {
      console.log('gemini.config.bootstrap', config, imageGenerationModel);
      return this.start({
        ...config,
        workspace: this.workspace,
        model: this.model,
        imageGenerationModel,
        webSearchEngine: data.webSearchEngine,
        mcpServers,
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

      console.log('[GeminiAgentManager] Loaded MCP servers:', Object.keys(mcpConfig));
      return mcpConfig;
    } catch (error) {
      console.warn('[GeminiAgentManager] Failed to load MCP servers:', error);
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
  getWorkspace() {
    return this.bootstrap.then(() => this.postMessagePromise('gemini.get.workspace', {}));
  }
}
