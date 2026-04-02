/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { ipcBridge } from '@/common';
import type { CronMessageMeta, TMessage } from '@/common/chat/chatLib';
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
import { addMessage } from '@process/utils/message';
import { getCronSkillDir, hasCronSkillFile } from './cronSkillFile';
import { skillSuggestWatcher } from './SkillSuggestWatcher';

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
    // - existing mode with deleted conversation: recreate to avoid "not found" errors
    if (!preparedConversationId && job.metadata.agentConfig) {
      let needsCreate = job.target.executionMode === 'new_conversation' || !conversationId;

      // For existing mode, verify the conversation still exists (may have been deleted by user)
      if (!needsCreate && conversationId) {
        const convService = await getConversationService();
        const exists = await convService.getConversation(conversationId);
        if (!exists) {
          needsCreate = true;
        }
      }

      if (needsCreate) {
        const newConv = await this.buildConversationForJob(job);
        conversationId = newConv.id;
      }
    }

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

    const hasSkill = await hasCronSkillFile(job.id);
    const needsSkillSuggest = job.target.executionMode === 'new_conversation' && !!workspace && !hasSkill;
    const isGemini = job.metadata.agentConfig?.backend === 'gemini';

    // Gemini: inline SKILL_SUGGEST instructions in the task prompt (single-turn).
    // Other agents: separate follow-up message via onFirstFinish (multi-turn).
    const messageText = this.buildMessageText(job, hasSkill, needsSkillSuggest && isGemini);

    const triggeredAt = Date.now();
    const cronMeta: CronMessageMeta = {
      source: 'cron',
      cronJobId: job.id,
      cronJobName: job.name,
      triggeredAt,
    };

    // Always hide cron prompt messages from UI — a cron_trigger card replaces them.
    const hidden = true;

    // Emit and persist a cron_trigger message so users see a clickable card
    // linking back to the scheduled task detail page.
    this.emitCronTriggerMessage(conversationId, job.id, job.name, triggeredAt);

    // Pass both content and input — each agent type picks the field it uses.
    await task.sendMessage({
      content: messageText,
      input: messageText,
      msg_id: msgId,
      files: workspaceFiles,
      cronMeta,
      hidden,
    });

    if (needsSkillSuggest) {
      // Defensively unregister first in case a previous execution left a stale entry
      skillSuggestWatcher.unregister(conversationId);

      if (isGemini) {
        // Gemini: SKILL_SUGGEST instructions are already in the prompt.
        // Just register the watcher (no onFirstFinish) and start polling.
        skillSuggestWatcher.register(conversationId, job.id, workspace!);
        void this.detectSkillSuggestWithRetry(job.id, workspace!, conversationId, 0);
      } else {
        // Other agents: send a follow-up message after the first finish event.
        skillSuggestWatcher.register(conversationId, job.id, workspace!, async () => {
          await this.sendSkillSuggestRequest(task, job, conversationId, workspace!);
        });
      }
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
  /**
   * Build the message text for a cron job execution.
   *
   * @param job - The cron job to build the message for.
   * @param includeSkillSuggest - Whether to include SKILL_SUGGEST.md writing instructions.
   *   Pre-computed by the caller so the same condition drives both prompt and detection.
   */
  private buildMessageText(job: CronJob, hasSkill: boolean, inlineSkillSuggest: boolean): string {
    const rawText = job.target.payload.text;

    if (job.target.executionMode !== 'new_conversation') {
      return buildExistingConvPrompt(job.name, job.schedule.description, rawText);
    }

    if (hasSkill) {
      return buildNewConvWithSkillPrompt(job.name, rawText);
    }

    if (inlineSkillSuggest) {
      return buildNewConvPromptWithSkillSuggest(job.name, job.schedule.description, rawText);
    }

    return buildNewConvPrompt(job.name, job.schedule.description, rawText);
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

  /**
   * Send a follow-up hidden message asking the agent to write SKILL_SUGGEST.md,
   * then start polling for the file.
   */
  private async sendSkillSuggestRequest(
    task: { type: string; sendMessage: (data: unknown) => Promise<void> },
    job: CronJob,
    conversationId: string,
    workspace: string
  ): Promise<void> {
    const msgId = uuid();
    const prompt = buildSkillSuggestPrompt(job.name);

    try {
      // Pass both content and input — each agent type picks the field it uses.
      await task.sendMessage({ content: prompt, input: prompt, msg_id: msgId, hidden: true });
    } catch (err) {
      console.warn(`[CronExecutor] Failed to send SKILL_SUGGEST request for job ${job.id}:`, err);
      return;
    }

    void this.detectSkillSuggestWithRetry(job.id, workspace, conversationId, 0);
  }

  /** Max retries for initial SKILL_SUGGEST.md detection (agent may still be writing it). */
  private static readonly SKILL_DETECT_MAX_RETRIES = 10;
  private static readonly SKILL_DETECT_INTERVAL_MS = 3000;

  /**
   * Poll for SKILL_SUGGEST.md with retries, then register the conversation
   * with the singleton SkillSuggestWatcher for ongoing monitoring.
   * Subsequent detection happens via AgentManager finish handlers calling
   * `skillSuggestWatcher.onFinish()`.
   */
  private detectSkillSuggestWithRetry(jobId: string, workspace: string, conversationId: string, attempt: number): void {
    const filePath = path.join(workspace, SKILL_SUGGEST_FILENAME);

    fs.readFile(filePath, 'utf-8')
      .then(async (content) => {
        if (!content?.trim()) {
          throw Object.assign(new Error('empty'), { code: 'EMPTY' });
        }

        console.log(
          `[CronExecutor] Found ${SKILL_SUGGEST_FILENAME} (${content.length} chars) for job ${jobId} on attempt ${attempt + 1}`
        );

        // Register for ongoing monitoring and set the initial hash
        skillSuggestWatcher.register(conversationId, jobId, workspace);
        const hash = contentHash(content);

        // Skip if SkillSuggestWatcher.checkAndEmit already processed this content
        if (skillSuggestWatcher.getLastHash(conversationId) === hash) {
          return;
        }
        skillSuggestWatcher.setLastHash(conversationId, hash);

        // Emit the initial detection
        await this.emitSkillSuggestInitial(jobId, conversationId, content);
      })
      .catch((err) => {
        // File not found or empty — retry if attempts remain
        if (attempt < WorkerTaskManagerJobExecutor.SKILL_DETECT_MAX_RETRIES) {
          setTimeout(() => {
            this.detectSkillSuggestWithRetry(jobId, workspace, conversationId, attempt + 1);
          }, WorkerTaskManagerJobExecutor.SKILL_DETECT_INTERVAL_MS);
        } else {
          // Exhausted retries — register anyway in case the user asks AI to write it later
          skillSuggestWatcher.register(conversationId, jobId, workspace);
          console.log(
            `[CronExecutor] Registered watcher for job ${jobId} (file not found after ${attempt + 1} retries)`
          );
        }
        // Only log unexpected errors (not ENOENT/EMPTY which are expected during retries)
        if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT' && (err as { code?: string })?.code !== 'EMPTY') {
          console.warn(`[CronExecutor] Error detecting ${SKILL_SUGGEST_FILENAME} for job ${jobId}:`, err);
        }
      });
  }

  /**
   * Emit the initial skill_suggest message when SKILL_SUGGEST.md is first found.
   */
  private async emitSkillSuggestInitial(jobId: string, conversationId: string, content: string): Promise<void> {
    if (await hasCronSkillFile(jobId)) {
      skillSuggestWatcher.unregister(conversationId);
      return;
    }

    const { validateSkillContent } = await import('./cronSkillFile');
    const validated = validateSkillContent(content);
    if (!validated) {
      console.warn(`[CronExecutor] ${SKILL_SUGGEST_FILENAME} validation failed for job ${jobId}`);
      return;
    }

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

    ipcBridge.conversation.responseStream.emit(message);
    ipcBridge.geminiConversation.responseStream.emit(message);
    ipcBridge.acpConversation.responseStream.emit(message);
    ipcBridge.openclawConversation.responseStream.emit(message);
    console.log(`[CronExecutor] Emitted initial skill_suggest for job ${jobId}, conversation ${conversationId}`);
  }

  /**
   * Emit and persist a cron_trigger message so the frontend renders a clickable
   * card linking to the scheduled task detail page.
   */
  private emitCronTriggerMessage(
    conversationId: string,
    cronJobId: string,
    cronJobName: string,
    triggeredAt: number
  ): void {
    const msgId = uuid();
    const triggerMessage: TMessage = {
      id: msgId,
      msg_id: msgId,
      type: 'cron_trigger',
      position: 'center',
      conversation_id: conversationId,
      content: { cronJobId, cronJobName, triggeredAt },
      createdAt: triggeredAt,
      status: 'finish',
    };

    // Persist to database
    addMessage(conversationId, triggerMessage);

    // Emit to frontend for immediate display
    const ipcMessage: IResponseMessage = {
      type: 'cron_trigger',
      conversation_id: conversationId,
      msg_id: msgId,
      data: { cronJobId, cronJobName, triggeredAt },
    };
    ipcBridge.conversation.responseStream.emit(ipcMessage);
    ipcBridge.geminiConversation.responseStream.emit(ipcMessage);
    ipcBridge.acpConversation.responseStream.emit(ipcMessage);
    ipcBridge.openclawConversation.responseStream.emit(ipcMessage);
  }

  onceIdle(conversationId: string, callback: () => Promise<void>): void {
    this.busyGuard.onceIdle(conversationId, callback);
  }

  setProcessing(conversationId: string, busy: boolean): void {
    this.busyGuard.setProcessing(conversationId, busy);
  }
}

