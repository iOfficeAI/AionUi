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

  async update(jobId: string, updates: Partial<CronJob>): Promise<void> {
    await cronStore.update(jobId, updates);
  }

  async delete(jobId: string): Promise<void> {
    await cronStore.delete(jobId);
  }

  async getById(jobId: string): Promise<CronJob | null> {
    return cronStore.getById(jobId);
  }

  async listAll(): Promise<CronJob[]> {
    return cronStore.listAll();
  }

  async listEnabled(): Promise<CronJob[]> {
    return cronStore.listEnabled();
  }

  async listByConversation(conversationId: string): Promise<CronJob[]> {
    return cronStore.listByConversation(conversationId);
  }

  async deleteByConversation(conversationId: string): Promise<number> {
    return cronStore.deleteByConversation(conversationId);
  }
}
