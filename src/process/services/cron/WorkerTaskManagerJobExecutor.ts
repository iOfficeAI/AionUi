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
import type { AcpBackendAll, AgentBackend } from '@/common/types/acpTypes';
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
import { AcpSkillManager } from '@process/task/AcpSkillManager';
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

  isConversationBusy(conversation_id: string): boolean {
    return this.busyGuard.isProcessing(conversation_id);
  }

  async executeJob(job: CronJob, onAcquired?: () => void, preparedConversationId?: string): Promise<string | void> {
    let conversation_id = preparedConversationId ?? job.metadata.conversation_id;

    // Create a conversation when needed (skip if already prepared by runNow):
    if (!preparedConversationId && job.metadata.agentConfig) {
      conversation_id = await this.resolveConversationForJob(job);
    }

    // For existing mode, ensure the reused conversation uses the correct model.
    // If the job specifies a model_id, use that; otherwise fall back to the user's
    // preferred model so it doesn't stay on whatever it was originally created with.
    if (job.target.executionMode === 'existing' && conversation_id && job.metadata.agentConfig) {
      const convService = await getConversationService();
      const conv = await convService.getConversation(conversation_id);
      if (conv) {
        const baseModel = await this.resolveModelForBackend(job.metadata.agentConfig.backend);
        const current_model = job.metadata.agentConfig.model_id
          ? { ...baseModel, useModel: job.metadata.agentConfig.model_id }
          : baseModel;
        const convModel = 'model' in conv ? (conv as { model: TProviderWithModel }).model : undefined;
        if (convModel?.useModel !== current_model.useModel) {
          await convService.updateConversation(conversation_id, {
            model: convModel ? { ...convModel, useModel: current_model.useModel } : current_model,
          } as Partial<TChatConversation>);
          // Kill stale task so getOrBuildTask picks up the new model
          const staleTask = this.taskManager.getTask(conversation_id);
          if (staleTask) {
            this.taskManager.kill(conversation_id);
          }
        }
      }
    }

    const msgId = uuid();

    // Reuse existing task if possible; ensure yoloMode is active for scheduled runs.
    const existingTask = this.taskManager.getTask(conversation_id);
    let task;
    try {
      if (existingTask) {
        const yoloEnabled = await (existingTask as BaseAgentManager<unknown>).ensureYoloMode();
        if (yoloEnabled) {
          task = existingTask;
        } else {
          // Cannot enable yoloMode dynamically — kill and recreate.
          this.taskManager.kill(conversation_id);
          task = await this.taskManager.getOrBuildTask(conversation_id, { yoloMode: true });
        }
      } else {
        task = await this.taskManager.getOrBuildTask(conversation_id, { yoloMode: true });
      }
    } catch (err) {
      // Conversation may have been deleted between scheduling and execution.
      // Re-throw with context so the caller (CronService) can log and update job state.
      throw new Error(
        `Failed to acquire task for conversation ${conversation_id}: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err }
      );
    }

    // Mark busy only after task acquisition succeeds. This ensures that if
    // getOrBuildTask throws (conversation deleted), setProcessing(true) is never
    // called and no "busy" state leaks into subsequent runs.
    this.busyGuard.setProcessing(conversation_id, true);
    // Notify caller so it can register onceIdle callbacks while the conversation
    // is already marked busy (prevents premature idle fires).
    onAcquired?.();

    // Apply mode and config options if configured (must succeed before sendMessage).
    // If the task's agent is stale/disconnected, settings may fail — kill and retry
    // with a fresh task in that case.
    if (
      job.metadata.agentConfig?.mode ||
      job.metadata.agentConfig?.config_options ||
      job.metadata.agentConfig?.model_id
    ) {
      const ok = await this.applyAgentSettings(task, job);
      if (!ok) {
        console.warn(`[CronExecutor] Agent settings failed for job ${job.id}, recreating task and retrying`);
        this.taskManager.kill(conversation_id);
        task = await this.taskManager.getOrBuildTask(conversation_id, { yoloMode: true });
        await this.applyAgentSettings(task, job);
      }
    }

    const workspace = (task as { workspace?: string }).workspace;
    const workspaceFiles = workspace ? await copyFilesToDirectory(workspace, [], false) : [];

    const hasSkill = await hasCronSkillFile(job.id);
    const needsSkillSuggest = job.target.executionMode === 'new_conversation' && !!workspace && !hasSkill;
    const isGeminiLike =
      job.metadata.agentConfig?.backend === 'gemini' || job.metadata.agentConfig?.backend === 'aionrs';

    // Gemini/Aionrs: inline SKILL_SUGGEST instructions in the task prompt (single-turn).
    // Other agents: separate follow-up message via onFirstFinish (multi-turn).
    const messageText = this.buildMessageText(job, hasSkill, needsSkillSuggest && isGeminiLike);

    const triggered_at = Date.now();
    const cronMeta: CronMessageMeta = {
      source: 'cron',
      cron_job_id: job.id,
      cron_job_name: job.name,
      triggered_at,
    };

    // Always hide cron prompt messages from UI — a cron_trigger card replaces them.
    const hidden = true;

    // Emit and persist a cron_trigger message so users see a clickable card
    // linking back to the scheduled task detail page.
    this.emitCronTriggerMessage(conversation_id, job.id, job.name, triggered_at);

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
      skillSuggestWatcher.unregister(conversation_id);

      if (isGeminiLike) {
        // Gemini/Aionrs: SKILL_SUGGEST instructions are already in the prompt.
        // Just register the watcher (no onFirstFinish) and start polling.
        skillSuggestWatcher.register(conversation_id, job.id, workspace!);
        void this.detectSkillSuggestWithRetry(job.id, workspace!, conversation_id, 0);
      } else {
        // Other agents: send a follow-up message after the first finish event.
        skillSuggestWatcher.register(conversation_id, job.id, workspace!, async () => {
          await this.sendSkillSuggestRequest(task, job, conversation_id, workspace!);
        });
      }
    }

    // Return the conversation_id used (may differ from job.metadata.conversation_id in new_conversation mode)
    return conversation_id !== job.metadata.conversation_id ? conversation_id : undefined;
  }

  /**
   * Build a new conversation for new_conversation execution mode via ConversationServiceImpl.
   * Delegates all workspace init, model setup and DB persistence to the service layer.
   */
  private async buildConversationForJob(job: CronJob): Promise<TChatConversation> {
    const config = job.metadata.agentConfig!;
    const baseModel = await this.resolveModelForBackend(config.backend);
    // If the job specifies a model_id, override the resolved model's useModel
    const model = config.model_id ? { ...baseModel, useModel: config.model_id } : baseModel;
    const convName = `${job.name} - ${this.formatExecutionTimestamp(job)}`;

    const agent_type = this.getAgentType(config.backend);

    // Check if a per-task SKILL.md exists (user-saved via "Turn into skill").
    // If yes: inject it into the workspace and exclude both cron and cron-run builtin skills.
    // If no: cron-run builtin skill provides execution context and SKILL_SUGGEST guidance.
    const hasSkill = await hasCronSkillFile(job.id);
    const cronSkillDir = getCronSkillDir(job.id);

    // Pre-populate cached_config_options so the frontend displays correct values immediately.
    const cached_config_options = await this.buildCachedConfigOptions(config);

    const params: CreateConversationParams = {
      type: agent_type,
      name: convName,
      model,
      extra: {
        backend: config.backend,
        agent_name: config.name,
        cli_path: config.cli_path,
        custom_agent_id: config.custom_agent_id,
        preset_assistant_id: config.is_preset ? config.custom_agent_id : undefined,
        cron_job_id: job.id,
        cronWorkspace: config.workspace || '',
        workspace: config.workspace || '',
        ...(config.mode ? { session_mode: config.mode } : {}),
        ...(config.model_id ? { current_model_id: config.model_id } : {}),
        ...(cached_config_options ? { cached_config_options } : {}),
        ...(hasSkill
          ? { extraSkillPaths: [cronSkillDir], excludeBuiltinSkills: ['cron'] }
          : { excludeBuiltinSkills: ['cron'] }),
      },
    };

    const service = await getConversationService();
    const conversation = await service.createConversation(params);

    // Persist loaded skills snapshot so ConversationSkillsIndicator can display them
    try {
      const excludeBuiltinSkills = (params.extra as { excludeBuiltinSkills?: string[] })?.excludeBuiltinSkills;
      const skillManager = AcpSkillManager.getInstance();
      await skillManager.discoverSkills(undefined, excludeBuiltinSkills);
      const excludeSet = new Set(excludeBuiltinSkills ?? []);
      const loaded_skills = skillManager.getSkillsIndex().filter((s) => !excludeSet.has(s.name));
      if (loaded_skills.length > 0) {
        const updatedExtra = { ...conversation.extra, loaded_skills };
        service.updateConversation(conversation.id, { extra: updatedExtra } as Partial<typeof conversation>);
        conversation.extra = updatedExtra as typeof conversation.extra;
      }
    } catch (error) {
      console.warn('[CronExecutor] Failed to persist loaded_skills:', error);
    }

    // Notify frontend so sider updates immediately
    ipcBridge.conversation.listChanged.emit({
      conversation_id: conversation.id,
      action: 'created',
      source: conversation.source || 'aionui',
    });

    return conversation;
  }

  /**
   * Read global cached config options for the backend and patch with cron job values.
   * Returns undefined when there is nothing to populate.
   */
  private async buildCachedConfigOptions(
    config: NonNullable<CronJob['metadata']['agentConfig']>
  ): Promise<unknown[] | undefined> {
    if (!config.config_options || Object.keys(config.config_options).length === 0) return undefined;
    try {
      const globalCache = await ProcessConfig.get('acp.cached_config_options');
      const opts = globalCache?.[config.backend];
      if (!Array.isArray(opts) || opts.length === 0) return undefined;
      return opts.map((opt) => {
        const val = config.config_options![(opt as { id: string }).id];
        return val !== undefined ? { ...opt, current_value: val, selected_value: val } : opt;
      });
    } catch {
      return undefined;
    }
  }

  /**
   * Map backend identifier to the AgentType used by createConversation.
   */
  private getAgentType(backend: AgentBackend): AgentType {
    switch (backend) {
      case 'gemini':
        return 'gemini';
      case 'aionrs':
        return 'aionrs';
      case 'openclaw-gateway':
      case 'openclaw' as AgentBackend:
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
   * Reads preferredModelId from user settings to match guid page behavior.
   */
  private async resolveModelForBackend(backend: string): Promise<TProviderWithModel> {
    let providers: Awaited<ReturnType<typeof ipcBridge.mode.listProviders.invoke>> = [];
    try {
      providers = await ipcBridge.mode.listProviders.invoke();
    } catch (error) {
      console.warn('[WorkerTaskManagerJobExecutor] Failed to load providers from backend:', error);
    }
    const providerList = (Array.isArray(providers) ? providers : []) as unknown as TProviderWithModel[];

    // Read preferred model ID from user config.
    // Gemini stores its default model in 'gemini.defaultModel' (set by Guid page).
    // ACP backends store in 'acp.config.<backend>.preferredModelId'.
    let preferredModelId: string | undefined;
    if (backend === 'gemini') {
      const savedModel = await ProcessConfig.get('gemini.defaultModel');
      if (savedModel && typeof savedModel === 'object' && 'useModel' in savedModel) {
        preferredModelId = savedModel.useModel;
      } else if (typeof savedModel === 'string') {
        preferredModelId = savedModel;
      }
    } else if (backend === 'aionrs') {
      const savedModel = await ProcessConfig.get('aionrs.defaultModel');
      preferredModelId = savedModel?.useModel;
    } else {
      const acpConfig = await ProcessConfig.get('acp.config');
      preferredModelId = (acpConfig?.[backend as AcpBackendAll] as Record<string, unknown>)?.preferredModelId as
        | string
        | undefined;
    }

    // For gemini, prefer google-auth provider
    if (backend === 'gemini') {
      const googleAuth = providerList.find((p) => p.platform === 'gemini-with-google-auth' || p.platform === 'gemini');
      if (googleAuth) {
        const useModel = preferredModelId || googleAuth.useModel || 'auto';
        return { ...googleAuth, useModel } as TProviderWithModel;
      }
    }

    // For other backends, find a matching provider
    const match = providerList.find((p) => p.platform === backend || p.id === backend);
    if (match) {
      const useModel = preferredModelId || match.useModel || 'auto';
      return { ...match, useModel } as TProviderWithModel;
    }

    // Fallback: return first available provider
    if (providerList.length > 0) {
      const useModel = preferredModelId || providerList[0].useModel || 'auto';
      return { ...providerList[0], useModel } as TProviderWithModel;
    }

    // Last resort placeholder
    return {
      id: `${backend}-fallback`,
      name: backend,
      useModel: preferredModelId || 'auto',
      platform: backend,
      base_url: '',
      api_key: '',
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
    if (!job.metadata.agentConfig) {
      return job.metadata.conversation_id;
    }
    return this.resolveConversationForJob(job);
  }

  /**
   * Resolve the conversation ID for a job execution.
   * - new_conversation mode: always create a fresh conversation
   * - existing mode: reuse the latest child conversation, unless agent or workspace changed
   *
   * Only agent change or workspace change forces a new conversation in existing mode.
   * Mode and config_options changes do NOT require a new conversation.
   */
  private async resolveConversationForJob(job: CronJob): Promise<string> {
    // new_conversation mode: always create
    if (job.target.executionMode === 'new_conversation') {
      const conv = await this.buildConversationForJob(job);
      return conv.id;
    }

    // existing mode: try to reuse latest child conversation
    if (job.target.executionMode === 'existing') {
      const convService = await getConversationService();
      const childConversations = await convService.getConversationsByCronJob(job.id);
      console.log(
        `[CronExecutor] resolveConversation existing mode: childCount=${childConversations.length}, executionMode=${job.target.executionMode}`
      );

      if (childConversations.length > 0) {
        const latestConv = await convService.getConversation(childConversations[0].id);
        if (latestConv) {
          const config = job.metadata.agentConfig!;
          const extra = latestConv.extra as Record<string, unknown> | undefined;
          const convBackend = extra?.backend as string | undefined;
          const configWorkspace = config.workspace || '';
          // Compare against cronWorkspace (what was configured), not workspace
          // (which may be overwritten by agent runtime, e.g. codex temp dir).
          const prevCronWorkspace = (extra?.cronWorkspace as string | undefined) ?? '';
          const agentChanged = convBackend !== config.backend;
          const workspaceChanged = prevCronWorkspace !== configWorkspace;

          console.log(
            `[CronExecutor] resolveConversation: convBackend=${convBackend}, configBackend=${config.backend}, agentChanged=${agentChanged}, prevCronWorkspace=${prevCronWorkspace}, configWorkspace=${configWorkspace}, workspaceChanged=${workspaceChanged}`
          );

          if (agentChanged || workspaceChanged) {
            const conv = await this.buildConversationForJob(job);
            return conv.id;
          }

          // Sync extra fields so the frontend reads correct values immediately.
          const extraUpdates: Record<string, unknown> = {};

          // Backfill workspace for old conversations created before this field was always set
          if (extra?.workspace === undefined || extra?.workspace === null) {
            extraUpdates.workspace = config.workspace || '';
          }

          if (config.mode && extra?.session_mode !== config.mode) {
            extraUpdates.session_mode = config.mode;
          }

          if (config.model_id && extra?.current_model_id !== config.model_id) {
            extraUpdates.current_model_id = config.model_id;
          }

          if (config.config_options && Object.keys(config.config_options).length > 0) {
            // Prefer patching existing conversation cache; fall back to global cache
            const existing = Array.isArray(extra?.cached_config_options) ? extra.cached_config_options : undefined;
            if (existing && existing.length > 0) {
              extraUpdates.cached_config_options = existing.map((opt: Record<string, unknown>) => {
                const val = config.config_options![(opt.id as string) ?? ''];
                return val !== undefined ? { ...opt, current_value: val, selected_value: val } : opt;
              });
            } else {
              const fromGlobal = await this.buildCachedConfigOptions(config);
              if (fromGlobal) extraUpdates.cached_config_options = fromGlobal;
            }
          }

          if (Object.keys(extraUpdates).length > 0) {
            await convService.updateConversation(childConversations[0].id, {
              extra: { ...extra, ...extraUpdates },
            } as Partial<TChatConversation>);
          }

          return childConversations[0].id;
        }
      }

      // No child conversations yet (or latest was deleted): create first one
      const conv = await this.buildConversationForJob(job);
      return conv.id;
    }

    // Fallback: use metadata conversation_id (jobs created from conversation context)
    return job.metadata.conversation_id;
  }

  /**
   * Apply mode and config options from the job's agentConfig onto the task.
   * Returns true if all settings were applied successfully, false if any failed
   * (indicating the agent may be stale and needs recreation).
   */
  private async applyAgentSettings(
    task: { type: string; sendMessage: (data: unknown) => Promise<void> },
    job: CronJob
  ): Promise<boolean> {
    type SetModeResult = { success?: boolean; msg?: string };
    const hasSetMode =
      'setMode' in task && typeof (task as { setMode?: (mode: string) => Promise<unknown> }).setMode === 'function';
    const hasSetConfigOption =
      'setConfigOption' in task &&
      typeof (task as { setConfigOption?: (id: string, val: string) => Promise<unknown> }).setConfigOption ===
        'function';

    // Apply mode
    if (job.metadata.agentConfig?.mode && hasSetMode) {
      const desiredMode = job.metadata.agentConfig.mode;
      try {
        const result = (await (task as { setMode: (mode: string) => Promise<unknown> }).setMode(
          desiredMode
        )) as SetModeResult;
        if (result && result.success === false) {
          console.warn(`[CronExecutor] setMode("${desiredMode}") failed for job ${job.id}: ${result.msg ?? 'unknown'}`);
          return false;
        }
      } catch (err) {
        console.warn(`[CronExecutor] setMode("${desiredMode}") threw for job ${job.id}:`, err);
        return false;
      }
    }

    // Apply config options
    if (job.metadata.agentConfig?.config_options && hasSetConfigOption) {
      for (const [config_id, value] of Object.entries(job.metadata.agentConfig.config_options)) {
        try {
          await (task as { setConfigOption: (id: string, val: string) => Promise<unknown> }).setConfigOption(
            config_id,
            value
          );
        } catch (err) {
          console.warn(`[CronExecutor] setConfigOption("${config_id}", "${value}") threw for job ${job.id}:`, err);
          return false;
        }
      }
    }

    // Apply model
    if (job.metadata.agentConfig?.model_id) {
      const hasSetModel =
        'setModel' in task &&
        typeof (task as { setModel?: (model_id: string) => Promise<unknown> }).setModel === 'function';
      if (hasSetModel) {
        const desiredModel = job.metadata.agentConfig.model_id;
        try {
          await (task as { setModel: (model_id: string) => Promise<unknown> }).setModel(desiredModel);
        } catch (err) {
          console.warn(`[CronExecutor] setModel("${desiredModel}") threw for job ${job.id}:`, err);
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Send a follow-up hidden message asking the agent to write SKILL_SUGGEST.md,
   * then start polling for the file.
   */
  private async sendSkillSuggestRequest(
    task: { type: string; sendMessage: (data: unknown) => Promise<void> },
    job: CronJob,
    conversation_id: string,
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

    void this.detectSkillSuggestWithRetry(job.id, workspace, conversation_id, 0);
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
  private detectSkillSuggestWithRetry(
    job_id: string,
    workspace: string,
    conversation_id: string,
    attempt: number
  ): void {
    const file_path = path.join(workspace, SKILL_SUGGEST_FILENAME);

    fs.readFile(file_path, 'utf-8')
      .then(async (content) => {
        if (!content?.trim()) {
          throw Object.assign(new Error('empty'), { code: 'EMPTY' });
        }

        console.log(
          `[CronExecutor] Found ${SKILL_SUGGEST_FILENAME} (${content.length} chars) for job ${job_id} on attempt ${attempt + 1}`
        );

        // Register for ongoing monitoring and set the initial hash
        skillSuggestWatcher.register(conversation_id, job_id, workspace);
        const hash = contentHash(content);

        // Skip if SkillSuggestWatcher.checkAndEmit already processed this content
        if (skillSuggestWatcher.getLastHash(conversation_id) === hash) {
          return;
        }
        skillSuggestWatcher.setLastHash(conversation_id, hash);

        // Emit the initial detection
        await this.emitSkillSuggestInitial(job_id, conversation_id, content);
      })
      .catch((err) => {
        // File not found or empty — retry if attempts remain
        if (attempt < WorkerTaskManagerJobExecutor.SKILL_DETECT_MAX_RETRIES) {
          setTimeout(() => {
            this.detectSkillSuggestWithRetry(job_id, workspace, conversation_id, attempt + 1);
          }, WorkerTaskManagerJobExecutor.SKILL_DETECT_INTERVAL_MS);
        } else {
          // Exhausted retries — register anyway in case the user asks AI to write it later
          skillSuggestWatcher.register(conversation_id, job_id, workspace);
          console.log(
            `[CronExecutor] Registered watcher for job ${job_id} (file not found after ${attempt + 1} retries)`
          );
        }
        // Only log unexpected errors (not ENOENT/EMPTY which are expected during retries)
        if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT' && (err as { code?: string })?.code !== 'EMPTY') {
          console.warn(`[CronExecutor] Error detecting ${SKILL_SUGGEST_FILENAME} for job ${job_id}:`, err);
        }
      });
  }

  /**
   * Emit the initial skill_suggest message when SKILL_SUGGEST.md is first found.
   */
  private async emitSkillSuggestInitial(job_id: string, conversation_id: string, content: string): Promise<void> {
    if (await hasCronSkillFile(job_id)) {
      skillSuggestWatcher.unregister(conversation_id);
      return;
    }

    const { validateSkillContent } = await import('./cronSkillFile');
    const validated = validateSkillContent(content);
    if (!validated) {
      console.warn(`[CronExecutor] ${SKILL_SUGGEST_FILENAME} validation failed for job ${job_id}`);
      return;
    }

    const message: IResponseMessage = {
      type: 'skill_suggest',
      conversation_id: conversation_id,
      msg_id: uuid(),
      data: {
        cron_job_id: job_id,
        name: validated.name,
        description: validated.description,
        skillContent: content,
      },
    };

    ipcBridge.conversation.responseStream.emit(message);
    ipcBridge.geminiConversation.responseStream.emit(message);
    ipcBridge.acpConversation.responseStream.emit(message);
    ipcBridge.openclawConversation.responseStream.emit(message);
    console.log(`[CronExecutor] Emitted initial skill_suggest for job ${job_id}, conversation ${conversation_id}`);
  }

  /**
   * Emit and persist a cron_trigger message so the frontend renders a clickable
   * card linking to the scheduled task detail page.
   */
  private emitCronTriggerMessage(
    conversation_id: string,
    cron_job_id: string,
    cron_job_name: string,
    triggered_at: number
  ): void {
    const msgId = uuid();
    const triggerMessage: TMessage = {
      id: msgId,
      msg_id: msgId,
      type: 'cron_trigger',
      position: 'center',
      conversation_id: conversation_id,
      content: { cron_job_id, cron_job_name, triggered_at },
      created_at: triggered_at,
      status: 'finish',
    };

    // Persist to database
    addMessage(conversation_id, triggerMessage);

    // Emit to frontend for immediate display
    const ipcMessage: IResponseMessage = {
      type: 'cron_trigger',
      conversation_id: conversation_id,
      msg_id: msgId,
      data: { cron_job_id, cron_job_name, triggered_at },
    };
    ipcBridge.conversation.responseStream.emit(ipcMessage);
    ipcBridge.geminiConversation.responseStream.emit(ipcMessage);
    ipcBridge.acpConversation.responseStream.emit(ipcMessage);
    ipcBridge.openclawConversation.responseStream.emit(ipcMessage);
  }

  onceIdle(conversation_id: string, callback: () => Promise<void>): void {
    this.busyGuard.onceIdle(conversation_id, callback);
  }

  setProcessing(conversation_id: string, busy: boolean): void {
    this.busyGuard.setProcessing(conversation_id, busy);
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
