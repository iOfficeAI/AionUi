/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CronJob } from './CronStore';

export interface ICronRepository {
  insert(job: CronJob): Promise<void>;
  update(job_id: string, updates: Partial<CronJob>): Promise<void>;
  delete(job_id: string): Promise<void>;
  getById(job_id: string): Promise<CronJob | null>;
  listAll(): Promise<CronJob[]>;
  listEnabled(): Promise<CronJob[]>;
  listByConversation(conversation_id: string): Promise<CronJob[]>;
  deleteByConversation(conversation_id: string): Promise<number>;
}
