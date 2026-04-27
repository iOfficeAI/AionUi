/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { CronMessageMeta, TMessage } from '@/common/chat/chatLib';
import type { TChatConversation } from '@/common/config/storage';
import { uuid } from '@/common/utils';
import { addMessage } from '@process/utils/message';
import { getPlatformServices } from '@/common/platform';
import { Cron } from 'croner';
import i18n, { i18nReady } from '@process/services/i18n';
import type { IConversationRepository } from '@process/services/database/IConversationRepository';
import { ProcessConfig } from '@process/utils/initStorage';
import type { CronJob, CronSchedule } from './CronStore';
import type { ICronRepository } from './ICronRepository';
import type { ICronEventEmitter } from './ICronEventEmitter';
import type { ICronJobExecutor } from './ICronJobExecutor';
import { deleteCronSkillFile } from './cronSkillFile';

/**
 * Parameters for creating a new cron job
 */
export type CreateCronJobParams = {
  name: string;
  description?: string;
  schedule: CronSchedule;
  /** New UI system uses `prompt`; old skill system uses `message` */
  prompt?: string;
  message?: string;
  conversation_id: string;
  conversation_title?: string;
  agent_type: import('@/common/types/acpTypes').AgentBackend;
  created_by: 'user' | 'agent';
  execution_mode?: 'existing' | 'new_conversation';
  agent_config?: import('./CronStore').CronJob['metadata']['agent_config'];
};

/**
 * CronService - Core scheduling service for AionUI
 *
 * Manages scheduled tasks that send messages to conversations at specified times.
 * Handles conflicts when conversation is busy.
 */
export class CronService {
  private timers: Map<string, Cron | NodeJS.Timeout> = new Map();
  private retryTimers: Map<string, NodeJS.Timeout> = new Map();
  private retryCounts: Map<string, number> = new Map();
  private initialized = false;
  private powerSaveBlockerId: number | null = null;

  constructor(
    private readonly repo: ICronRepository,
    private readonly emitter: ICronEventEmitter,
    private readonly executor: ICronJobExecutor,
    private readonly conversationRepo: IConversationRepository
  ) {}

  /**
   * Initialize the cron service
   * Load all enabled jobs from database and start their timers
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await this.cleanupOrphanJobs();
      await this.backfillCronJobIdOnConversations();

      const jobs = await this.repo.listEnabled();

      for (const job of jobs) {
        await this.startTimer(job);
      }

      this.initialized = true;
      await this.updatePowerBlocker();
    } catch (error) {
      console.error('[CronService] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Remove cron jobs whose associated conversation no longer exists.
   * Called once during init to clean up stale jobs left by abnormal deletion paths.
   */
  private async cleanupOrphanJobs(): Promise<void> {
    try {
      const allJobs = await this.repo.listAll();
      for (const job of allJobs) {
        // new_conversation mode jobs are not bound to a single conversation — skip orphan check.
        // Also skip when conversation_id is empty (legacy jobs created before execution_mode existed).
        if (job.target.execution_mode === 'new_conversation' || !job.metadata.conversation_id) {
          continue;
        }
        const conversation = await this.conversationRepo.getConversation(job.metadata.conversation_id);
        if (!conversation) {
          // Double-check: if the job has child conversations (via cron_job_id), it's not truly orphaned.
          // This can happen when a job's original conversation_id is stale but it has produced executions.
          const childConversations = await this.conversationRepo.getConversationsByCronJob(job.id);
          if (childConversations.length > 0) {
            console.log(
              `[CronService] Skipping orphan cleanup for "${job.name}" (${job.id}): has ${childConversations.length} child conversations`
            );
            continue;
          }
          console.log(
            `[CronService] Removing orphan job "${job.name}" (${job.id}): conversation ${job.metadata.conversation_id} not found`
          );
          this.stopTimer(job.id);
          await this.repo.delete(job.id);
          try {
            await deleteCronSkillFile(job.id);
          } catch {
            // Ignore cleanup errors
          }
          this.emitter.emitJobRemoved(job.id);
        }
      }
    } catch (error) {
      console.warn('[CronService] Failed to cleanup orphan jobs:', error);
    }
  }

