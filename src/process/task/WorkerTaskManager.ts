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
import { ProcessConfig } from '@process/utils/initStorage';
import { mainLog } from '@process/utils/mainLogger';

/** Default idle timeout: 5 minutes. Overridden by user config 'acp.agentIdleTimeout' (in minutes). */
const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
/** How often to scan for idle CLI-backed agents. */
const AGENT_IDLE_CHECK_INTERVAL_MS = 1 * 60 * 1000;
/** Minimum configurable idle timeout to prevent too-aggressive cleanup. */
const MIN_IDLE_TIMEOUT_MS = 60 * 1000;

export class WorkerTaskManager implements IWorkerTaskManager {
  private taskList: Array<{ id: string; task: IAgentManager }> = [];
  private idleCheckTimer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly factory: IAgentFactory,
    private readonly repo: IConversationRepository
  ) {
    this.idleCheckTimer = setInterval(() => this.killIdleCliAgents(), AGENT_IDLE_CHECK_INTERVAL_MS);
  }

  private getIdleTimeoutMs(): number {
    try {
      const minutes = ProcessConfig.getSync('acp.agentIdleTimeout');
      if (typeof minutes === 'number' && minutes > 0) {
        return Math.max(MIN_IDLE_TIMEOUT_MS, minutes * 60 * 1000);
      }
    } catch {
      // Fallback to default
    }
    return DEFAULT_IDLE_TIMEOUT_MS;
  }

  private killIdleCliAgents(): void {
    const now = Date.now();
    const timeoutMs = this.getIdleTimeoutMs();
    const idleTasks = this.taskList.filter(
      (item) =>
        (item.task.type === 'acp' || item.task.type === 'aionrs') &&
        !item.task.isTurnInProgress &&
        now - item.task.lastActivityAt > timeoutMs
    );
    for (const item of idleTasks) {
      mainLog('[WorkerTaskManager]', 'Killing idle ACP agent', {
        conversationId: item.id,
        idleForMs: now - item.task.lastActivityAt,
        lastActivityAt: new Date(item.task.lastActivityAt).toISOString(),
      });
      this.kill(item.id, 'idle_timeout');
    }
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
      // Kill the old process before replacing to prevent orphaned child processes.
      // Without this, getOrBuildTask(skipCache: true) leaves the old agent running.
      existing.task.kill();
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
    // Trigger kill on all tasks — kill() returns void but may start async
    // cleanup internally (e.g. AcpAgentManager has a 1.5s hard timeout,
    // and killChild() on Windows uses taskkill with up to 5s timeout).
    for (const item of tasks) {
      try {
        item.task.kill();
      } catch {
        // Ignore errors from individual kills
      }
    }
    // Wait long enough for internal async cleanup to complete
    if (tasks.length > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 5000));
    }
  }

  listTasks(): Array<{ id: string; type: AgentType }> {
    return this.taskList.map((t) => ({ id: t.id, type: t.task.type }));
  }
}
