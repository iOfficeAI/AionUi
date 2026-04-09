/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDatabase } from '@process/services/database';
import type { AcpBackendAll } from '@/common/types/acpTypes';

/**
 * Cron schedule types
 */
export type CronSchedule =
  | { kind: 'at'; atMs: number; description: string }
  | { kind: 'every'; everyMs: number; description: string }
  | { kind: 'cron'; expr: string; tz?: string; description: string };

/**
 * Cron job definition
 */
export type CronJob = {
  id: string;
  name: string;
  enabled: boolean;
  schedule: CronSchedule;
  target: {
    payload: { kind: 'message'; text: string };
    executionMode?: 'existing' | 'new_conversation';
  };
  metadata: {
    conversationId: string;
    conversationTitle?: string;
    agentType: AcpBackendAll;
    createdBy: 'user' | 'agent';
    createdAt: number;
    updatedAt: number;
    agentConfig?: {
      backend: AcpBackendAll;
      name: string;
      cliPath?: string;
      isPreset?: boolean;
      customAgentId?: string;
      presetAgentType?: string;
      mode?: string;
      modelId?: string;
      configOptions?: Record<string, string>;
      workspace?: string;
    };
  };
  state: {
    nextRunAtMs?: number;
    lastRunAtMs?: number;
    lastStatus?: 'ok' | 'error' | 'skipped' | 'missed';
    lastError?: string;
    runCount: number;
    retryCount: number;
    maxRetries: number;
  };
};

/**
 * Database row structure for cron_jobs table
 */
type CronJobRow = {
  id: string;
  name: string;
  enabled: number;
  schedule_kind: string;
  schedule_value: string;
  schedule_tz: string | null;
  schedule_description: string;
  payload_message: string;
  execution_mode: string | null;
  agent_config: string | null;
  conversation_id: string;
  conversation_title: string | null;
  agent_type: string;
  created_by: string;
  created_at: number;
  updated_at: number;
  next_run_at: number | null;
  last_run_at: number | null;
  last_status: string | null;
  last_error: string | null;
  run_count: number;
  retry_count: number;
  max_retries: number;
};

/**
 * Convert CronJob to database row
 */
function jobToRow(job: CronJob): CronJobRow {
  const { kind } = job.schedule;
  let scheduleValue: string;

  if (kind === 'at') {
    scheduleValue = String(job.schedule.atMs);
  } else if (kind === 'every') {
    scheduleValue = String(job.schedule.everyMs);
  } else {
    scheduleValue = job.schedule.expr;
  }

  return {
    id: job.id,
    name: job.name,
    enabled: job.enabled ? 1 : 0,
    schedule_kind: kind,
    schedule_value: scheduleValue,
    schedule_tz: kind === 'cron' ? (job.schedule.tz ?? null) : null,
    schedule_description: job.schedule.description,
    payload_message: job.target.payload.text,
    execution_mode: job.target.executionMode ?? 'existing',
    agent_config: job.metadata.agentConfig ? JSON.stringify(job.metadata.agentConfig) : null,
    conversation_id: job.metadata.conversationId,
    conversation_title: job.metadata.conversationTitle ?? null,
    agent_type: job.metadata.agentType,
    created_by: job.metadata.createdBy,
    created_at: job.metadata.createdAt,
    updated_at: job.metadata.updatedAt,
    next_run_at: job.state.nextRunAtMs ?? null,
    last_run_at: job.state.lastRunAtMs ?? null,
    last_status: job.state.lastStatus ?? null,
    last_error: job.state.lastError ?? null,
    run_count: job.state.runCount,
    retry_count: job.state.retryCount,
    max_retries: job.state.maxRetries,
  };
}

/**
 * Convert database row to CronJob
 */
function rowToJob(row: CronJobRow): CronJob {
  let schedule: CronSchedule;

  switch (row.schedule_kind) {
    case 'at':
      schedule = {
        kind: 'at',
        atMs: Number(row.schedule_value),
        description: row.schedule_description,
      };
      break;
    case 'every':
      schedule = {
        kind: 'every',
        everyMs: Number(row.schedule_value),
        description: row.schedule_description,
      };
      break;
    case 'cron':
    default:
      schedule = {
        kind: 'cron',
        expr: row.schedule_value,
        tz: row.schedule_tz ?? undefined,
        description: row.schedule_description,
      };
      break;
  }

  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled === 1,
    schedule,
    target: {
      payload: { kind: 'message', text: row.payload_message },
      executionMode: (row.execution_mode as 'existing' | 'new_conversation') ?? 'existing',
    },
    metadata: {
      conversationId: row.conversation_id,
      conversationTitle: row.conversation_title ?? undefined,
      agentType: row.agent_type as AcpBackendAll,
      createdBy: row.created_by as 'user' | 'agent',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      agentConfig: row.agent_config ? JSON.parse(row.agent_config) : undefined,
    },
    state: {
      nextRunAtMs: row.next_run_at ?? undefined,
      lastRunAtMs: row.last_run_at ?? undefined,
      lastStatus: row.last_status as 'ok' | 'error' | 'skipped' | 'missed' | undefined,
      lastError: row.last_error ?? undefined,
      runCount: row.run_count,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
    },
  };
}

