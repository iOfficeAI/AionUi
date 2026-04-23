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

  ipcBridge.cron.listJobsByConversation.provider(async ({ conversation_id }) => {
    return cronService.listJobsByConversation(conversation_id);
  });

  ipcBridge.cron.getJob.provider(async ({ job_id }) => {
    return cronService.getJob(job_id);
  });

  // CRUD handlers
  ipcBridge.cron.addJob.provider(async (params) => {
    return cronService.addJob(params);
  });

  ipcBridge.cron.updateJob.provider(async ({ job_id, updates }) => {
    return cronService.updateJob(job_id, updates);
  });

  ipcBridge.cron.removeJob.provider(async ({ job_id }) => {
    await cronService.removeJob(job_id);
  });

  ipcBridge.cron.runNow.provider(async ({ job_id }) => {
    // Create conversation (if needed) and return immediately.
    // Message sending runs in background; frontend navigates to the conversation.
    const conversation_id = await cronService.runNow(job_id);
    return { conversation_id };
  });

  // Skill management
  ipcBridge.cron.saveSkill.provider(async ({ job_id, content }) => {
    await writeRawCronSkillFile(job_id, content);
  });

  ipcBridge.cron.hasSkill.provider(async ({ job_id }) => {
    return hasCronSkillFile(job_id);
  });
}
