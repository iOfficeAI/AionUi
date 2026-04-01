/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { CronMessageMeta } from '@/common/chat/chatLib';
import type { TChatConversation, TProviderWithModel } from '@/common/config/storage';
import type { AcpBackendAll } from '@/common/types/acpTypes';
import { uuid } from '@/common/utils';
import type BaseAgentManager from '@process/task/BaseAgentManager';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import { copyFilesToDirectory } from '@process/utils';
import type { CreateConversationParams } from '@process/services/IConversationService';
import type { AgentType } from '@process/task/agentTypes';
import { ProcessConfig } from '@process/utils/initStorage';
import type { CronBusyGuard } from './CronBusyGuard';
import type { CronJob } from './CronStore';
import type { ICronJobExecutor } from './ICronJobExecutor';
import { getCronSkillDir, hasCronSkillFile } from './cronSkillFile';

/** Lazy-import to break circular dependency: cronServiceSingleton ↔ conversationServiceSingleton */
async function getConversationService() {
  const mod = await import('@process/services/conversationServiceSingleton');
  return mod.conversationServiceSingleton;
}

/** Executes cron jobs by delegating to WorkerTaskManager and tracking busy state via CronBusyGuard. */
export class WorkerTaskManagerJobExecutor implements ICronJobExecutor {
  constructor(
    private readonly taskManager: IWorkerTaskManager,
    private readonly busyGuard: CronBusyGuard
  ) {}

  isConversationBusy(conversationId: string): boolean {
    return this.busyGuard.isProcessing(conversationId);
  }

  async executeJob(job: CronJob, onAcquired?: () => void, preparedConversationId?: string): Promise<string | void> {
    let conversationId = preparedConversationId ?? job.metadata.conversationId;

    // Create a conversation when needed (skip if already prepared):
    // - new_conversation mode: always create a fresh conversation per execution
    // - existing mode with empty conversationId: first execution creates the shared conversation
    if (!preparedConversationId && job.metadata.agentConfig) {
      const needsCreate =
        job.target.executionMode === 'new_conversation' || !conversationId;
      if (needsCreate) {
        const newConv = await this.buildConversationForJob(job);
        conversationId = newConv.id;
      }
    }

    const messageText = await this.buildMessageText(job);
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

    // Hide the prompt message from UI in new_conversation mode
    const hidden = job.target.executionMode === 'new_conversation';

    // ACP/Codex agents use 'content'; Gemini uses 'input'.
    if (task.type === 'codex' || task.type === 'acp') {
      await task.sendMessage({ content: messageText, msg_id: msgId, files: workspaceFiles, cronMeta, hidden });
    } else {
      await task.sendMessage({ input: messageText, msg_id: msgId, files: workspaceFiles, cronMeta, hidden });
    }

    // Return the conversationId used (may differ from job.metadata.conversationId in new_conversation mode)
    return conversationId !== job.metadata.conversationId ? conversationId : undefined;
  }

  /**
   * Build a new conversation for new_conversation execution mode via ConversationServiceImpl.
   * Delegates all workspace init, model setup and DB persistence to the service layer.
   */
  private async buildConversationForJob(job: CronJob): Promise<TChatConversation> {
    const config = job.metadata.agentConfig!;
    const model = await this.resolveModelForBackend(config.backend);
    const convName = `${job.name} - ${this.formatExecutionTimestamp(job)}`;

    const agentType = this.getAgentType(config.backend);

    // Check if a per-task SKILL.md exists (user-saved via "Turn into skill").
    // If yes: inject it into the workspace and exclude the cron builtin skill.
    // If no: execution context is prepended to the prompt in buildMessageText() instead.
    const hasSkill = await hasCronSkillFile(job.id);
    const cronSkillDir = getCronSkillDir(job.id);

    const params: CreateConversationParams = {
      type: agentType,
      name: convName,
      model,
      extra: {
        backend: config.backend,
        agentName: config.name,
        cliPath: config.cliPath,
        customAgentId: config.customAgentId,
        presetAssistantId: config.isPreset ? config.customAgentId : undefined,
        cronJobId: job.id,
        ...(hasSkill
          ? { extraSkillPaths: [cronSkillDir], excludeBuiltinSkills: ['cron'] }
          : { excludeBuiltinSkills: ['cron'] }),
      },
    };

    const service = await getConversationService();
    const conversation = await service.createConversation(params);

    // Notify frontend so sider updates immediately
    ipcBridge.conversation.listChanged.emit({
      conversationId: conversation.id,
      action: 'created',
      source: conversation.source || 'aionui',
    });

    return conversation;
  }

  /**
   * Map backend identifier to the AgentType used by createConversation.
   */
  private getAgentType(backend: AcpBackendAll): AgentType {
    switch (backend) {
      case 'gemini':
        return 'gemini';
      case 'openclaw-gateway':
      case 'openclaw' as AcpBackendAll:
        return 'openclaw-gateway';
      case 'nanobot':
        return 'nanobot';
      case 'remote':
        return 'remote';
      default:
        return 'acp';
    }
  }

  /**
   * Format execution timestamp based on the job's schedule frequency.
   * - Manual / one-shot: full date+time (MM/DD HH:mm)
   * - Minute-level (≤1h): time only (HH:mm:ss)
   * - Hourly (≤24h): date + time (MM/DD HH:mm)
   * - Daily / cron with day granularity: date (MM/DD)
   * - Weekly+: weekday + date (ddd MM/DD)
   */
  private formatExecutionTimestamp(job: CronJob): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const mm = pad(now.getMonth() + 1);
    const dd = pad(now.getDate());
    const hh = pad(now.getHours());
    const mi = pad(now.getMinutes());
    const ss = pad(now.getSeconds());
    const dateStr = `${mm}/${dd}`;
    const timeStr = `${hh}:${mi}`;