  /**
   * Backfill cron_job_id into conversation.extra and agent_config into job.metadata
   * for existing jobs that predate these fields.
   */
  private async backfillCronJobIdOnConversations(): Promise<void> {
    try {
      const allJobs = await this.repo.listAll();
      for (const job of allJobs) {
        if (job.target.execution_mode === 'new_conversation' || !job.metadata.conversation_id) {
          continue;
        }
        const conv = await this.conversationRepo.getConversation(job.metadata.conversation_id);
        if (!conv) continue;

        // Backfill cron_job_id on conversation extra
        const extra = (conv.extra ?? {}) as Record<string, unknown>;
        if (extra.cron_job_id !== job.id) {
          extra.cron_job_id = job.id;
          await this.conversationRepo.updateConversation(job.metadata.conversation_id, {
            extra: extra as TChatConversation['extra'],
          });
        }

        // Backfill agent_config and conversation_title from conversation
        const needsAgentConfig = !job.metadata.agent_config;
        const needsTitle = !job.metadata.conversation_title && conv.name;
        if (needsAgentConfig || needsTitle) {
          const updates: Partial<CronJob> = {};
          const newMetadata = { ...job.metadata };
          if (needsAgentConfig) {
            const agentConfig = this.buildAgentConfigFromConversation(conv, job);
            if (agentConfig) newMetadata.agent_config = agentConfig;
          }
          if (needsTitle) {
            newMetadata.conversation_title = conv.name;
          }
          updates.metadata = newMetadata;
          await this.repo.update(job.id, updates);
        }
      }
    } catch (error) {
      console.warn('[CronService] Failed to backfill cron job data:', error);
    }
  }

  /**
   * Build ICronAgentConfig from conversation extra fields.
   */
  private buildAgentConfigFromConversation(
    conv: TChatConversation,
    job: CronJob
  ): CronJob['metadata']['agent_config'] | null {
    const extra = (conv.extra ?? {}) as Record<string, unknown>;
    const backend = (extra.backend as string) || job.metadata.agent_type;
    if (!backend) return null;

    return {
      backend: backend as import('@/common/types/acpTypes').AcpBackendAll,
      name: (extra.agent_name as string) || job.name,
      cli_path: extra.cli_path as string | undefined,
      is_preset: !!extra.preset_assistant_id,
      custom_agent_id: (extra.preset_assistant_id as string) || (extra.custom_agent_id as string) || undefined,
    };
  }

  /**
   * Add a new cron job
   * @throws Error if conversation already has a cron job (one job per conversation limit)
   */
  async addJob(params: CreateCronJobParams): Promise<CronJob> {
    // Check if conversation already has a cron job (one job per conversation limit)
    // Skip for new_conversation mode since each execution creates a new conversation
    if (params.execution_mode !== 'new_conversation' && params.conversation_id) {
      const existingJobs = await this.repo.listByConversation(params.conversation_id);
      if (existingJobs.length > 0) {
        const existingJob = existingJobs[0];
        throw new Error(
          i18n.t('cron:error.alreadyExists', {
            name: existingJob.name,
            id: existingJob.id,
          })
        );
      }
    }

    const now = Date.now();
    const job_id = `cron_${uuid()}`;

    const job: CronJob = {
      id: job_id,
      name: params.name,
      description: params.description?.trim() || undefined,
      enabled: true,
      schedule: params.schedule,
      target: {
        payload: { kind: 'message', text: params.prompt ?? params.message ?? '' },
        execution_mode: params.execution_mode ?? 'existing',
      },
      metadata: {
        conversation_id: params.conversation_id,
        conversation_title: params.conversation_title,
        agent_type: params.agent_type,
        created_by: params.created_by,
        created_at: now,
        updated_at: now,
        agent_config: params.agent_config,
      },
      state: {
        run_count: 0,
        retry_count: 0,
        max_retries: 3,
      },
    };

    // Calculate next run time
    this.updateNextRunTime(job);

    // Save to database
    await this.repo.insert(job);

    // Tag the conversation with cron_job_id so it appears under the scheduled tasks tab
    // and update modified_at so it appears at the top of the list (skip for new_conversation mode)
    if (params.execution_mode !== 'new_conversation' && params.conversation_id) {
      try {
        const conv = await this.conversationRepo.getConversation(params.conversation_id);
        const existingExtra = (conv?.extra ?? {}) as Record<string, unknown>;
        await this.conversationRepo.updateConversation(params.conversation_id, {
          modified_at: now,
          extra: { ...existingExtra, cron_job_id: job_id } as TChatConversation['extra'],
        });
      } catch (err) {
        console.warn('[CronService] Failed to update conversation with cron_job_id:', err);
      }
    }

    // Start timer
    await this.startTimer(job);
    await this.updatePowerBlocker();

    // Emit event to notify frontend (especially when created by agent)
    this.emitter.emitJobCreated(job);

    return job;
  }

