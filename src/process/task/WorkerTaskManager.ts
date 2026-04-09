/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IAgentFactory } from './IAgentFactory';
import type { AgentKillReason, IAgentManager } from './IAgentManager';
import type { IWorkerTaskManager } from './IWorkerTaskManager';
import type { BuildConversationOptions, AgentType } from './agentTypes';
import type { IConversationRepository } from '@process/services/database/IConversationRepository';
import type { TChatConversation } from '@/common/config/storage';
import { cronBusyGuard } from '@process/services/cron/CronBusyGuard';
import { ProcessConfig } from '@process/utils/initStorage';

/** Default idle timeout: 5 minutes. Overridden by user config 'acp.agentIdleTimeout' (in minutes). */
const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
/** How often to scan for idle CLI-backed agents. */
const AGENT_IDLE_CHECK_INTERVAL_MS = 1 * 60 * 1000;

export class WorkerTaskManager implements IWorkerTaskManager {
  private taskList: Array<{ id: string; task: IAgentManager }> = [];
  private idleCheckTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly factory: IAgentFactory,
    private readonly repo: IConversationRepository
  ) {
    this.idleCheckTimer = setInterval(() => this.killIdleCliAgents(), AGENT_IDLE_CHECK_INTERVAL_MS);
  }

  private async getIdleTimeoutMs(): Promise<number> {
    try {
      const minutes = await ProcessConfig.get('acp.agentIdleTimeout');
      if (minutes && minutes > 0) return minutes * 60 * 1000;
    } catch {
      // Fallback to default
    }
    return DEFAULT_IDLE_TIMEOUT_MS;
  }

  private killIdleCliAgents(): void {
    void this.getIdleTimeoutMs().then((timeoutMs) => {
      const now = Date.now();
      const idleTasks = this.taskList.filter(
        (item) =>
          item.task.type === 'acp' &&
          item.task.status === 'finished' &&
          !cronBusyGuard.isProcessing(item.id) &&
          now - item.task.lastActivityAt > timeoutMs
      );
      for (const item of idleTasks) {
        this.kill(item.id, 'idle_timeout');
      }
    });
  }

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
    this.addTask(conversation.id, task);
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

  kill(id: string, reason?: AgentKillReason): void {
    const index = this.taskList.findIndex((item) => item.id === id);
    if (index === -1) return;
    this.taskList[index]?.task.kill(reason);
    this.taskList.splice(index, 1);
  }

  async clear(): Promise<void> {
    clearInterval(this.idleCheckTimer);
    this.idleCheckTimer = undefined;
    const tasks = [...this.taskList];
    this.taskList = [];
    // Kill all tasks and wait briefly for processes to actually exit
    tasks.forEach((item) => item.task.kill());
    // Allow up to 3 seconds for graceful shutdown before returning
    await new Promise<void>((resolve) => setTimeout(resolve, 3000));
  }

  listTasks(): Array<{ id: string; type: AgentType }> {
    return this.taskList.map((t) => ({ id: t.id, type: t.task.type }));
  }
}
