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
  conversationId: string;
  conversationTitle?: string;
  agentType: import('@/common/types/acpTypes').AgentBackend;
  createdBy: 'user' | 'agent';
  executionMode?: 'existing' | 'new_conversation';
  queueMode?: boolean;
  agentConfig?: import('./CronStore').CronJob['metadata']['agentConfig'];
};

type ExecuteJobOptions = {
  preserveNextRunAtMs?: boolean;
  preparedConversationId?: string;
  queuedRun?: boolean;
};

type QueueConversationState = {
  id: string;
  active: boolean;
};

type QueuedRunEntry = {
  job: CronJob;
  options: ExecuteJobOptions;
  preservedNextRunAtMs?: number;
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
  private queueTimers: Map<string, NodeJS.Timeout> = new Map();
  private retryCounts: Map<string, number> = new Map();
  private queuedRuns: Set<string> = new Set();
  private queuedRunEntries: Map<string, QueuedRunEntry> = new Map();
  private queuedRunOrder: string[] = [];
  private queueActive = false;
  private queueActiveConversationId: string | null = null;
  private queueReleaseConversationId: string | null = null;
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
        // Also skip when conversationId is empty (legacy jobs created before execution_mode existed).
        if (job.target.executionMode === 'new_conversation' || !job.metadata.conversationId) {
          continue;
        }
        const conversation = await this.conversationRepo.getConversation(job.metadata.conversationId);
        if (!conversation) {
          // Double-check: if the job has child conversations (via cronJobId), it's not truly orphaned.
          // This can happen when a job's original conversationId is stale but it has produced executions.
          const childConversations = await this.conversationRepo.getConversationsByCronJob(job.id);
          if (childConversations.length > 0) {
            console.log(
              `[CronService] Skipping orphan cleanup for "${job.name}" (${job.id}): has ${childConversations.length} child conversations`
            );
            continue;
          }
          console.log(
            `[CronService] Removing orphan job "${job.name}" (${job.id}): conversation ${job.metadata.conversationId} not found`
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
   * Backfill cronJobId into conversation.extra and agentConfig into job.metadata
   * for existing jobs that predate these fields.
   */
  private async backfillCronJobIdOnConversations(): Promise<void> {
    try {
      const allJobs = await this.repo.listAll();
      for (const job of allJobs) {
        if (job.target.executionMode === 'new_conversation' || !job.metadata.conversationId) {
          continue;
        }
        const conv = await this.conversationRepo.getConversation(job.metadata.conversationId);
        if (!conv) continue;

        // Backfill cronJobId on conversation extra
        const extra = (conv.extra ?? {}) as Record<string, unknown>;
        if (extra.cronJobId !== job.id) {
          extra.cronJobId = job.id;
          await this.conversationRepo.updateConversation(job.metadata.conversationId, {
            extra: extra as TChatConversation['extra'],
          });
        }

        // Backfill agentConfig and conversationTitle from conversation
        const needsAgentConfig = !job.metadata.agentConfig;
        const needsTitle = !job.metadata.conversationTitle && conv.name;
        if (needsAgentConfig || needsTitle) {
          const updates: Partial<CronJob> = {};
          const newMetadata = { ...job.metadata };
          if (needsAgentConfig) {
            const agentConfig = this.buildAgentConfigFromConversation(conv, job);
            if (agentConfig) newMetadata.agentConfig = agentConfig;
          }
          if (needsTitle) {
            newMetadata.conversationTitle = conv.name;
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
  ): CronJob['metadata']['agentConfig'] | null {
    const extra = (conv.extra ?? {}) as Record<string, unknown>;
    const backend = (extra.backend as string) || job.metadata.agentType;
    if (!backend) return null;

    return {
      backend: backend as import('@/common/types/acpTypes').AcpBackendAll,
      name: (extra.agentName as string) || job.name,
      cliPath: extra.cliPath as string | undefined,
      isPreset: !!extra.presetAssistantId,
      customAgentId: (extra.presetAssistantId as string) || (extra.customAgentId as string) || undefined,
      defaultFiles: Array.isArray(extra.defaultFiles)
        ? extra.defaultFiles.filter((file): file is string => typeof file === 'string' && file.length > 0)
        : undefined,
    };
  }

  /**
   * Add a new cron job
   * @throws Error if conversation already has a cron job (one job per conversation limit)
   */
  async addJob(params: CreateCronJobParams): Promise<CronJob> {
    // Check if conversation already has a cron job (one job per conversation limit)
    // Skip for new_conversation mode since each execution creates a new conversation
    if (params.executionMode !== 'new_conversation' && params.conversationId) {
      const existingJobs = await this.repo.listByConversation(params.conversationId);
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
    const jobId = `cron_${uuid()}`;

    const job: CronJob = {
      id: jobId,
      name: params.name,
      description: params.description?.trim() || undefined,
      enabled: true,
      schedule: params.schedule,
      target: {
        payload: { kind: 'message', text: params.prompt ?? params.message ?? '' },
        executionMode: params.executionMode ?? 'existing',
        queueMode: params.queueMode ?? false,
      },
      metadata: {
        conversationId: params.conversationId,
        conversationTitle: params.conversationTitle,
        agentType: params.agentType,
        createdBy: params.createdBy,
        createdAt: now,
        updatedAt: now,
        agentConfig: params.agentConfig,
      },
      state: {
        runCount: 0,
        retryCount: 0,
        maxRetries: 3,
      },
    };

    // Calculate next run time
    this.updateNextRunTime(job);

    // Save to database
    await this.repo.insert(job);

    // Tag the conversation with cronJobId so it appears under the scheduled tasks tab
    // and update modifyTime so it appears at the top of the list (skip for new_conversation mode)
    if (params.executionMode !== 'new_conversation' && params.conversationId) {
      try {
        const conv = await this.conversationRepo.getConversation(params.conversationId);
        const existingExtra = (conv?.extra ?? {}) as Record<string, unknown>;
        await this.conversationRepo.updateConversation(params.conversationId, {
          modifyTime: now,
          extra: { ...existingExtra, cronJobId: jobId } as TChatConversation['extra'],
        });
      } catch (err) {
        console.warn('[CronService] Failed to update conversation with cronJobId:', err);
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
  async updateJob(jobId: string, updates: Partial<CronJob>): Promise<CronJob> {
    const existing = await this.repo.getById(jobId);
    if (!existing) {
      throw new Error(`Job not found: ${jobId}`);
    }

    // Stop existing timer
    this.stopTimer(jobId);

    // Update in database
    await this.repo.update(jobId, updates);

    // Get updated job
    const updated = (await this.repo.getById(jobId))!;

    // Recalculate next run time if schedule changed or job is being enabled
    if (updates.schedule || (updates.enabled === true && !existing.enabled)) {
      this.updateNextRunTime(updated);
      await this.repo.update(jobId, { state: updated.state });
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
  async removeJob(jobId: string): Promise<void> {
    // Get job before deletion to access conversationId
    const job = await this.repo.getById(jobId);

    // Stop timer
    this.stopTimer(jobId);

    // Delete from database
    await this.repo.delete(jobId);

    // Clean up SKILL.md file
    try {
      await deleteCronSkillFile(jobId);
    } catch (err) {
      console.warn('[CronService] Failed to delete SKILL.md:', err);
    }

    // Clean up associated conversations.
    // Note: deleteConversation relies on SQLite ON DELETE CASCADE to remove
    // related messages rows — see migration v1 foreign key definition.
    if (job) {
      try {
        if (job.target.executionMode === 'new_conversation') {
          // Delete all child conversations created by this cron job
          const childConversations = await this.conversationRepo.getConversationsByCronJob(jobId);
          for (const conv of childConversations) {
            await this.conversationRepo.deleteConversation(conv.id);
            ipcBridge.conversation.listChanged.emit({
              conversationId: conv.id,
              action: 'deleted',
              source: conv.source || 'aionui',
            });
          }
          if (childConversations.length > 0) {
            console.log(`[CronService] Deleted ${childConversations.length} child conversations for job ${jobId}`);
          }
        } else if (job.metadata.conversationId) {
          // Remove cronJobId from the associated conversation's extra
          const conv = await this.conversationRepo.getConversation(job.metadata.conversationId);
          if (conv) {
            const existingExtra = (conv.extra ?? {}) as Record<string, unknown>;
            delete existingExtra.cronJobId;
            await this.conversationRepo.updateConversation(job.metadata.conversationId, {
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
    this.emitter.emitJobRemoved(jobId);
  }

  /**
   * Trigger a job to execute immediately (blocks until complete).
   * Used by scheduled timer execution.
   */
  async triggerJob(jobId: string): Promise<void> {
    const job = await this.repo.getById(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }
    await this.executeJob(job);
  }

  /**
   * Run a job now: create the conversation (if needed), then execute in background.
   * Returns the conversationId immediately so the frontend can navigate to it.
   */
  async runNow(jobId: string): Promise<string> {
    const job = await this.repo.getById(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }
    const conversationId = await this.executor.prepareConversation(job);
    // Fire-and-forget: execute in background, pass the prepared conversationId to skip re-creation
    void this.executeJob(job, { preparedConversationId: conversationId });
    return conversationId;
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
  async listJobsByConversation(conversationId: string): Promise<CronJob[]> {
    return this.repo.listByConversation(conversationId);
  }

  /**
   * Get a specific job
   */
  async getJob(jobId: string): Promise<CronJob | null> {
    return this.repo.getById(jobId);
  }

  /**
   * Manually run a cron job without affecting its existing schedule.
   */
  async runJobNow(jobId: string): Promise<CronJob> {
    const job = await this.repo.getById(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    await this.executeJob(job, { preserveNextRunAtMs: true });

    return (await this.repo.getById(jobId)) ?? job;
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
          job.state.nextRunAtMs = undefined;
          break;
        }

        try {
          const timer = new Cron(
            schedule.expr,
            {
              timezone: schedule.tz,
              startAt: schedule.startAtMs ? this.formatCronStartAt(schedule.startAtMs) : undefined,
              paused: false,
            },
            () => {
              void this.executeJob(job);
            }
          );
          this.timers.set(job.id, timer);

          // Sync nextRunAtMs with actual next run time and notify frontend
          const nextRun = timer.nextRun();
          job.state.nextRunAtMs = nextRun ? nextRun.getTime() : undefined;
        } catch (error) {
          console.error(`[CronService] Invalid cron expression "${schedule.expr}" for job "${job.name}":`, error);
          job.state.nextRunAtMs = undefined;
          job.state.lastStatus = 'error';
          job.state.lastError = `Invalid cron expression: ${schedule.expr}`;
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
        const nextRunAtMs = this.getNextEveryRunAtMs(schedule);
        const delay = Math.max(0, nextRunAtMs - Date.now());
        const timer = setTimeout(() => {
          void this.executeJob(job);

          const intervalTimer = setInterval(() => {
            void this.executeJob(job);
          }, schedule.everyMs);
          this.timers.set(job.id, intervalTimer);
        }, delay);
        this.timers.set(job.id, timer);

        // Sync nextRunAtMs with actual timer start time and notify frontend
        job.state.nextRunAtMs = nextRunAtMs;
        await this.repo.update(job.id, { state: job.state });
        this.emitter.emitJobUpdated(job);
        break;
      }

      case 'interval': {
        const nextRunAtMs = this.getNextIntervalRunAtMs(schedule);
        const delay = Math.max(0, nextRunAtMs - Date.now());
        const timer = setTimeout(() => {
          void this.handleIntervalTimer(job.id);
        }, delay);
        this.timers.set(job.id, timer);

        job.state.nextRunAtMs = nextRunAtMs;
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

          // Sync nextRunAtMs and notify frontend
          job.state.nextRunAtMs = schedule.atMs;
          await this.repo.update(job.id, { state: job.state });
          this.emitter.emitJobUpdated(job);
        } else {
          // Past one-time job, mark as expired and disable
          job.state.nextRunAtMs = undefined;
          job.state.lastStatus = 'skipped';
          job.state.lastError = i18n.t('cron:error.scheduledTimePassed');
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
  private stopTimer(jobId: string): void {
    const timer = this.timers.get(jobId);
    if (timer) {
      if (timer instanceof Cron) {
        timer.stop();
      } else {
        clearTimeout(timer);
        clearInterval(timer);
      }
      this.timers.delete(jobId);
    }

    // Also clear any retry timers
    const retryTimer = this.retryTimers.get(jobId);
    if (retryTimer) {
      clearTimeout(retryTimer);
      this.retryTimers.delete(jobId);
    }

    const queueTimer = this.queueTimers.get(jobId);
    if (queueTimer) {
      clearTimeout(queueTimer);
      this.queueTimers.delete(jobId);
    }

    // Clear retry count for this job
    this.retryCounts.delete(jobId);
    this.queuedRuns.delete(jobId);
    this.queuedRunEntries.delete(jobId);
    this.queuedRunOrder = this.queuedRunOrder.filter((queuedJobId) => queuedJobId !== jobId);
  }

  /**
   * Execute a job - send message to conversation
   * Handles conversation busy state with retries and power management
   */
  private async executeJob(job: CronJob, options: ExecuteJobOptions = {}): Promise<void> {
    const conversationId = options.preparedConversationId ?? job.metadata.conversationId;
    const preservedNextRunAtMs = options.preserveNextRunAtMs ? job.state.nextRunAtMs : undefined;
    const participatesInQueue = job.target.queueMode === true;

    if (participatesInQueue && !options.queuedRun) {
      const queueConversation = await this.getQueueConversationState(job, conversationId);
      if (this.queueActive || this.queuedRunOrder.length > 0 || queueConversation?.active) {
        await this.queueRunAfterIdle(
          job,
          options,
          this.queueActiveConversationId ?? queueConversation?.id,
          preservedNextRunAtMs
        );
        return;
      }
    }

    let queueAcquiredConversationId: string | undefined;
    if (participatesInQueue) {
      this.queueActive = true;
      this.queueActiveConversationId = null;
      this.queueReleaseConversationId = null;
    }

    // Check if conversation is busy
    const isBusy = this.executor.isConversationBusy(conversationId);
    if (isBusy) {
      if (participatesInQueue) {
        this.releaseQueueExecution();
      }
      const currentRetry = (this.retryCounts.get(job.id) ?? 0) + 1;
      this.retryCounts.set(job.id, currentRetry);

      if (currentRetry > (job.state.maxRetries || 3)) {
        // Max retries exceeded, skip this run
        this.retryCounts.delete(job.id);
        if (options.preserveNextRunAtMs) {
          job.state.nextRunAtMs = preservedNextRunAtMs;
        } else {
          this.updateNextRunTime(job);
        }
        await this.repo.update(job.id, {
          state: {
            ...job.state,
            lastStatus: 'skipped',
            lastError: i18n.t('cron:error.conversationBusy', {
              count: job.state.maxRetries || 3,
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
        void this.executeJob(job, options);
      }, 30000);
      this.retryTimers.set(job.id, retryTimer);
      return;
    }

    const lastRunAtMs = Date.now();
    const currentRunCount = (job.state.runCount ?? 0) + 1;
    let lastStatus: CronJob['state']['lastStatus'];
    let lastError: string | undefined;

    try {
      // executeJob marks the conversation busy only after task acquisition succeeds.
      // The onAcquired callback registers the completion notification while the
      // conversation is already busy, preventing premature onceIdle fires.
      const newConversationId = await this.executor.executeJob(
        job,
        (acquiredConversationId) => {
          queueAcquiredConversationId = acquiredConversationId;
          if (participatesInQueue) {
            this.queueActiveConversationId = acquiredConversationId;
            this.registerQueueRelease(acquiredConversationId);
          }
          this.registerCompletionNotification(job, acquiredConversationId);
        },
        options.preparedConversationId
      );

      if (participatesInQueue && !queueAcquiredConversationId) {
        this.releaseQueueExecution();
        void this.runNextQueuedJob();
      }

      // For "existing" mode: persist the newly created conversationId so subsequent executions reuse it
      if (newConversationId && job.target.executionMode === 'existing') {
        job.metadata.conversationId = newConversationId;
        await this.repo.update(job.id, {
          metadata: { ...job.metadata, conversationId: newConversationId },
        });
      }

      // Success
      this.retryCounts.delete(job.id);
      lastStatus = 'ok';
      lastError = undefined;

      // Update conversation modifyTime so it appears at the top of the list
      const activeConversationId = newConversationId || conversationId;
      try {
        await this.conversationRepo.updateConversation(activeConversationId, {
          modifyTime: Date.now(),
        });
      } catch (err) {
        console.warn('[CronService] Failed to update conversation modifyTime after execution:', err);
      }
    } catch (error) {
      if (participatesInQueue && !queueAcquiredConversationId) {
        this.releaseQueueExecution();
        void this.runNextQueuedJob();
      }
      // Error
      lastStatus = 'error';
      lastError = error instanceof Error ? error.message : String(error);
      console.error(`[CronService] Job ${job.id} failed:`, error);
    }

    // Update next run time
    if (options.preserveNextRunAtMs) {
      job.state.nextRunAtMs = preservedNextRunAtMs;
    } else {
      this.updateNextRunTime(job);
    }

    // Persist state as new object and notify frontend
    await this.repo.update(job.id, {
      state: {
        ...job.state,
        lastRunAtMs,
        runCount: currentRunCount,
        lastStatus,
        lastError,
      },
    });
    const updatedJob = await this.repo.getById(job.id);
    if (updatedJob) {
      this.emitter.emitJobUpdated(updatedJob);
    }
    this.emitter.emitJobExecuted(job.id, lastStatus, lastError);
  }

  private async getQueueConversationState(
    job: CronJob,
    fallbackConversationId: string
  ): Promise<QueueConversationState | undefined> {
    if (job.target.executionMode === 'new_conversation' || job.target.executionMode === 'existing') {
      const childConversations = await this.conversationRepo.getConversationsByCronJob(job.id);
      const latestChild = childConversations[0];
      if (latestChild?.id) {
        return {
          id: latestChild.id,
          active: this.executor.isConversationBusy(latestChild.id) || this.isConversationStatusActive(latestChild),
        };
      }
    }

    if (!fallbackConversationId) {
      return undefined;
    }

    return {
      id: fallbackConversationId,
      active: await this.isQueueConversationActive(fallbackConversationId),
    };
  }

  private async isQueueConversationActive(conversationId: string): Promise<boolean> {
    if (this.executor.isConversationBusy(conversationId)) {
      return true;
    }

    const conversation = await this.conversationRepo.getConversation(conversationId);
    return this.isConversationStatusActive(conversation);
  }

  private isConversationStatusActive(conversation: Pick<TChatConversation, 'status'> | null | undefined): boolean {
    return conversation?.status === 'running' || conversation?.status === 'pending';
  }

  private async queueRunAfterIdle(
    job: CronJob,
    options: ExecuteJobOptions,
    activeConversationId: string | null | undefined,
    preservedNextRunAtMs: number | undefined
  ): Promise<void> {
    const alreadyQueued = this.queuedRuns.has(job.id);
    if (!alreadyQueued) {
      this.queuedRuns.add(job.id);
      this.queuedRunOrder.push(job.id);
    }
    this.queuedRunEntries.set(job.id, { job, options, preservedNextRunAtMs });

    if (activeConversationId) {
      this.registerQueueRelease(activeConversationId);
    }

    if (options.preserveNextRunAtMs) {
      job.state.nextRunAtMs = preservedNextRunAtMs;
    } else {
      this.updateNextRunTime(job);
    }

    await this.repo.update(job.id, {
      state: {
        ...job.state,
        lastStatus: 'queued',
        lastError: i18n.t('cron:error.previousRunActive'),
      },
    });
    const queuedJob = await this.repo.getById(job.id);
    if (queuedJob) {
      this.emitter.emitJobUpdated(queuedJob);
    }
  }

  private registerQueueRelease(activeConversationId: string): void {
    if (this.queueReleaseConversationId === activeConversationId) {
      return;
    }
    this.queueReleaseConversationId = activeConversationId;
    this.executor.onceIdle(activeConversationId, () => this.runQueuedJobWhenIdle(activeConversationId));
  }

  private async runQueuedJobWhenIdle(activeConversationId: string): Promise<void> {
    if (await this.isQueueConversationActive(activeConversationId)) {
      const existingTimer = this.queueTimers.get(activeConversationId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const timer = setTimeout(() => {
        this.queueTimers.delete(activeConversationId);
        void this.runQueuedJobWhenIdle(activeConversationId);
      }, 30000);
      this.queueTimers.set(activeConversationId, timer);
      return;
    }

    this.releaseQueueExecution(activeConversationId);
    await this.runNextQueuedJob();
  }

  private releaseQueueExecution(activeConversationId?: string): void {
    if (
      activeConversationId &&
      this.queueActiveConversationId &&
      this.queueActiveConversationId !== activeConversationId
    ) {
      return;
    }

    this.queueActive = false;
    this.queueActiveConversationId = null;
    this.queueReleaseConversationId = null;
  }

  private async runNextQueuedJob(): Promise<void> {
    while (this.queuedRunOrder.length > 0) {
      const jobId = this.queuedRunOrder.shift()!;
      const entry = this.queuedRunEntries.get(jobId);
      if (!entry) {
        continue;
      }

      this.queuedRunEntries.delete(jobId);
      this.queuedRuns.delete(jobId);
      const latestJob = await this.repo.getById(jobId);
      const jobToRun = latestJob ?? entry.job;
      if (!jobToRun.enabled && !entry.options.preserveNextRunAtMs) {
        continue;
      }

      await this.executeJob(jobToRun, { ...entry.options, queuedRun: true });
      return;
    }
  }

  /**
   * Register a callback on executor to send notification when the agent finishes.
   * Must be called BEFORE sendMessage to avoid race conditions.
   */
  private registerCompletionNotification(job: CronJob, conversationId: string): void {
    this.executor.onceIdle(conversationId, async () => {
      // Check if cron notification is enabled
      const cronNotificationEnabled = await ProcessConfig.get('system.cronNotificationEnabled');
      if (!cronNotificationEnabled) return;

      await i18nReady;

      const title = i18n.t('cron.notification.scheduledTaskComplete', {
        title: job.metadata.conversationTitle || job.name,
      });
      const body = i18n.t('cron.notification.taskDone');

      this.emitter.showNotification({ title, body, conversationId }).catch((err) => {
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
          const cron = new Cron(schedule.expr, {
            timezone: schedule.tz,
            startAt: schedule.startAtMs ? this.formatCronStartAt(schedule.startAtMs) : undefined,
          });
          const next = cron.nextRun();
          job.state.nextRunAtMs = next ? next.getTime() : undefined;
        } catch {
          job.state.nextRunAtMs = undefined;
        }
        break;
      }

      case 'every': {
        job.state.nextRunAtMs = this.getNextEveryRunAtMs(schedule);
        break;
      }

      case 'interval': {
        job.state.nextRunAtMs = this.getNextIntervalRunAtMs(schedule);
        break;
      }

      case 'at': {
        job.state.nextRunAtMs = schedule.atMs > Date.now() ? schedule.atMs : undefined;
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
      const nextRunAt = job.state.nextRunAtMs;
      if (nextRunAt && nextRunAt <= now) {
        console.log(`[CronService] Missed job "${job.name}" (was due at ${new Date(nextRunAt).toISOString()})`);

        // Update job state to reflect missed execution
        job.state.lastStatus = 'missed';
        job.state.lastError = i18n.t('cron:error.missedJob', {
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
    const { conversationId } = job.metadata;
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
      conversation_id: conversationId,
      content: { content, type: 'warning' as const },
      createdAt: Date.now(),
      status: 'finish',
    };
    addMessage(conversationId, message);

    // Emit to frontend so it shows immediately if conversation is open
    ipcBridge.conversation.responseStream.emit({
      type: 'tips',
      conversation_id: conversationId,
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
    for (const jobId of this.timers.keys()) {
      this.stopTimer(jobId);
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

  private formatCronStartAt(startAtMs: number): string {
    const date = new Date(startAtMs);
    const pad = (value: number) => String(value).padStart(2, '0');

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  private getNextEveryRunAtMs(schedule: Extract<CronSchedule, { kind: 'every' }>): number {
    const now = Date.now();
    const anchor = schedule.startAtMs;

    if (!anchor) {
      return now + schedule.everyMs;
    }

    let nextRunAtMs = anchor;
    while (nextRunAtMs <= now) {
      nextRunAtMs += schedule.everyMs;
    }

    return nextRunAtMs;
  }

  private async handleIntervalTimer(jobId: string): Promise<void> {
    const job = await this.repo.getById(jobId);
    if (!job || !job.enabled || job.schedule.kind !== 'interval') {
      return;
    }

    await this.startTimer(job);
    await this.executeJob(job);
  }

  private getNextIntervalRunAtMs(schedule: Extract<CronSchedule, { kind: 'interval' }>): number {
    switch (schedule.intervalUnit) {
      case 'minute':
        return this.getNextAnchoredRunAtMs(schedule.startAtMs, schedule.intervalValue * 60 * 1000);
      case 'hour':
        return this.getNextAnchoredRunAtMs(schedule.startAtMs, schedule.intervalValue * 60 * 60 * 1000);
      case 'week':
        return this.getNextAnchoredRunAtMs(schedule.startAtMs, schedule.intervalValue * 7 * 24 * 60 * 60 * 1000);
      case 'workday':
        return this.getNextWorkdayRunAtMs(schedule.startAtMs, schedule.intervalValue);
    }
  }

  private getNextAnchoredRunAtMs(startAtMs: number, intervalMs: number): number {
    const now = Date.now();
    if (startAtMs > now) {
      return startAtMs;
    }

    let nextRunAtMs = startAtMs;
    while (nextRunAtMs <= now) {
      nextRunAtMs += intervalMs;
    }

    return nextRunAtMs;
  }

  private getNextWorkdayRunAtMs(startAtMs: number, intervalValue: number): number {
    const now = Date.now();
    let nextRunAtMs = this.alignToWorkday(startAtMs);

    if (nextRunAtMs > now) {
      return nextRunAtMs;
    }

    while (nextRunAtMs <= now) {
      nextRunAtMs = this.addWorkdays(nextRunAtMs, intervalValue);
    }

    return nextRunAtMs;
  }

  private alignToWorkday(timestampMs: number): number {
    const date = new Date(timestampMs);
    while (this.isWeekend(date)) {
      date.setDate(date.getDate() + 1);
    }
    return date.getTime();
  }

  private addWorkdays(timestampMs: number, workdays: number): number {
    const date = new Date(timestampMs);
    let remaining = Math.max(1, workdays);

    while (remaining > 0) {
      date.setDate(date.getDate() + 1);
      if (!this.isWeekend(date)) {
        remaining -= 1;
      }
    }

    return date.getTime();
  }

  private isWeekend(date: Date): boolean {
    const day = date.getDay();
    return day === 0 || day === 6;
  }
}

// Re-export types
export type { CronJob, CronSchedule } from './CronStore';
