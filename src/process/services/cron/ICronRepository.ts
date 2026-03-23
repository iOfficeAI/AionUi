/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CronJob } from './CronStore';

export interface ICronRepository {
  insert(job: CronJob): void;
  update(jobId: string, updates: Partial<CronJob>): void;
  delete(jobId: string): void;
  getById(jobId: string): CronJob | null;
  listAll(): CronJob[];
  listEnabled(): CronJob[];
  listByConversation(conversationId: string): CronJob[];
  deleteByConversation(conversationId: string): number;
}
