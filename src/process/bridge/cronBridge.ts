/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { cronService } from '@process/services/cron/CronService';

/**
 * Initialize cron IPC bridge handlers
 */
export function initCronBridge(): void {
  // Query handlers
  ipcBridge.cron.listJobs.provider(async () => {
    return cronService.listJobs();
  });

  ipcBridge.cron.listJobsByConversation.provider(async ({ conversationId }) => {
    return cronService.listJobsByConversation(conversationId);
  });

  ipcBridge.cron.getJob.provider(async ({ jobId }) => {
    return cronService.getJob(jobId);
  });

  // CRUD handlers
  ipcBridge.cron.addJob.provider(async (params) => {
    const job = await cronService.addJob(params);
    ipcBridge.cron.onJobCreated.emit(job);
    return job;
  });

  ipcBridge.cron.updateJob.provider(async ({ jobId, updates }) => {
    const job = await cronService.updateJob(jobId, updates);
    ipcBridge.cron.onJobUpdated.emit(job);
    return job;
  });

  ipcBridge.cron.removeJob.provider(async ({ jobId }) => {
    await cronService.removeJob(jobId);
    ipcBridge.cron.onJobRemoved.emit({ jobId });
  });
}
