/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { showNotification } from '@process/bridge/notificationBridge';
import type { CronJob } from './CronStore';
import type { ICronEventEmitter } from './ICronEventEmitter';

/** Emits cron events via ipcBridge.cron.* and delegates notifications to showNotification. */
export class IpcCronEventEmitter implements ICronEventEmitter {
  emitJobCreated(job: CronJob): void {
    ipcBridge.cron.onJobCreated.emit(job);
  }

  emitJobUpdated(job: CronJob): void {
    ipcBridge.cron.onJobUpdated.emit(job);
  }

  emitJobExecuted(job_id: string, status: 'ok' | 'error' | 'skipped' | 'missed', error?: string): void {
    ipcBridge.cron.onJobExecuted.emit({ job_id, status, error });
  }

  emitJobRemoved(job_id: string): void {
    ipcBridge.cron.onJobRemoved.emit({ job_id });
  }

  async showNotification(params: { title: string; body: string; conversation_id: string }): Promise<void> {
    return showNotification(params);
  }
}
