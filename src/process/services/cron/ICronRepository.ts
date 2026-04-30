/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CronConversationBinding, CronJob } from './CronStore';

export interface ICronRepository {
  insert(job: CronJob): Promise<void>;
  update(jobId: string, updates: Partial<CronJob>): Promise<void>;
  delete(jobId: string): Promise<void>;
  getById(jobId: string): Promise<CronJob | null>;
  listAll(): Promise<CronJob[]>;
  listEnabled(): Promise<CronJob[]>;
  listByConversation(conversationId: string): Promise<CronJob[]>;
  deleteByConversation(conversationId: string): Promise<number>;
  insertBinding(binding: CronConversationBinding): Promise<void>;
  deleteBinding(jobId: string, conversationId: string): Promise<number>;
  deleteBindingsByJob(jobId: string): Promise<number>;
  listBindingsByJob(jobId: string): Promise<CronConversationBinding[]>;
  listBindingsByConversation(conversationId: string): Promise<CronConversationBinding[]>;
  getDefaultBinding(jobId: string): Promise<CronConversationBinding | null>;
}
