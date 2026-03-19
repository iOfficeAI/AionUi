/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { cronStore, type CronJob } from './CronStore';
import type { ICronRepository } from './ICronRepository';

/** Thin delegation wrapper around the CronStore singleton. */
export class SqliteCronRepository implements ICronRepository {
  insert(job: CronJob): void {
    cronStore.insert(job);
  }

  update(jobId: string, updates: Partial<CronJob>): void {
    cronStore.update(jobId, updates);
  }

  delete(jobId: string): void {
    cronStore.delete(jobId);
  }

  getById(jobId: string): CronJob | null {
    return cronStore.getById(jobId);
  }

  listAll(): CronJob[] {
    return cronStore.listAll();
  }

  listEnabled(): CronJob[] {
    return cronStore.listEnabled();
  }

  listByConversation(conversationId: string): CronJob[] {
    return cronStore.listByConversation(conversationId);
  }

  deleteByConversation(conversationId: string): number {
    return cronStore.deleteByConversation(conversationId);
  }
}
