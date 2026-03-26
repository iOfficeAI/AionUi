/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICronJob } from '@/common/adapter/ipcBridge';

export type GlobalCronJobStatus = 'active' | 'paused' | 'error';

export function getGlobalCronJobStatus(job: ICronJob): GlobalCronJobStatus {
  if (!job.enabled) {
    return 'paused';
  }

  if (job.state.lastStatus === 'error') {
    return 'error';
  }

  return 'active';
}

export function filterGlobalCronJobs(jobs: ICronJob[], query: string, status: GlobalCronJobStatus | 'all'): ICronJob[] {
  const normalizedQuery = query.trim().toLowerCase();

  return jobs.filter((job) => {
    if (status !== 'all' && getGlobalCronJobStatus(job) !== status) {
      return false;
    }

    if (!normalizedQuery) {
      return true;
    }

    const haystacks = [
      job.name,
      job.target.payload.text,
      job.schedule.description,
      job.metadata.conversationTitle,
      job.metadata.conversationId,
      job.metadata.agentType,
      job.state.lastError,
    ];

    return haystacks.some((value) => value?.toLowerCase().includes(normalizedQuery));
  });
}

export function summarizeGlobalCronJobs(jobs: ICronJob[]) {
  return jobs.reduce(
    (summary, job) => {
      const status = getGlobalCronJobStatus(job);

      summary.total += 1;
      if (status === 'active') {
        summary.active += 1;
      } else if (status === 'paused') {
        summary.paused += 1;
      } else {
        summary.error += 1;
      }

      return summary;
    },
    {
      total: 0,
      active: 0,
      paused: 0,
      error: 0,
    }
  );
}
