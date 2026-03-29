/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CronMessageMeta } from '@/common/chat/chatLib';
import { uuid } from '@/common/utils';
import type BaseAgentManager from '@process/task/BaseAgentManager';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import { copyFilesToDirectory } from '@process/utils';
import type { CronBusyGuard } from './CronBusyGuard';
import type { CronJob } from './CronStore';
import type { ICronJobExecutor } from './ICronJobExecutor';

/** Executes cron jobs by delegating to WorkerTaskManager and tracking busy state via CronBusyGuard. */
export class WorkerTaskManagerJobExecutor implements ICronJobExecutor {
  constructor(
    private readonly taskManager: IWorkerTaskManager,
    private readonly busyGuard: CronBusyGuard
  ) {}

  isConversationBusy(conversationId: string): boolean {
    return this.busyGuard.isProcessing(conversationId);
  }

  async executeJob(job: CronJob, onAcquired?: () => void): Promise<void> {
    const { conversationId } = job.metadata;
    const messageText = job.target.payload.text;
    const msgId = uuid();

    // Reuse existing task if possible; ensure yoloMode is active for scheduled runs.
    const existingTask = this.taskManager.getTask(conversationId);
    let task;
    try {
      if (existingTask) {
        const yoloEnabled = await (existingTask as BaseAgentManager<unknown>).ensureYoloMode();
        if (yoloEnabled) {
          task = existingTask;
        } else {
          // Cannot enable yoloMode dynamically — kill and recreate.
          this.taskManager.kill(conversationId);
          task = await this.taskManager.getOrBuildTask(conversationId, { yoloMode: true });
        }
      } else {
        task = await this.taskManager.getOrBuildTask(conversationId, { yoloMode: true });
      }
    } catch (err) {
      // Conversation may have been deleted between scheduling and execution.
      // Re-throw with context so the caller (CronService) can log and update job state.
      throw new Error(
        `Failed to acquire task for conversation ${conversationId}: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err }
      );
    }

    // Mark busy only after task acquisition succeeds. This ensures that if
    // getOrBuildTask throws (conversation deleted), setProcessing(true) is never
    // called and no "busy" state leaks into subsequent runs.
    this.busyGuard.setProcessing(conversationId, true);
    // Notify caller so it can register onceIdle callbacks while the conversation
    // is already marked busy (prevents premature idle fires).
    onAcquired?.();

    const workspace = (task as { workspace?: string }).workspace;
    const workspaceFiles = workspace ? await copyFilesToDirectory(workspace, [], false) : [];

    const cronMeta: CronMessageMeta = {
      source: 'cron',
      cronJobId: job.id,
      cronJobName: job.name,
      triggeredAt: Date.now(),
    };

    // ACP/Codex agents use 'content'; Gemini uses 'input'.
    if (task.type === 'codex' || task.type === 'acp') {
      await task.sendMessage({ content: messageText, msg_id: msgId, files: workspaceFiles, cronMeta });
    } else {
      await task.sendMessage({ input: messageText, msg_id: msgId, files: workspaceFiles, cronMeta });
    }
  }

  onceIdle(conversationId: string, callback: () => Promise<void>): void {
    this.busyGuard.onceIdle(conversationId, callback);
  }

  setProcessing(conversationId: string, busy: boolean): void {
    this.busyGuard.setProcessing(conversationId, busy);
  }
}
