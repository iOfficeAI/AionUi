/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IAgentFactory } from './IAgentFactory';
import type { IAgentManager } from './IAgentManager';
import type { IWorkerTaskManager } from './IWorkerTaskManager';
import type { BuildConversationOptions, AgentType } from './agentTypes';
import type { IConversationRepository } from '@process/services/database/IConversationRepository';
import type { TChatConversation } from '@/common/config/storage';

export class WorkerTaskManager implements IWorkerTaskManager {
  private taskList: Array<{ id: string; task: IAgentManager }> = [];

  constructor(
    private readonly factory: IAgentFactory,
    private readonly repo: IConversationRepository
  ) {}

  getTask(id: string): IAgentManager | undefined {
    return this.taskList.find((item) => item.id === id)?.task;
  }

  async getOrBuildTask(id: string, options?: BuildConversationOptions): Promise<IAgentManager> {
    if (!options?.skipCache) {
      const existing = this.getTask(id);
      if (existing) return existing;
    }

    const conversation = await this.repo.getConversation(id);
    if (conversation) return this._buildAndCache(conversation, options);

    throw new Error(`Conversation not found: ${id}`);
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
