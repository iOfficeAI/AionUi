/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { uuid } from '@/common/utils';
import { getDatabase } from '@process/database';
import { Cron } from 'croner';
import WorkerManage from '../../WorkerManage';
import { copyFilesToDirectory } from '../../utils';
import { cronBusyGuard } from './CronBusyGuard';
import type { AcpBackendAll } from '@/types/acpTypes';
import { cronStore, type CronJob, type CronSchedule } from './CronStore';

/**
 * Parameters for creating a new cron job
 */
export interface CreateCronJobParams {
  name: string;
  schedule: CronSchedule;
  message: string;
  conversationId: string;
  conversationTitle?: string;
  agentType: AcpBackendAll;
  createdBy: 'user' | 'agent';
}

/**
 * CronService - Core scheduling service for AionUI
 *
 * Manages scheduled tasks that send messages to conversations at specified times.
 * Handles conflicts when conversation is busy.
 */
class CronService {
  private timers: Map<string, Cron | NodeJS.Timeout> = new Map();
  private retryTimers: Map<string, NodeJS.Timeout> = new Map();
  private initialized = false;

  /**
   * Initialize the cron service
   * Load all enabled jobs from database and start their timers
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      const jobs = cronStore.listEnabled();

      for (const job of jobs) {
        this.startTimer(job);
      }

      this.initialized = true;
    } catch (error) {
      console.error('[CronService] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Add a new cron job
   * @throws Error if conversation already has a cron job (one job per conversation limit)
   */
  async addJob(params: CreateCronJobParams): Promise<CronJob> {
    // Check if conversation already has a cron job (one job per conversation limit)
    const existingJobs = cronStore.listByConversation(params.conversationId);
    if (existingJobs.length > 0) {
      const existingJob = existingJobs[0];
      throw new Error(`This conversation already has a scheduled task "${existingJob.name}" (ID: ${existingJob.id}). Please delete it first before creating a new one, or use [CRON_LIST] to view existing tasks.`);
    }

    const now = Date.now();
    const jobId = `cron_${uuid()}`;

    const job: CronJob = {
      id: jobId,
      name: params.name,
      enabled: true,
      schedule: params.schedule,
      target: {
        payload: { kind: 'message', text: params.message },
      },
      metadata: {
        conversationId: params.conversationId,
        conversationTitle: params.conversationTitle,
        agentType: params.agentType,
        createdBy: params.createdBy,
        createdAt: now,
        updatedAt: now,
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
    cronStore.insert(job);

    // Update conversation modifyTime so it appears at the top of the list
    try {
      const db = getDatabase();
      db.updateConversation(params.conversationId, { modifyTime: now });
    } catch (err) {
      console.warn('[CronService] Failed to update conversation modifyTime:', err);
    }

    // Start timer
    this.startTimer(job);

    return job;
  }

  /**
   * Update an existing cron job
   */
  async updateJob(jobId: string, updates: Partial<CronJob>): Promise<CronJob> {
    const existing = cronStore.getById(jobId);
    if (!existing) {
      throw new Error(`Job not found: ${jobId}`);
    }

    // Stop existing timer
    this.stopTimer(jobId);

    // Update in database
    cronStore.update(jobId, updates);

    // Get updated job
    const updated = cronStore.getById(jobId)!;

    // Recalculate next run time if schedule changed or job is being enabled
    if (updates.schedule || (updates.enabled === true && !existing.enabled)) {
      this.updateNextRunTime(updated);
      cronStore.update(jobId, { state: updated.state });
    }

    // Restart timer if enabled
    if (updated.enabled) {
      this.startTimer(updated);
    }

    return updated;
  }

  /**
   * Remove a cron job
   */
  async removeJob(jobId: string): Promise<void> {
    // Stop timer
    this.stopTimer(jobId);

    // Delete from database
    cronStore.delete(jobId);
  }

  /**
   * List all cron jobs
   */
  async listJobs(): Promise<CronJob[]> {
    return cronStore.listAll();
  }

  /**
   * List cron jobs by conversation
   */
  async listJobsByConversation(conversationId: string): Promise<CronJob[]> {
    return cronStore.listByConversation(conversationId);
  }

  /**
   * Get a specific job
   */
  async getJob(jobId: string): Promise<CronJob | null> {
    return cronStore.getById(jobId);
  }

  /**
   * Start timer for a job
   */
  private startTimer(job: CronJob): void {
    // Stop existing timer if any
    this.stopTimer(job.id);

    const { schedule } = job;

    switch (schedule.kind) {
      case 'cron': {
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

        // Sync nextRunAtMs with actual next run time and notify frontend
        const nextRun = timer.nextRun();
        job.state.nextRunAtMs = nextRun ? nextRun.getTime() : undefined;
        cronStore.update(job.id, { state: job.state });
        ipcBridge.cron.onJobUpdated.emit(job);
        break;
      }

      case 'every': {
        const timer = setInterval(() => {
          void this.executeJob(job);
        }, schedule.everyMs);
        this.timers.set(job.id, timer);

        // Sync nextRunAtMs with actual timer start time and notify frontend
        job.state.nextRunAtMs = Date.now() + schedule.everyMs;
        cronStore.update(job.id, { state: job.state });
        ipcBridge.cron.onJobUpdated.emit(job);
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
          cronStore.update(job.id, { state: job.state });
          ipcBridge.cron.onJobUpdated.emit(job);
        } else {
          // Past one-time job, mark as expired and disable
          job.state.nextRunAtMs = undefined;
          job.state.lastStatus = 'skipped';
          job.state.lastError = 'Scheduled time has passed';
          job.enabled = false;
          cronStore.update(job.id, { enabled: false, state: job.state });
          ipcBridge.cron.onJobUpdated.emit(job);
        }
        break;
      }
    }
  }

  /**
   * Stop timer for a job
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
  }

  /**
   * Execute a job - send message to conversation
   */
  private async executeJob(job: CronJob): Promise<void> {
    const { conversationId } = job.metadata;

    // Check if conversation is busy
    const isBusy = cronBusyGuard.isProcessing(conversationId);
    if (isBusy) {
      job.state.retryCount++;

      if (job.state.retryCount > (job.state.maxRetries || 3)) {
        // Max retries exceeded, skip this run
        job.state.lastStatus = 'skipped';
        job.state.lastError = `Conversation busy after ${job.state.maxRetries || 3} retries`;
        job.state.retryCount = 0; // Reset for next trigger
        this.updateNextRunTime(job);
        cronStore.update(job.id, { state: job.state });
        ipcBridge.cron.onJobUpdated.emit(job);
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

    // Update state before execution
    job.state.lastRunAtMs = Date.now();
    job.state.runCount++;

    try {
      // Send message to conversation directly via WorkerManage (not IPC)
      // IPC invoke doesn't work in main process - it's for renderer->main communication
      const messageText = job.target.payload.text;
      const msgId = uuid();

      // Get or build task from WorkerManage
      // For cron jobs, we need yoloMode=true (auto-approve)
      // If task already exists, kill it and create new one with yoloMode=true
      // 对于定时任务，需要 yoloMode=true（自动批准）
      // 如果任务实例已存在，先 kill 它，再创建新的 yoloMode=true 实例
      let task;
      try {
        // Check if task already exists in memory
        const existingTask = WorkerManage.getTaskById(conversationId);
        if (existingTask) {
          // Kill existing task to ensure we get a fresh instance with yoloMode=true
          WorkerManage.kill(conversationId);
        }

        // Now create new task with yoloMode=true
        task = await WorkerManage.getTaskByIdRollbackBuild(conversationId, {
          yoloMode: true,
        });
      } catch (err) {
        job.state.lastStatus = 'error';
        job.state.lastError = err instanceof Error ? err.message : 'Conversation not found';
        this.updateNextRunTime(job);
        cronStore.update(job.id, { state: job.state });
        const updatedJob = cronStore.getById(job.id);
        if (updatedJob) {
          ipcBridge.cron.onJobUpdated.emit(updatedJob);
        }
        return;
      }

      if (!task) {
        job.state.lastStatus = 'error';
        job.state.lastError = 'Conversation not found';
        this.updateNextRunTime(job);
        cronStore.update(job.id, { state: job.state });
        const updatedJob = cronStore.getById(job.id);
        if (updatedJob) {
          ipcBridge.cron.onJobUpdated.emit(updatedJob);
        }
        return;
      }

      // Get workspace from task (all agent managers have this property)
      const workspace = (task as { workspace?: string }).workspace;

      // Copy files to workspace if needed (empty array for cron jobs)
      const workspaceFiles = workspace ? await copyFilesToDirectory(workspace, [], false) : [];

      // Call sendMessage directly on the task
      // Different agents use different parameter names: Gemini uses 'input', ACP/Codex use 'content'
      if (task.type === 'codex' || task.type === 'acp') {
        await task.sendMessage({ content: messageText, msg_id: msgId, files: workspaceFiles });
      } else {
        await task.sendMessage({ input: messageText, msg_id: msgId, files: workspaceFiles });
      }

      // Success
      job.state.lastStatus = 'ok';
      job.state.lastError = undefined;
      job.state.retryCount = 0;

      // Update conversation modifyTime so it appears at the top of the list
      try {
        const db = getDatabase();
        db.updateConversation(conversationId, {});
      } catch (err) {
        console.warn('[CronService] Failed to update conversation modifyTime after execution:', err);
      }
    } catch (error) {
      // Error
      job.state.lastStatus = 'error';
      job.state.lastError = error instanceof Error ? error.message : String(error);
      console.error(`[CronService] Job ${job.id} failed:`, error);
    }

    // Update next run time
    this.updateNextRunTime(job);

    // Persist state and notify frontend
    cronStore.update(job.id, { state: job.state });
    const updatedJob = cronStore.getById(job.id);
    if (updatedJob) {
      ipcBridge.cron.onJobUpdated.emit(updatedJob);
    }
  }

  /**
   * Update the next run time for a job
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
   * Cleanup - stop all timers
   */
  cleanup(): void {
    for (const jobId of this.timers.keys()) {
      this.stopTimer(jobId);
    }
    this.timers.clear();
    this.retryTimers.clear();
    this.initialized = false;
  }
}

// Singleton instance
export const cronService = new CronService();

// Re-export types
export type { CronJob, CronSchedule } from './CronStore';
