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
import type { CronConversationBinding, CronJob, CronSchedule } from './CronStore';
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
  agentConfig?: import('./CronStore').CronJob['metadata']['agentConfig'];
};

/**
 * CronService - Core scheduling service for AionUI
 *
 * Manages scheduled tasks that send messages to conversations at specified times.
 * Handles conflicts when conversation is busy.
 */
export class CronService {
  private static readonly MAX_EXISTING_TARGET_CONCURRENCY = 4;

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
      await this.backfillCronJobBindings();

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
        if (job.target.executionMode === 'new_conversation') {
          continue;
        }

        const bindings = await this.repo.listBindingsByJob(job.id);
        let hasValidBinding = false;
        for (const binding of bindings) {
          const boundConversation = await this.conversationRepo.getConversation(binding.conversationId);
          if (boundConversation) {
            hasValidBinding = true;
            break;
          }
        }
        if (hasValidBinding || !job.metadata.conversationId) {
          continue;
        }

        const conversation = await this.conversationRepo.getConversation(job.metadata.conversationId);
        if (conversation) {
          continue;
        }

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
    } catch (error) {
      console.warn('[CronService] Failed to cleanup orphan jobs:', error);
    }
  }

  /**
   * Backfill binding rows for existing jobs created before v27.
   */
  private async backfillCronJobBindings(): Promise<void> {
    try {
      const allJobs = await this.repo.listAll();
      for (const job of allJobs) {
        if (job.target.executionMode === 'new_conversation' || !job.metadata.conversationId) {
          continue;
        }
        const conv = await this.conversationRepo.getConversation(job.metadata.conversationId);
        if (!conv) continue;

        const bindings = await this.repo.listBindingsByJob(job.id);
        if (!bindings.some((binding) => binding.conversationId === job.metadata.conversationId)) {
          await this.repo.insertBinding(this.buildBinding(job.id, conv, true, job.metadata.createdAt));
        }

        const needsTitle = !job.metadata.conversationTitle && conv.name;
        if (needsTitle) {
          await this.repo.update(job.id, {
            metadata: { ...job.metadata, conversationTitle: conv.name },
          });
        }
      }
    } catch (error) {
      console.warn('[CronService] Failed to backfill cron job data:', error);
    }
  }

  /**
   * Add a new cron job
   */
  async addJob(params: CreateCronJobParams): Promise<CronJob> {
    const now = Date.now();
    const jobId = `cron_${uuid()}`;

    const executionMode = params.executionMode ?? 'existing';
    const job: CronJob = {
      id: jobId,
      name: params.name,
      description: params.description?.trim() || undefined,
      enabled: true,
      schedule: params.schedule,
      target: {
        payload: { kind: 'message', text: params.prompt ?? params.message ?? '' },
        executionMode,
      },
      metadata: {
        conversationId: params.conversationId,
        conversationTitle: params.conversationTitle,
        agentType: params.agentType,
        createdBy: params.createdBy,
        createdAt: now,
        updatedAt: now,
        agentConfig: executionMode === 'new_conversation' ? params.agentConfig : undefined,
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

    if (executionMode !== 'new_conversation' && params.conversationId) {
      try {
        const conv = await this.conversationRepo.getConversation(params.conversationId);
        if (conv) {
          await this.repo.insertBinding(this.buildBinding(jobId, conv, true, now));
          await this.conversationRepo.updateConversation(params.conversationId, { modifyTime: now });
        }
      } catch (err) {
        console.warn('[CronService] Failed to bind conversation to cron job:', err);
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

    const normalizedUpdates = this.normalizeCronJobUpdates(existing, updates);

    // Update in database
    await this.repo.update(jobId, normalizedUpdates);

    // Get updated job
    const updated = (await this.repo.getById(jobId))!;

    // Recalculate next run time if schedule changed or job is being enabled
    if (normalizedUpdates.schedule || (normalizedUpdates.enabled === true && !existing.enabled)) {
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

  private normalizeCronJobUpdates(existing: CronJob, updates: Partial<CronJob>): Partial<CronJob> {
    const executionMode = updates.target?.executionMode ?? existing.target.executionMode ?? 'existing';
    if (executionMode === 'new_conversation') return updates;
    if (!updates.metadata?.agentConfig) return updates;

    const { agentConfig: _agentConfig, ...metadata } = updates.metadata;
    return { ...updates, metadata };
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
    await this.executeScheduledJob(job);
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

    if ((job.target.executionMode ?? 'existing') === 'existing') {
      const bindings = await this.repo.listBindingsByJob(job.id);
      if (bindings.length === 0) {
        throw new Error(i18n.t('cron:error.existingNoBindings'));
      }
      const conversationId = await this.resolveExecutionConversationId(job);
      void this.executeScheduledJob(job);
      return conversationId;
    }

    const conversationId = await this.executor.prepareConversation(job);
    // Fire-and-forget: execute in background, pass the prepared conversationId to skip re-creation
    void this.executeJob(job, conversationId);
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

  async listBindingsByConversation(conversationId: string): Promise<CronConversationBinding[]> {
    return this.repo.listBindingsByConversation(conversationId);
  }

  async listBindingsByJob(jobId: string): Promise<CronConversationBinding[]> {
    return this.repo.listBindingsByJob(jobId);
  }

  async bindConversation(jobId: string, conversationId: string): Promise<CronConversationBinding> {
    const job = await this.repo.getById(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    const conversation = await this.conversationRepo.getConversation(conversationId);
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`);
    }

    const existingBindings = await this.repo.listBindingsByJob(jobId);
    const existing = existingBindings.find((binding) => binding.conversationId === conversationId);
    if (existing) {
      const now = Date.now();
      const updatedBinding: CronConversationBinding = { ...existing, isDefaultTarget: true, updatedAt: now };
      await this.repo.insertBinding(updatedBinding);
      await this.conversationRepo.updateConversation(conversationId, { modifyTime: now });
      const updatedJob = await this.repo.getById(jobId);
      if (updatedJob) {
        this.emitter.emitJobUpdated(updatedJob);
      }
      return updatedBinding;
    }

    const now = Date.now();
    const binding = this.buildBinding(jobId, conversation, true, now);
    await this.repo.insertBinding(binding);
    await this.conversationRepo.updateConversation(conversationId, { modifyTime: now });
    const updatedJob = await this.repo.getById(jobId);
    if (updatedJob) {
      this.emitter.emitJobUpdated(updatedJob);
    }
    return binding;
  }

  async unbindConversation(jobId: string, conversationId: string): Promise<void> {
    await this.repo.deleteBinding(jobId, conversationId);
    await this.conversationRepo.updateConversation(conversationId, { modifyTime: Date.now() });
    const updatedJob = await this.repo.getById(jobId);
    if (updatedJob) {
      this.emitter.emitJobUpdated(updatedJob);
    }
  }

  /**
   * Get a specific job
   */
  async getJob(jobId: string): Promise<CronJob | null> {
    return this.repo.getById(jobId);
  }

  private buildBinding(
    jobId: string,
    conversation: TChatConversation,
    isDefaultTarget: boolean,
    timestamp = Date.now()
  ): CronConversationBinding {
    return {
      id: `binding_${uuid()}`,
      jobId,
      conversationId: conversation.id,
      conversationTitle: conversation.name,
      conversationSource: conversation.source,
      isDefaultTarget,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }

  private async resolveExecutionConversationId(job: CronJob): Promise<string> {
    if ((job.target.executionMode ?? 'existing') === 'existing') {
      const binding = await this.repo.getDefaultBinding(job.id);
      if (binding) return binding.conversationId;
    }
    return job.metadata.conversationId;
  }

  private getRetryKey(jobId: string, conversationId: string): string {
    return `${jobId}:${conversationId}`;
  }

  private async resolveBusyGuardConversationId(job: CronJob): Promise<string> {
    if (job.target.executionMode === 'new_conversation') {
      return job.metadata.conversationId;
    }
    return this.resolveExecutionConversationId(job);
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
              paused: false,
            },
            () => {
              void this.executeScheduledJob(job);
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
        const timer = setInterval(() => {
          void this.executeScheduledJob(job);
        }, schedule.everyMs);
        this.timers.set(job.id, timer);

        // Sync nextRunAtMs with actual timer start time and notify frontend
        job.state.nextRunAtMs = Date.now() + schedule.everyMs;
        await this.repo.update(job.id, { state: job.state });
        this.emitter.emitJobUpdated(job);
        break;
      }

      case 'at': {
        const delay = schedule.atMs - Date.now();
        if (delay > 0) {
          const timer = setTimeout(() => {
            void this.executeScheduledJob(job);
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

    for (const [key, retryTimer] of this.retryTimers) {
      if (key === jobId || key.startsWith(`${jobId}:`)) {
        clearTimeout(retryTimer);
        this.retryTimers.delete(key);
      }
    }

    for (const key of this.retryCounts.keys()) {
      if (key === jobId || key.startsWith(`${jobId}:`)) {
        this.retryCounts.delete(key);
      }
    }
  }

  private async executeScheduledJob(job: CronJob): Promise<void> {
    if ((job.target.executionMode ?? 'existing') !== 'existing') {
      await this.executeJob(job);
      return;
    }

    const bindings = await this.repo.listBindingsByJob(job.id);
    const conversationIds = bindings.length
      ? bindings.map((binding) => binding.conversationId)
      : [await this.resolveExecutionConversationId(job)];
    const uniqueConversationIds = [...new Set(conversationIds.filter(Boolean))];

    await this.runBounded(uniqueConversationIds, CronService.MAX_EXISTING_TARGET_CONCURRENCY, (conversationId) =>
      this.executeJob(job, conversationId)
    );
  }

  private async runBounded<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
    const queue = [...items];
    const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item === undefined) return;
        await worker(item);
      }
    });
    await Promise.all(workers);
  }

  /**
   * Execute a job - send message to conversation
   * Handles conversation busy state with retries and power management
   */
  private async executeJob(job: CronJob, preparedConversationId?: string): Promise<void> {
    const conversationId = preparedConversationId ?? (await this.resolveBusyGuardConversationId(job));
    const retryKey = this.getRetryKey(job.id, conversationId);

    // Check if conversation is busy
    const isBusy = this.executor.isConversationBusy(conversationId);
    if (isBusy) {
      const currentRetry = (this.retryCounts.get(retryKey) ?? 0) + 1;
      this.retryCounts.set(retryKey, currentRetry);

      if (currentRetry > (job.state.maxRetries || 3)) {
        // Max retries exceeded, skip this run
        this.retryCounts.delete(retryKey);
        this.updateNextRunTime(job);
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
        this.retryTimers.delete(retryKey);
        void this.executeJob(job, conversationId);
      }, 30000);
      this.retryTimers.set(retryKey, retryTimer);
      return;
    }

    const lastRunAtMs = Date.now();
    let lastStatus: CronJob['state']['lastStatus'];
    let lastError: string | undefined;

    try {
      // executeJob marks the conversation busy only after task acquisition succeeds.
      // The onAcquired callback registers the completion notification while the
      // conversation is already busy, preventing premature onceIdle fires.
      const executorConversationId =
        preparedConversationId ??
        ((job.target.executionMode ?? 'existing') === 'existing' ? conversationId : undefined);
      const newConversationId = await this.executor.executeJob(
        job,
        (acquiredConversationId) => {
          this.registerCompletionNotification(job, acquiredConversationId);
        },
        executorConversationId
      );

      // Success
      this.retryCounts.delete(retryKey);
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
      // Error
      lastStatus = 'error';
      lastError = error instanceof Error ? error.message : String(error);
      console.error(`[CronService] Job ${job.id} failed:`, error);
    }

    // Update next run time
    this.updateNextRunTime(job);

    const latestJob = await this.repo.getById(job.id);
    const latestState = latestJob?.state ?? job.state;

    // Persist state as new object and notify frontend
    await this.repo.update(job.id, {
      state: {
        ...latestState,
        nextRunAtMs: job.state.nextRunAtMs,
        lastRunAtMs,
        runCount: (latestState.runCount ?? job.state.runCount ?? 0) + 1,
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
          const cron = new Cron(schedule.expr, { timezone: schedule.tz });
          const next = cron.nextRun();
          job.state.nextRunAtMs = next ? next.getTime() : undefined;
        } catch {
          job.state.nextRunAtMs = undefined;
        }
        break;
      }

      case 'every': {
        job.state.nextRunAtMs = Date.now() + schedule.everyMs;
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
        const conversationId = await this.resolveExecutionConversationId(job);
        this.insertMissedJobMessage(job, nextRunAt, conversationId);
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
  private insertMissedJobMessage(job: CronJob, scheduledAtMs: number, conversationId: string): void {
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
}

// Re-export types
export type { CronJob, CronSchedule } from './CronStore';
