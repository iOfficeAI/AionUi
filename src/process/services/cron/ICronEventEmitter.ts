/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CronJob } from './CronStore';

export interface ICronEventEmitter {
  emitJobCreated(job: CronJob): void;
  emitJobUpdated(job: CronJob): void;
  emitJobExecuted(job_id: string, status: 'ok' | 'error' | 'skipped' | 'missed', error?: string): void;
  emitJobRemoved(job_id: string): void;
  showNotification(params: { title: string; body: string; conversation_id: string }): Promise<void>;
}