/** Content hash for deduplication. */
function contentHash(str: string): string {
  return crypto.createHash('sha256').update(str).digest('hex');
}

/** The fixed filename agents write skill suggestions to in the workspace root. */
export const SKILL_SUGGEST_FILENAME = 'SKILL_SUGGEST.md';

/**
 * New-conversation mode, first run (no saved skill yet).
 * Pure task context — SKILL_SUGGEST.md is triggered separately after completion.
 */
function buildNewConvPrompt(taskName: string, scheduleDesc: string, userPrompt: string): string {
  return `[Scheduled Task Context]
Task: ${taskName}
Schedule: ${scheduleDesc}

Rules:
1. Execute the task directly — do NOT ask clarifying questions.
2. Focus on producing useful, actionable output.
3. If the task requires external data (news, weather, etc.), search for the latest information.
[/Scheduled Task Context]

${userPrompt}`;
}

/**
 * New-conversation mode WITHOUT a saved skill — Gemini variant.
 * Includes SKILL_SUGGEST.md instructions inline so everything happens in a single turn.
 * Gemini's fire-and-forget sendMessage makes multi-turn skill-suggest unreliable.
 */
function buildNewConvPromptWithSkillSuggest(taskName: string, scheduleDesc: string, userPrompt: string): string {
  return `[Scheduled Task Context]
Task: ${taskName}
Schedule: ${scheduleDesc}

Rules:
1. Execute the task directly — do NOT ask clarifying questions.
2. Focus on producing useful, actionable output.
3. If the task requires external data (news, weather, etc.), search for the latest information.
4. After completing the task above, create a file named "${SKILL_SUGGEST_FILENAME}" in the current working directory (see instructions at the end).
[/Scheduled Task Context]

${userPrompt}

---

[Post-Task] After you have fully completed the task above, create a file named "${SKILL_SUGGEST_FILENAME}" in the current working directory to help future runs stay consistent. The file should follow this format:

\`\`\`markdown
---
name: <short kebab-case name, e.g. daily-greeting>
description: <one-line description of what this task does>
---

<Instructions capturing the pattern you used: output format, tone, sources checked, steps taken, quality criteria. Use concrete details from this execution, not placeholders.>
\`\`\`

If you think the task is too simple or one-off to benefit from a skill file, you can skip this step.`;
}

