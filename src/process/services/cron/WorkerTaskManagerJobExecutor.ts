/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs/promises';
import path from 'path';
import { ipcBridge } from '@/common';
import type { CronMessageMeta } from '@/common/chat/chatLib';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
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

    // Check if we need to detect SKILL_SUGGEST.md after agent finishes.
    // Only needed when no per-task skill exists yet (first execution).
    const needsSkillDetection =
      job.target.executionMode === 'new_conversation' && !!workspace && !(await hasCronSkillFile(job.id));

    // ACP/Codex agents use 'content'; Gemini uses 'input'.
    if (task.type === 'codex' || task.type === 'acp') {
      await task.sendMessage({ content: messageText, msg_id: msgId, files: workspaceFiles, cronMeta, hidden });
    } else {
      await task.sendMessage({ input: messageText, msg_id: msgId, files: workspaceFiles, cronMeta, hidden });
    }

    // Detect SKILL_SUGGEST.md with retries. sendMessage resolves when the message is
    // delivered to the worker, NOT when the agent finishes. The agent may still be
    // processing tool calls (e.g. write_file for SKILL_SUGGEST.md). Poll with retries
    // to catch the file once the agent truly finishes.
    if (needsSkillDetection) {
      void this.detectSkillSuggestWithRetry(job.id, workspace!, conversationId, 0);
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
    // If yes: inject it into the workspace and exclude both cron and cron-run builtin skills.
    // If no: cron-run builtin skill provides execution context and SKILL_SUGGEST guidance.
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
   * - Has dedicated skill: remind the agent to follow its workspace skill instructions.
   * - No dedicated skill: inject full execution context with SKILL_SUGGEST guidance.
   * - existing mode: return raw payload (conversation history provides context).
   */
  private async buildMessageText(job: CronJob): Promise<string> {
    const rawText = job.target.payload.text;

    if (job.target.executionMode !== 'new_conversation') {
      return rawText;
    }

    const hasSkill = await hasCronSkillFile(job.id);
    if (hasSkill) {
      return buildCronSkillExecutionPrompt(job.name, rawText);
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

  /** Max retries for detecting SKILL_SUGGEST.md (agent may still be writing it). */
  private static readonly SKILL_DETECT_MAX_RETRIES = 10;
  private static readonly SKILL_DETECT_INTERVAL_MS = 3000;

  /**
   * Poll for SKILL_SUGGEST.md with retries. The agent writes this file as part of its
   * turn, but sendMessage resolves before the turn completes. Retry until the file
   * appears or we exhaust attempts.
   */
  private detectSkillSuggestWithRetry(jobId: string, workspace: string, conversationId: string, attempt: number): void {
    const filePath = path.join(workspace, SKILL_SUGGEST_FILENAME);

    fs.readFile(filePath, 'utf-8')
      .then(async (content) => {
        if (!content?.trim()) {
          throw Object.assign(new Error('empty'), { code: 'EMPTY' });
        }

        console.log(`[CronExecutor] Found ${SKILL_SUGGEST_FILENAME} (${content.length} chars) for job ${jobId} on attempt ${attempt + 1}`);
        const { validateSkillContent } = await import('./cronSkillFile');
        const validated = validateSkillContent(content);
        if (!validated) {
          console.warn(`[CronExecutor] ${SKILL_SUGGEST_FILENAME} validation failed for job ${jobId}`);
          return;
        }

        // Emit a skill_suggest message to frontend (not persisted to DB).
        // Only visible if the user currently has this conversation open.
        const message: IResponseMessage = {
          type: 'skill_suggest',
          conversation_id: conversationId,
          msg_id: uuid(),
          data: {
            cronJobId: jobId,
            name: validated.name,
            description: validated.description,
            skillContent: content,
          },
        };

        // Emit on both the generic and OpenClaw-specific streams so that
        // the frontend hook picks it up regardless of platform.
        ipcBridge.conversation.responseStream.emit(message);
        ipcBridge.openclawConversation.responseStream.emit(message);
        console.log(`[CronExecutor] Emitted skill_suggest message for job ${jobId}, conversation ${conversationId}`);
      })
      .catch((err) => {
        // File not found or empty — retry if attempts remain
        if (attempt < WorkerTaskManagerJobExecutor.SKILL_DETECT_MAX_RETRIES) {
          setTimeout(() => {
            this.detectSkillSuggestWithRetry(jobId, workspace, conversationId, attempt + 1);
          }, WorkerTaskManagerJobExecutor.SKILL_DETECT_INTERVAL_MS);
        }
        // Only log unexpected errors (not ENOENT/EMPTY which are expected during retries)
        if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT' && (err as { code?: string })?.code !== 'EMPTY') {
          console.warn(`[CronExecutor] Error detecting ${SKILL_SUGGEST_FILENAME} for job ${jobId}:`, err);
        }
      });
  }

  onceIdle(conversationId: string, callback: () => Promise<void>): void {
    this.busyGuard.onceIdle(conversationId, callback);
  }

  setProcessing(conversationId: string, busy: boolean): void {
    this.busyGuard.setProcessing(conversationId, busy);
  }
}

/** The fixed filename agents write skill suggestions to in the workspace root. */
export const SKILL_SUGGEST_FILENAME = 'SKILL_SUGGEST.md';

/**
 * Build the full prompt for a scheduled task execution without a dedicated skill.
 * Instructs the agent to write a SKILL_SUGGEST.md file in the workspace instead of
 * outputting skill suggestion tags in the response body.
 */
function buildCronExecutionPrompt(taskName: string, scheduleDesc: string, userPrompt: string): string {
  return `[Scheduled Task Context]
Task: ${taskName}
Schedule: ${scheduleDesc}

Rules:
1. Execute the task directly — do NOT ask clarifying questions.
2. Focus on producing useful, actionable output.
3. If the task requires external data (news, weather, etc.), search for the latest information.

IMPORTANT — Skill suggestion (do NOT output this in your response):
This is a recurring scheduled task. After completing the task, silently write a file named
"${SKILL_SUGGEST_FILENAME}" in the current working directory. This file captures the execution
pattern so future runs stay consistent. Do NOT mention this file or its content in your response.

The file must be a valid SKILL.md with YAML frontmatter. Example structure:
---
name: <short kebab-case name, e.g. daily-greeting>
description: <one-line description of what this task does>
---

<Full instructions: output format, tone, sources to check, steps to follow, quality criteria.>

Replace ALL placeholders with real content specific to this task "${taskName}".
[/Scheduled Task Context]

${userPrompt}`;
}

/**
 * Build the prompt for a scheduled task execution that has a dedicated skill.
 * Reminds the agent to follow the skill instructions in its workspace.
 */
function buildCronSkillExecutionPrompt(taskName: string, userPrompt: string): string {
  return `[Scheduled Task Context]
Task: ${taskName}

This is a scheduled task execution. A skill file with detailed instructions has been loaded
into your workspace. You MUST read and follow the skill instructions precisely.

Rules:
1. Execute the task directly — do NOT ask clarifying questions.
2. Follow the output format, tone, sources, and steps defined in the skill.
3. If the task requires external data (news, weather, etc.), search for the latest information.
[/Scheduled Task Context]

${userPrompt}`;
}
