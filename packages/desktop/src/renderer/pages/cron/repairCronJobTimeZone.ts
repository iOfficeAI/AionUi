/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { ICronJob } from '@/common/adapter/ipcBridge';
import { getCurrentCronTimeZone } from '@renderer/pages/cron/cronUtils';

const repairInFlight = new Map<string, Promise<ICronJob>>();
let repairAllInFlight: Promise<ICronJob[]> | null = null;

export function hasMissingCronTimeZone(job: ICronJob): job is ICronJob & {
  schedule: Extract<ICronJob['schedule'], { kind: 'cron' }>;
} {
  return job.schedule.kind === 'cron' && Boolean(job.schedule.expr.trim()) && !job.schedule.tz?.trim();
}

export async function repairCronJobTimeZone(job: ICronJob): Promise<ICronJob> {
  if (!hasMissingCronTimeZone(job)) {
    return job;
  }

  const existingRepair = repairInFlight.get(job.id);
  if (existingRepair) {
    return existingRepair;
  }

  const repairPromise = ipcBridge.cron.updateJob
    .invoke({
      job_id: job.id,
      updates: {
        schedule: {
          ...job.schedule,
          tz: getCurrentCronTimeZone(),
        },
      },
    })
    .catch((error) => {
      console.error('[cron] Failed to repair missing schedule timezone:', error);
      return job;
    })
    .finally(() => {
      repairInFlight.delete(job.id);
    });

  repairInFlight.set(job.id, repairPromise);
  return repairPromise;
}

export async function repairCronJobTimeZones(jobs: ICronJob[]): Promise<ICronJob[]> {
  return Promise.all(jobs.map((job) => repairCronJobTimeZone(job)));
}

export async function repairAllCronJobTimeZones(): Promise<ICronJob[]> {
  const jobs = await ipcBridge.cron.listJobs.invoke();
  return repairCronJobTimeZones(jobs || []);
}

export function repairAllCronJobTimeZonesOnce(): Promise<ICronJob[]> {
  if (repairAllInFlight) {
    return repairAllInFlight;
  }

  repairAllInFlight = repairAllCronJobTimeZones()
    .catch((error): ICronJob[] => {
      console.error('[cron] Failed to repair cron job timezones during app bootstrap:', error);
      return [];
    })
    .finally(() => {
      repairAllInFlight = null;
    });

  return repairAllInFlight;
}