  /**
   * Update an existing cron job
   */
  async updateJob(job_id: string, updates: Partial<CronJob>): Promise<CronJob> {
    const existing = await this.repo.getById(job_id);
    if (!existing) {
      throw new Error(`Job not found: ${job_id}`);
    }

    // Stop existing timer
    this.stopTimer(job_id);

    // Update in database
    await this.repo.update(job_id, updates);

    // Get updated job
    const updated = (await this.repo.getById(job_id))!;

    // Recalculate next run time if schedule changed or job is being enabled
    if (updates.schedule || (updates.enabled === true && !existing.enabled)) {
      this.updateNextRunTime(updated);
      await this.repo.update(job_id, { state: updated.state });
    }

    // Restart timer if enabled
    if (updated.enabled) {
      await this.startTimer(updated);
    }

    await this.updatePowerBlocker();

    // Emit event to notify frontend
    this.emitter.emitJobUpdated(updated);

    return updated;
  }

  /**
   * Remove a cron job
   */
  async removeJob(job_id: string): Promise<void> {
    // Get job before deletion to access conversation_id
    const job = await this.repo.getById(job_id);

    // Stop timer
    this.stopTimer(job_id);

    // Delete from database
    await this.repo.delete(job_id);

    // Clean up SKILL.md file
    try {
      await deleteCronSkillFile(job_id);
    } catch (err) {
      console.warn('[CronService] Failed to delete SKILL.md:', err);
    }

    // Clean up associated conversations.
    // Note: deleteConversation relies on SQLite ON DELETE CASCADE to remove
    // related messages rows — see migration v1 foreign key definition.
    if (job) {
      try {
        if (job.target.execution_mode === 'new_conversation') {
          // Delete all child conversations created by this cron job
          const childConversations = await this.conversationRepo.getConversationsByCronJob(job_id);
          for (const conv of childConversations) {
            await this.conversationRepo.deleteConversation(conv.id);
            ipcBridge.conversation.listChanged.emit({
              conversation_id: conv.id,
              action: 'deleted',
              source: conv.source || 'aionui',
            });
          }
          if (childConversations.length > 0) {
            console.log(`[CronService] Deleted ${childConversations.length} child conversations for job ${job_id}`);
          }
        } else if (job.metadata.conversation_id) {
          // Remove cron_job_id from the associated conversation's extra
          const conv = await this.conversationRepo.getConversation(job.metadata.conversation_id);
          if (conv) {
            const existingExtra = (conv.extra ?? {}) as Record<string, unknown>;
            delete existingExtra.cron_job_id;
            await this.conversationRepo.updateConversation(job.metadata.conversation_id, {
              extra: existingExtra as TChatConversation['extra'],
            });
          }
        }
      } catch (err) {
        console.warn('[CronService] Failed to clean up conversations for job:', err);
      }
    }

    await this.updatePowerBlocker();

    // Emit event to notify frontend
    this.emitter.emitJobRemoved(job_id);
  }

  /**
   * Trigger a job to execute immediately (blocks until complete).
   * Used by scheduled timer execution.
   */
  async triggerJob(job_id: string): Promise<void> {
    const job = await this.repo.getById(job_id);
    if (!job) {
      throw new Error(`Job not found: ${job_id}`);
    }
    await this.executeJob(job);
  }

  /**
   * Run a job now: create the conversation (if needed), then execute in background.
   * Returns the conversation_id immediately so the frontend can navigate to it.
   */
  async runNow(job_id: string): Promise<string> {
    const job = await this.repo.getById(job_id);
    if (!job) {
      throw new Error(`Job not found: ${job_id}`);
    }
    const conversation_id = await this.executor.prepareConversation(job);
    // Fire-and-forget: execute in background, pass the prepared conversation_id to skip re-creation
    void this.executeJob(job, conversation_id);
    return conversation_id;
  }

  /**
   * List all cron jobs
   */
  async listJobs(): Promise<CronJob[]> {
    return this.repo.listAll();
  }

