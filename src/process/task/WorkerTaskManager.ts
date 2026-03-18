/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IAgentFactory } from './IAgentFactory';
import type { IAgentManager } from './IAgentManager';
import type { IWorkerTaskManager } from './IWorkerTaskManager';
import type { BuildConversationOptions, AgentType } from './agentTypes';
import { getDatabase } from '@process/database/export';
import { ProcessChat } from '@process/initStorage';
import type { TChatConversation } from '@/common/storage';

export class WorkerTaskManager implements IWorkerTaskManager {
  private taskList: Array<{ id: string; task: IAgentManager }> = [];

  constructor(private readonly factory: IAgentFactory) {}

  getTask(id: string): IAgentManager | undefined {
    return this.taskList.find((item) => item.id === id)?.task;
  }

  async getOrBuildTask(id: string, options?: BuildConversationOptions): Promise<IAgentManager> {
    if (!options?.skipCache) {
      const existing = this.getTask(id);
      if (existing) return existing;
    }

    const db = getDatabase();
    const dbResult = db.getConversation(id);
    if (dbResult.success && dbResult.data) {
      return this._buildAndCache(dbResult.data, options);
    }

    const list = (await ProcessChat.get('chat.history')) as TChatConversation[] | undefined;
    const conversation = list?.find((item) => item.id === id);
    if (conversation) return this._buildAndCache(conversation, options);

    return Promise.reject(new Error(`Conversation not found: ${id}`));
  }

  private _buildAndCache(conversation: TChatConversation, options?: BuildConversationOptions): IAgentManager {
    const task = this.factory.create(conversation, options);
    if (!options?.skipCache) {
      this.taskList.push({ id: conversation.id, task });
    }
    return task;
  }

  addTask(id: string, task: IAgentManager): void {
    const existing = this.taskList.find((item) => item.id === id);
    if (existing) {
      existing.task = task;
    } else {
      this.taskList.push({ id, task });
    }
  }

  kill(id: string): void {
    const index = this.taskList.findIndex((item) => item.id === id);
    if (index === -1) return;
    this.taskList[index]?.task.kill();
    this.taskList.splice(index, 1);
  }

  clear(): void {
    this.taskList.forEach((item) => item.task.kill());
    this.taskList = [];
  }

  listTasks(): Array<{ id: string; type: AgentType }> {
    return this.taskList.map((t) => ({ id: t.id, type: t.task.type }));
  }
}
