/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getDatabase } from '@process/services/database';
import type { AgentBackend } from '@/common/types/acpTypes';

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
  description?: string;
  enabled: boolean;
  schedule: CronSchedule;
  target: {
    payload: { kind: 'message'; text: string };
    execution_mode?: 'existing' | 'new_conversation';
  };
  metadata: {
    conversation_id: string;
    conversation_title?: string;
    agent_type: AgentBackend;
    created_by: 'user' | 'agent';
    created_at: number;
    updated_at: number;
    agent_config?: {
      backend: AgentBackend;
      name: string;
      cli_path?: string;
      is_preset?: boolean;
      custom_agent_id?: string;
      preset_agent_type?: string;
      mode?: string;
      model_id?: string;
      config_options?: Record<string, string>;
      workspace?: string;
    };
  };
  state: {
    next_run_at_ms?: number;
    last_run_at_ms?: number;
    last_status?: 'ok' | 'error' | 'skipped' | 'missed';
    last_error?: string;
    run_count: number;
    retry_count: number;
    max_retries: number;
  };
};

/**
 * Database row structure for cron_jobs table
 */
type CronJobRow = {
  id: string;
  name: string;
  description: string | null;
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
    description: job.description ?? null,
    enabled: job.enabled ? 1 : 0,
    schedule_kind: kind,
    schedule_value: scheduleValue,
    schedule_tz: kind === 'cron' ? (job.schedule.tz ?? null) : null,
    schedule_description: job.schedule.description,
    payload_message: job.target.payload.text,
    execution_mode: job.target.execution_mode ?? 'existing',
    agent_config: job.metadata.agent_config ? JSON.stringify(job.metadata.agent_config) : null,
    conversation_id: job.metadata.conversation_id,
    conversation_title: job.metadata.conversation_title ?? null,
    agent_type: job.metadata.agent_type,
    created_by: job.metadata.created_by,
    created_at: job.metadata.created_at,
    updated_at: job.metadata.updated_at,
    next_run_at: job.state.next_run_at_ms ?? null,
    last_run_at: job.state.last_run_at_ms ?? null,
    last_status: job.state.last_status ?? null,
    last_error: job.state.last_error ?? null,
    run_count: job.state.run_count,
    retry_count: job.state.retry_count,
    max_retries: job.state.max_retries,
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
    description: row.description ?? undefined,
    enabled: row.enabled === 1,
    schedule,
    target: {
      payload: { kind: 'message', text: row.payload_message },
      execution_mode: (row.execution_mode as 'existing' | 'new_conversation') ?? 'existing',
    },
    metadata: {
      conversation_id: row.conversation_id,
      conversation_title: row.conversation_title ?? undefined,
      agent_type: row.agent_type as AgentBackend,
      created_by: row.created_by as 'user' | 'agent',
      created_at: row.created_at,
      updated_at: row.updated_at,
      agent_config: row.agent_config ? JSON.parse(row.agent_config) : undefined,
    },
    state: {
      next_run_at_ms: row.next_run_at ?? undefined,
      last_run_at_ms: row.last_run_at ?? undefined,
      last_status: row.last_status as 'ok' | 'error' | 'skipped' | 'missed' | undefined,
      last_error: row.last_error ?? undefined,
      run_count: row.run_count,
      retry_count: row.retry_count,
      max_retries: row.max_retries,
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
        id, name, description, enabled,
        schedule_kind, schedule_value, schedule_tz, schedule_description,
        payload_message, execution_mode, agent_config,
        conversation_id, conversation_title, agent_type, created_by,
        created_at, updated_at,
        next_run_at, last_run_at, last_status, last_error,
        run_count, retry_count, max_retries
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
      )
      .run(
        row.id,
        row.name,
        row.description,
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
  async update(job_id: string, updates: Partial<CronJob>): Promise<void> {
    const existing = await this.getById(job_id);
    if (!existing) {
      return;
    }

    const updated: CronJob = {
      ...existing,
      ...updates,
      metadata: {
        ...existing.metadata,
        ...updates.metadata,
        updated_at: Date.now(),
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
        name = ?, description = ?, enabled = ?,
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
        row.description,
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
        job_id
      );
  }

  /**
   * Delete a cron job
   */
  async delete(job_id: string): Promise<void> {
    const db = await getDatabase();
    db.getDriver().prepare('DELETE FROM cron_jobs WHERE id = ?').run(job_id);
  }

  /**
   * Get a cron job by ID
   */
  async getById(job_id: string): Promise<CronJob | null> {
    const db = await getDatabase();
    const row = db.getDriver().prepare('SELECT * FROM cron_jobs WHERE id = ?').get(job_id) as CronJobRow | undefined;
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
  async listByConversation(conversation_id: string): Promise<CronJob[]> {
    const db = await getDatabase();
    const rows = db
      .getDriver()
      .prepare('SELECT * FROM cron_jobs WHERE conversation_id = ? ORDER BY created_at DESC')
      .all(conversation_id) as CronJobRow[];
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
  async deleteByConversation(conversation_id: string): Promise<number> {
    const db = await getDatabase();
    const result = db.getDriver().prepare('DELETE FROM cron_jobs WHERE conversation_id = ?').run(conversation_id);
    return result.changes;
  }
}

// Singleton instance
export const cronStore = new CronStore();