  /**
   * List cron jobs by conversation
   */
  async listJobsByConversation(conversation_id: string): Promise<CronJob[]> {
    return this.repo.listByConversation(conversation_id);
  }

  /**
   * Get a specific job
   */
  async getJob(job_id: string): Promise<CronJob | null> {
    return this.repo.getById(job_id);
  }

  /**
   * Start timer for a job
   * Supports cron expressions, fixed intervals (every), and one-time tasks (at)
   */
  private async startTimer(job: CronJob): Promise<void> {
    // Stop existing timer if any
    this.stopTimer(job.id);

    const { schedule } = job;

    switch (schedule.kind) {
      case 'cron': {
        // Skip timer creation for manual trigger (empty cron expression)
        if (!schedule.expr) {
          job.state.next_run_at_ms = undefined;
          break;
        }

        try {
          const timer = new Cron(
            schedule.expr,
            {
              timezone: schedule.tz,
              paused: false,
            },
            () => {
              void this.executeJob(job);
            }
          );
          this.timers.set(job.id, timer);

          // Sync next_run_at_ms with actual next run time and notify frontend
          const nextRun = timer.nextRun();
          job.state.next_run_at_ms = nextRun ? nextRun.getTime() : undefined;
        } catch (error) {
          console.error(`[CronService] Invalid cron expression "${schedule.expr}" for job "${job.name}":`, error);
          job.state.next_run_at_ms = undefined;
          job.state.last_status = 'error';
          job.state.last_error = `Invalid cron expression: ${schedule.expr}`;
          job.enabled = false;
          await this.repo.update(job.id, { enabled: false, state: job.state });
          this.emitter.emitJobUpdated(job);
          break;
        }
        await this.repo.update(job.id, { state: job.state });
        this.emitter.emitJobUpdated(job);
        break;
      }

      case 'every': {
        const timer = setInterval(() => {
          void this.executeJob(job);
        }, schedule.everyMs);
        this.timers.set(job.id, timer);

        // Sync next_run_at_ms with actual timer start time and notify frontend
        job.state.next_run_at_ms = Date.now() + schedule.everyMs;
        await this.repo.update(job.id, { state: job.state });
        this.emitter.emitJobUpdated(job);
        break;
      }

      case 'at': {
        const delay = schedule.atMs - Date.now();
        if (delay > 0) {
          const timer = setTimeout(() => {
            void this.executeJob(job);
            // One-time job, disable after execution
            void this.updateJob(job.id, { enabled: false });
          }, delay);
          this.timers.set(job.id, timer);

          // Sync next_run_at_ms and notify frontend
          job.state.next_run_at_ms = schedule.atMs;
          await this.repo.update(job.id, { state: job.state });
          this.emitter.emitJobUpdated(job);
        } else {
          // Past one-time job, mark as expired and disable
          job.state.next_run_at_ms = undefined;
          job.state.last_status = 'skipped';
          job.state.last_error = i18n.t('cron:error.scheduledTimePassed');
          job.enabled = false;
          await this.repo.update(job.id, { enabled: false, state: job.state });
          this.emitter.emitJobUpdated(job);
        }
        break;
      }
    }
  }

  /**
   * Stop timer for a job
   * Also clears associated retry timers
   */
  private stopTimer(job_id: string): void {
    const timer = this.timers.get(job_id);
    if (timer) {
      if (timer instanceof Cron) {
        timer.stop();
      } else {
        clearTimeout(timer);
        clearInterval(timer);
      }
      this.timers.delete(job_id);
    }

    // Also clear any retry timers
    const retryTimer = this.retryTimers.get(job_id);
    if (retryTimer) {
      clearTimeout(retryTimer);
      this.retryTimers.delete(job_id);
    }

    // Clear retry count for this job
    this.retryCounts.delete(job_id);
  }

