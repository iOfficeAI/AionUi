/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CronMessageMeta } from '@/common/chat/chatLib';
import { uuid } from '@/common/utils';
import type { IConversationRepository } from '@process/services/database/IConversationRepository';
import type BaseAgentManager from '@process/task/BaseAgentManager';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import { AssistantHookRuntime } from '@process/bridge/services/AssistantHookRuntime';
import { copyFilesToDirectory } from '@process/utils';
import type { CronBusyGuard } from './CronBusyGuard';
import type { CronJob } from './CronStore';
import type { ICronJobExecutor } from './ICronJobExecutor';

/** Executes cron jobs by delegating to WorkerTaskManager and tracking busy state via CronBusyGuard. */
export class WorkerTaskManagerJobExecutor implements ICronJobExecutor {
  private readonly resolveTaskManager: () => IWorkerTaskManager;

  constructor(
    taskManager: IWorkerTaskManager | (() => IWorkerTaskManager),
    private readonly busyGuard: CronBusyGuard,
    private readonly conversationRepo: IConversationRepository,
    private readonly hookRuntime: Pick<AssistantHookRuntime, 'applyBeforeUserPrompt'> = new AssistantHookRuntime()
  ) {
    this.resolveTaskManager =
      typeof taskManager === 'function' ? (taskManager as () => IWorkerTaskManager) : () => taskManager;
  }

  isConversationBusy(conversationId: string): boolean {
    return this.busyGuard.isProcessing(conversationId);
  }

  async executeJob(job: CronJob, onAcquired?: () => void): Promise<void> {
    const taskManager = this.resolveTaskManager();
    const { conversationId } = job.metadata;
    const messageText = job.target.payload.text;
    const msgId = uuid();
    const conversation = await this.conversationRepo.getConversation(conversationId);

    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    // Reuse existing task if possible; ensure yoloMode is active for scheduled runs.
    const existingTask = taskManager.getTask(conversationId);
    let task;
    if (existingTask) {
      const yoloEnabled = await (existingTask as BaseAgentManager<unknown>).ensureYoloMode();
      if (yoloEnabled) {
        task = existingTask;
      } else {
        // Cannot enable yoloMode dynamically — kill and recreate.
        taskManager.kill(conversationId);
        task = await taskManager.getOrBuildTask(conversationId, { yoloMode: true });
      }
    } else {
      task = await taskManager.getOrBuildTask(conversationId, { yoloMode: true });
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
    const { content: transformedMessage } = await this.hookRuntime.applyBeforeUserPrompt(conversation, messageText);

    // ACP/Codex agents use 'content'; Gemini uses 'input'.
    if (task.type === 'codex' || task.type === 'acp') {
      await task.sendMessage({
        content: messageText,
        agentContent: transformedMessage,
        msg_id: msgId,
        files: workspaceFiles,
        cronMeta,
      });
    } else {
      await task.sendMessage({
        input: messageText,
        agentInput: transformedMessage,
        msg_id: msgId,
        files: workspaceFiles,
        cronMeta,
      });
    }
  }

  onceIdle(conversationId: string, callback: () => Promise<void>): void {
    this.busyGuard.onceIdle(conversationId, callback);
  }

  setProcessing(conversationId: string, busy: boolean): void {
    this.busyGuard.setProcessing(conversationId, busy);
  }
}