    const { schedule } = job;

    if (schedule.kind === 'every') {
      const ms = schedule.everyMs;
      if (ms <= 3600_000) {
        // Minute/hourly interval: show time with seconds
        return `${hh}:${mi}:${ss}`;
      }
      if (ms <= 86400_000) {
        // Sub-daily: date + time
        return `${dateStr} ${timeStr}`;
      }
      // Daily+: just date
      return dateStr;
    }

    if (schedule.kind === 'cron' && schedule.expr) {
      const parts = schedule.expr.trim().split(/\s+/);
      // Standard cron: min hour dom month dow
      // If dom is * and dow is not * → weekly
      if (parts.length >= 5 && parts[4] !== '*') {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return `${days[now.getDay()]} ${dateStr}`;
      }
      // If hour is * → minute-level
      if (parts.length >= 2 && parts[1] === '*') {
        return `${hh}:${mi}:${ss}`;
      }
      // If dom is * → daily, show date + time
      if (parts.length >= 3 && parts[2] === '*') {
        return `${dateStr} ${timeStr}`;
      }
      // Monthly or more: just date
      return dateStr;
    }

    // 'at' (one-shot) or manual trigger: date + time
    return `${dateStr} ${timeStr}`;
  }

  /**
   * Resolve a TProviderWithModel for the given backend from user's configured providers.
   */
  private async resolveModelForBackend(backend: string): Promise<TProviderWithModel> {
    const providers = await ProcessConfig.get('model.config');
    const providerList = (providers && Array.isArray(providers) ? providers : []) as unknown as TProviderWithModel[];

    // For gemini, prefer google-auth provider
    if (backend === 'gemini') {
      const googleAuth = providerList.find((p) => p.platform === 'gemini-with-google-auth' || p.platform === 'gemini');
      if (googleAuth) {
        return { ...googleAuth, useModel: googleAuth.useModel || 'auto' } as TProviderWithModel;
      }
    }

    // For other backends, find a matching provider
    const match = providerList.find((p) => p.platform === backend || p.id === backend);
    if (match) {
      return { ...match, useModel: match.useModel || 'auto' } as TProviderWithModel;
    }

    // Fallback: return first available provider
    if (providerList.length > 0) {
      return { ...providerList[0], useModel: providerList[0].useModel || 'auto' } as TProviderWithModel;
    }

    // Last resort placeholder
    return {
      id: `${backend}-fallback`,
      name: backend,
      useModel: 'auto',
      platform: backend,
      baseUrl: '',
      apiKey: '',
    } as TProviderWithModel;
  }

  /**
   * Build the message text for a cron job execution.
   *
   * For new_conversation mode without a dedicated skill:
   * Prepend execution context directly into the prompt. Workspace skills rely on
   * description matching which is unreliable for arbitrary cron prompts, so we
   * inject the guidance inline instead.
   *
   * For jobs with a dedicated skill or existing conversation mode:
   * Return the raw payload text — the skill or conversation history provides context.
   */
  private async buildMessageText(job: CronJob): Promise<string> {
    const rawText = job.target.payload.text;

    // Only prepend context for new_conversation mode without a dedicated skill
    if (job.target.executionMode !== 'new_conversation') {
      return rawText;
    }

    const hasSkill = await hasCronSkillFile(job.id);
    if (hasSkill) {
      return rawText;
    }

    return buildCronExecutionPrompt(job.name, job.schedule.description, rawText);
  }

  async prepareConversation(job: CronJob): Promise<string> {
    // Create a new conversation when:
    // 1. new_conversation mode: always create per execution
    // 2. existing mode with empty conversationId: initial setup (e.g. created from UI without a conversation)
    const needsNewConversation =
      (job.target.executionMode === 'new_conversation' || !job.metadata.conversationId) && job.metadata.agentConfig;
    if (needsNewConversation) {
      const conv = await this.buildConversationForJob(job);
      return conv.id;
    }
    return job.metadata.conversationId;
  }

  onceIdle(conversationId: string, callback: () => Promise<void>): void {
    this.busyGuard.onceIdle(conversationId, callback);
  }

  setProcessing(conversationId: string, busy: boolean): void {
    this.busyGuard.setProcessing(conversationId, busy);
  }
}

/**
 * Build the full prompt for a scheduled task execution without a dedicated skill.
 * Injects execution context and skill suggestion guidance before the user's raw prompt.
 */
function buildCronExecutionPrompt(taskName: string, scheduleDesc: string, userPrompt: string): string {
  return `[Scheduled Task Context]
Task: ${taskName}
Schedule: ${scheduleDesc}

Rules:
1. Execute the task directly — do NOT ask clarifying questions.
2. Focus on producing useful, actionable output.
3. If the task requires external data (news, weather, etc.), search for the latest information.

This is a recurring scheduled task. After completing the task, always output a skill suggestion
block at the very end of your response to help optimize future executions. The skill should
capture output format, tone, sources, steps, or any patterns that ensure consistency.

Use this exact format:

[SKILL_SUGGEST]
name: skill-name
description: One-line description of what this skill does
content:
---
name: skill-name
description: One-line description
---

(Full SKILL.md body: clear instructions for executing this task, including output format,
sources to check, steps to follow, quality criteria.)
[/SKILL_SUGGEST]
[/Scheduled Task Context]

${userPrompt}`;
}