  /**
   * Execute a job - send message to conversation
   * Handles conversation busy state with retries and power management
   */
  private async executeJob(job: CronJob, preparedConversationId?: string): Promise<void> {
    const conversation_id = preparedConversationId ?? job.metadata.conversation_id;

    // Check if conversation is busy
    const isBusy = this.executor.isConversationBusy(conversation_id);
    if (isBusy) {
      const currentRetry = (this.retryCounts.get(job.id) ?? 0) + 1;
      this.retryCounts.set(job.id, currentRetry);

      if (currentRetry > (job.state.max_retries || 3)) {
        // Max retries exceeded, skip this run
        this.retryCounts.delete(job.id);
        this.updateNextRunTime(job);
        await this.repo.update(job.id, {
          state: {
            ...job.state,
            last_status: 'skipped',
            last_error: i18n.t('cron:error.conversationBusy', {
              count: job.state.max_retries || 3,
            }),
          },
        });
        const skippedJob = await this.repo.getById(job.id);
        if (skippedJob) {
          this.emitter.emitJobUpdated(skippedJob);
        }
        return;
      }

      // Schedule retry in 30 seconds
      const retryTimer = setTimeout(() => {
        this.retryTimers.delete(job.id);
        void this.executeJob(job);
      }, 30000);
      this.retryTimers.set(job.id, retryTimer);
      return;
    }

    const last_run_at_ms = Date.now();
    const currentRunCount = (job.state.run_count ?? 0) + 1;
    let last_status: CronJob['state']['last_status'];
    let last_error: string | undefined;

    try {
      // executeJob marks the conversation busy only after task acquisition succeeds.
      // The onAcquired callback registers the completion notification while the
      // conversation is already busy, preventing premature onceIdle fires.
      const newConversationId = await this.executor.executeJob(
        job,
        () => {
          this.registerCompletionNotification(job);
        },
        preparedConversationId
      );

      // For "existing" mode: persist the newly created conversation_id so subsequent executions reuse it
      if (newConversationId && job.target.execution_mode === 'existing') {
        job.metadata.conversation_id = newConversationId;
        await this.repo.update(job.id, {
          metadata: { ...job.metadata, conversation_id: newConversationId },
        });
      }

      // Success
      this.retryCounts.delete(job.id);
      last_status = 'ok';
      last_error = undefined;

      // Update conversation modified_at so it appears at the top of the list
      const activeConversationId = newConversationId || conversation_id;
      try {
        await this.conversationRepo.updateConversation(activeConversationId, {
          modified_at: Date.now(),
        });
      } catch (err) {
        console.warn('[CronService] Failed to update conversation modified_at after execution:', err);
      }
    } catch (error) {
      // Error
      last_status = 'error';
      last_error = error instanceof Error ? error.message : String(error);
      console.error(`[CronService] Job ${job.id} failed:`, error);
    }

    // Update next run time
    this.updateNextRunTime(job);

    // Persist state as new object and notify frontend
    await this.repo.update(job.id, {
      state: {
        ...job.state,
        last_run_at_ms,
        run_count: currentRunCount,
        last_status,
        last_error,
      },
    });
    const updatedJob = await this.repo.getById(job.id);
    if (updatedJob) {
      this.emitter.emitJobUpdated(updatedJob);
    }
    this.emitter.emitJobExecuted(job.id, last_status, last_error);
  }

  /**
   * Register a callback on executor to send notification when the agent finishes.
   * Must be called BEFORE sendMessage to avoid race conditions.
   */
  private registerCompletionNotification(job: CronJob): void {
    const { conversation_id } = job.metadata;

    this.executor.onceIdle(conversation_id, async () => {
      // Check if cron notification is enabled
      const cronNotificationEnabled = await ProcessConfig.get('system.cronNotificationEnabled');
      if (!cronNotificationEnabled) return;

      await i18nReady;

      const title = i18n.t('cron.notification.scheduledTaskComplete', {
        title: job.metadata.conversation_title || job.name,
      });
      const body = i18n.t('cron.notification.taskDone');

      this.emitter.showNotification({ title, body, conversation_id }).catch((err) => {
        console.warn('[CronService] Failed to show notification:', err);
      });
    });
  }

  /**
   * Update the next run time for a job based on its schedule
   */
  private updateNextRunTime(job: CronJob): void {
    const { schedule } = job;

    switch (schedule.kind) {
      case 'cron': {
        try {
          const cron = new Cron(schedule.expr, { timezone: schedule.tz });
          const next = cron.nextRun();
          job.state.next_run_at_ms = next ? next.getTime() : undefined;
        } catch {
          job.state.next_run_at_ms = undefined;
        }
        break;
      }

      case 'every': {
        job.state.next_run_at_ms = Date.now() + schedule.everyMs;
        break;
      }

      case 'at': {
        job.state.next_run_at_ms = schedule.atMs > Date.now() ? schedule.atMs : undefined;
        break;
      }
    }
  }

