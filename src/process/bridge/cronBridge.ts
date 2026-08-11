/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { cronService } from '@process/services/cron/cronServiceSingleton';
import { writeRawCronSkillFile, hasCronSkillFile } from '@process/services/cron/cronSkillFile';

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
    return cronService.addJob(params);
  });

  ipcBridge.cron.updateJob.provider(async ({ jobId, updates }) => {
    return cronService.updateJob(jobId, updates);
  });

  ipcBridge.cron.removeJob.provider(async ({ jobId }) => {
    await cronService.removeJob(jobId);
  });

  ipcBridge.cron.runNow.provider(async ({ jobId }) => {
    // Create conversation (if needed) and return immediately.
    // Message sending runs in background; frontend navigates to the conversation.
    const conversationId = await cronService.runNow(jobId);
    return { conversationId };
  });

  ipcBridge.cron.runJobNow.provider(async ({ jobId }) => {
    return cronService.runJobNow(jobId);
  });

  // Skill management
  ipcBridge.cron.saveSkill.provider(async ({ jobId, content }) => {
    await writeRawCronSkillFile(jobId, content);
  });

  ipcBridge.cron.hasSkill.provider(async ({ jobId }) => {
    return hasCronSkillFile(jobId);
  });
}
