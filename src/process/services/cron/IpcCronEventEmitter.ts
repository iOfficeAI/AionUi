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

  emitJobExecuted(jobId: string, status: 'ok' | 'error' | 'skipped' | 'missed', error?: string): void {
    ipcBridge.cron.onJobExecuted.emit({ jobId, status, error });
  }

  emitJobRemoved(jobId: string): void {
    ipcBridge.cron.onJobRemoved.emit({ jobId });
  }

  async showNotification(params: { title: string; body: string; conversationId: string }): Promise<void> {
    return showNotification(params);
  }
}