  /**
   * Handle system resume from sleep/hibernate.
   * Detects missed jobs, inserts notification messages into their conversations,
   * and restarts all timers with fresh schedules.
   */
  async handleSystemResume(): Promise<void> {
    if (!this.initialized) return;

    console.log('[CronService] System resumed, checking for missed jobs...');
    const now = Date.now();
    const jobs = await this.repo.listEnabled();

    for (const job of jobs) {
      // Stop stale timer (it was paused during sleep and may be in invalid state)
      this.stopTimer(job.id);

      // Check if job was missed during sleep
      const nextRunAt = job.state.next_run_at_ms;
      if (nextRunAt && nextRunAt <= now) {
        console.log(`[CronService] Missed job "${job.name}" (was due at ${new Date(nextRunAt).toISOString()})`);

        // Update job state to reflect missed execution
        job.state.last_status = 'missed';
        job.state.last_error = i18n.t('cron:error.missedJob', {
          name: job.name,
          time: new Date(nextRunAt).toLocaleString(),
        });
        this.updateNextRunTime(job);
        await this.repo.update(job.id, { state: job.state });
        this.emitter.emitJobUpdated(job);

        // Insert a notification message into the conversation
        this.insertMissedJobMessage(job, nextRunAt);
      }

      // Restart timer with fresh schedule
      const latestJob = await this.repo.getById(job.id);
      if (latestJob && latestJob.enabled) {
        await this.startTimer(latestJob);
      }
    }
  }

  /**
   * Insert a notification message into the conversation to inform the user
   * about a missed scheduled task execution.
   */
  private insertMissedJobMessage(job: CronJob, scheduledAtMs: number): void {
    const { conversation_id } = job.metadata;
    const scheduledTime = new Date(scheduledAtMs).toLocaleString();
    const msgId = uuid();
    const content = i18n.t('cron:error.missedJob', {
      name: job.name,
      time: scheduledTime,
    });

    // Persist message to database
    const message: TMessage = {
      id: msgId,
      msg_id: msgId,
      type: 'tips',
      position: 'center',
      conversation_id: conversation_id,
      content: { content, type: 'warning' as const },
      created_at: Date.now(),
      status: 'finish',
    };
    addMessage(conversation_id, message);

    // Emit to frontend so it shows immediately if conversation is open
    ipcBridge.conversation.responseStream.emit({
      type: 'tips',
      conversation_id: conversation_id,
      msg_id: msgId,
      data: { content, type: 'warning' },
    });
  }

  /**
   * Manage powerSaveBlocker to keep the app alive while cron jobs are active.
   * Uses 'prevent-app-suspension' mode which prevents the app from being suspended
   * but does not prevent the display from sleeping.
   */
  private async updatePowerBlocker(): Promise<void> {
    const enabledJobs = await this.repo.listEnabled();
    const hasEnabledJobs = enabledJobs.length > 0;

    if (hasEnabledJobs && this.powerSaveBlockerId === null) {
      try {
        this.powerSaveBlockerId = getPlatformServices().power.preventSleep();
        console.log('[CronService] PowerSaveBlocker started (prevent-app-suspension)');
      } catch (error) {
        console.warn('[CronService] Failed to start powerSaveBlocker:', error);
      }
    } else if (!hasEnabledJobs && this.powerSaveBlockerId !== null) {
      try {
        getPlatformServices().power.allowSleep(this.powerSaveBlockerId);
        console.log('[CronService] PowerSaveBlocker stopped (no active jobs)');
      } catch (error) {
        console.warn('[CronService] Failed to stop powerSaveBlocker:', error);
      }
      this.powerSaveBlockerId = null;
    }
  }

  /**
   * Cleanup - stop all timers and release power blocker
   * Called on service shutdown
   */
  private cleanup(): void {
    for (const job_id of this.timers.keys()) {
      this.stopTimer(job_id);
    }
    this.timers.clear();
    this.retryTimers.clear();
    this.initialized = false;

    // Release power save blocker
    if (this.powerSaveBlockerId !== null) {
      try {
        getPlatformServices().power.allowSleep(this.powerSaveBlockerId);
      } catch {
        // Ignore errors during cleanup
      }
      this.powerSaveBlockerId = null;
    }
  }
}

// Re-export types
export type { CronJob, CronSchedule } from './CronStore';