/**
 * CronStore - Persistence layer for cron jobs
 */
class CronStore {
  /**
   * Insert a new cron job
   */
  async insert(job: CronJob): Promise<void> {
    const db = await getDatabase();
    const row = jobToRow(job);

    db.getDriver()
      .prepare(
        `
      INSERT INTO cron_jobs (
        id, name, enabled,
        schedule_kind, schedule_value, schedule_tz, schedule_description,
        payload_message, execution_mode, agent_config,
        conversation_id, conversation_title, agent_type, created_by,
        created_at, updated_at,
        next_run_at, last_run_at, last_status, last_error,
        run_count, retry_count, max_retries
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        row.id,
        row.name,
        row.enabled,
        row.schedule_kind,
        row.schedule_value,
        row.schedule_tz,
        row.schedule_description,
        row.payload_message,
        row.execution_mode,
        row.agent_config,
        row.conversation_id,
        row.conversation_title,
        row.agent_type,
        row.created_by,
        row.created_at,
        row.updated_at,
        row.next_run_at,
        row.last_run_at,
        row.last_status,
        row.last_error,
        row.run_count,
        row.retry_count,
        row.max_retries
      );
  }

  /**
   * Update an existing cron job
   */
  async update(jobId: string, updates: Partial<CronJob>): Promise<void> {
    const existing = await this.getById(jobId);
    if (!existing) {
      throw new Error(`Cron job not found: ${jobId}`);
    }

    const updated: CronJob = {
      ...existing,
      ...updates,
      metadata: {
        ...existing.metadata,
        ...updates.metadata,
        updatedAt: Date.now(),
      },
      state: {
        ...existing.state,
        ...updates.state,
      },
    };

    // Handle schedule update
    if (updates.schedule) {
      updated.schedule = updates.schedule;
    }

    const row = jobToRow(updated);
    const db = await getDatabase();

    db.getDriver()
      .prepare(
        `
      UPDATE cron_jobs SET
        name = ?, enabled = ?,
        schedule_kind = ?, schedule_value = ?, schedule_tz = ?, schedule_description = ?,
        payload_message = ?, execution_mode = ?, agent_config = ?,
        conversation_id = ?, conversation_title = ?, agent_type = ?,
        updated_at = ?,
        next_run_at = ?, last_run_at = ?, last_status = ?, last_error = ?,
        run_count = ?, retry_count = ?, max_retries = ?
      WHERE id = ?
    `
      )
      .run(
        row.name,
        row.enabled,
        row.schedule_kind,
        row.schedule_value,
        row.schedule_tz,
        row.schedule_description,
        row.payload_message,
        row.execution_mode,
        row.agent_config,
        row.conversation_id,
        row.conversation_title,
        row.agent_type,
        row.updated_at,
        row.next_run_at,
        row.last_run_at,
        row.last_status,
        row.last_error,
        row.run_count,
        row.retry_count,
        row.max_retries,
        jobId
      );
  }

  /**
   * Delete a cron job
   */
  async delete(jobId: string): Promise<void> {
    const db = await getDatabase();
    db.getDriver().prepare('DELETE FROM cron_jobs WHERE id = ?').run(jobId);
  }

  /**
   * Get a cron job by ID
   */
  async getById(jobId: string): Promise<CronJob | null> {
    const db = await getDatabase();
    const row = db.getDriver().prepare('SELECT * FROM cron_jobs WHERE id = ?').get(jobId) as CronJobRow | undefined;
    return row ? rowToJob(row) : null;
  }

  /**
   * List all cron jobs
   */
  async listAll(): Promise<CronJob[]> {
    const db = await getDatabase();
    const rows = db.getDriver().prepare('SELECT * FROM cron_jobs ORDER BY created_at DESC').all() as CronJobRow[];
    return rows.map(rowToJob);
  }

  /**
   * List cron jobs by conversation ID
   */
  async listByConversation(conversationId: string): Promise<CronJob[]> {
    const db = await getDatabase();
    const rows = db
      .getDriver()
      .prepare('SELECT * FROM cron_jobs WHERE conversation_id = ? ORDER BY created_at DESC')
      .all(conversationId) as CronJobRow[];
    return rows.map(rowToJob);
  }

  /**
   * List all enabled cron jobs
   */
  async listEnabled(): Promise<CronJob[]> {
    const db = await getDatabase();
    const rows = db
      .getDriver()
      .prepare('SELECT * FROM cron_jobs WHERE enabled = 1 ORDER BY next_run_at ASC')
      .all() as CronJobRow[];
    return rows.map(rowToJob);
  }

  /**
   * Delete all cron jobs for a conversation
   * Called when conversation is deleted
   */
  async deleteByConversation(conversationId: string): Promise<number> {
    const db = await getDatabase();
    const result = db.getDriver().prepare('DELETE FROM cron_jobs WHERE conversation_id = ?').run(conversationId);
    return result.changes;
  }
}

// Singleton instance
export const cronStore = new CronStore();
