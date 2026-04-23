/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { cronStore, type CronJob } from './CronStore';
import type { ICronRepository } from './ICronRepository';

/** Thin delegation wrapper around the CronStore singleton. */
export class SqliteCronRepository implements ICronRepository {
  async insert(job: CronJob): Promise<void> {
    await cronStore.insert(job);
  }

  async update(job_id: string, updates: Partial<CronJob>): Promise<void> {
    await cronStore.update(job_id, updates);
  }

  async delete(job_id: string): Promise<void> {
    await cronStore.delete(job_id);
  }

  async getById(job_id: string): Promise<CronJob | null> {
    return cronStore.getById(job_id);
  }

  async listAll(): Promise<CronJob[]> {
    return cronStore.listAll();
  }

  async listEnabled(): Promise<CronJob[]> {
    return cronStore.listEnabled();
  }

  async listByConversation(conversation_id: string): Promise<CronJob[]> {
    return cronStore.listByConversation(conversation_id);
  }

  async deleteByConversation(conversation_id: string): Promise<number> {
    return cronStore.deleteByConversation(conversation_id);
  }
}