/**
 * New-conversation mode with a saved skill.
 * Reminds the agent to follow the skill instructions loaded into its workspace.
 */
function buildNewConvWithSkillPrompt(taskName: string, userPrompt: string): string {
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

/**
 * Existing-conversation (same conversation) mode.
 * Wraps the raw user prompt with explicit context so the AI treats it as a
 * task instruction, not a casual chat message.
 */
function buildExistingConvPrompt(taskName: string, scheduleDesc: string, userPrompt: string): string {
  return `[Scheduled Task Execution]
Task: ${taskName}
Schedule: ${scheduleDesc}

This message is NOT a conversation from the user — it is a scheduled task triggered automatically.
The text below is a TASK INSTRUCTION that you must execute, not something the user is saying to you.

Rules:
1. Treat the instruction as a command to perform, not as a chat message to respond to.
2. Execute it directly — do NOT ask clarifying questions.
3. If the task requires external data (news, weather, etc.), search for the latest information.

Task instruction:
${userPrompt}`;
}

/**
 * Follow-up prompt sent after task completion to ask the agent to write SKILL_SUGGEST.md.
 * Separated from the task prompt so the agent focuses on execution first.
 */
function buildSkillSuggestPrompt(taskName: string): string {
  return `The task "${taskName}" is a recurring scheduled task. Based on what you just did, please create a file named "${SKILL_SUGGEST_FILENAME}" in the current working directory to help future runs stay consistent.

The file should follow this format:

\`\`\`markdown
---
name: <short kebab-case name, e.g. daily-greeting>
description: <one-line description of what this task does>
---

<Instructions capturing the pattern you used: output format, tone, sources checked, steps taken, quality criteria. Use concrete details from this execution, not placeholders.>
\`\`\`

If you think the task is too simple or one-off to benefit from a skill file, you can skip this.`;
}
