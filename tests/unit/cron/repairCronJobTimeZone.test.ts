/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/common', () => ({
  ipcBridge: {
    cron: {
      listJobs: { invoke: vi.fn() },
      updateJob: { invoke: vi.fn() },
    },
  },
}));

const loadModule = async () => import('@/renderer/pages/cron/repairCronJobTimeZone');
const loadBridge = async () => import('@/common');
const originalDateTimeFormat = Intl.DateTimeFormat;

describe('repairCronJobTimeZone', () => {
  afterEach(() => {
    Intl.DateTimeFormat = originalDateTimeFormat;
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('repairs all cron jobs with missing timezone during bootstrap', async () => {
    Intl.DateTimeFormat = vi.fn(
      () =>
        ({
          resolvedOptions: () => ({ timeZone: 'Asia/Shanghai' }),
        }) as Intl.DateTimeFormat
    ) as unknown as typeof Intl.DateTimeFormat;
    const { ipcBridge } = await loadBridge();
    vi.mocked(ipcBridge.cron.listJobs.invoke).mockResolvedValue([
      {
        id: 'job-1',
        enabled: true,
        schedule: { kind: 'cron', expr: '0 9 * * *', description: 'Daily at 9 AM' },
        state: {},
        metadata: { conversation_id: 'conv-1' },
      } as never,
    ]);
    vi.mocked(ipcBridge.cron.updateJob.invoke).mockResolvedValue({
      id: 'job-1',
      enabled: true,
      schedule: { kind: 'cron', expr: '0 9 * * *', tz: 'Asia/Shanghai', description: 'Daily at 9 AM' },
      state: {},
      metadata: { conversation_id: 'conv-1' },
    } as never);

    const { repairAllCronJobTimeZones } = await loadModule();
    const repaired = await repairAllCronJobTimeZones();

    expect(ipcBridge.cron.listJobs.invoke).toHaveBeenCalledTimes(1);
    expect(ipcBridge.cron.updateJob.invoke).toHaveBeenCalledWith({
      job_id: 'job-1',
      updates: {
        schedule: {
          kind: 'cron',
          expr: '0 9 * * *',
          tz: 'Asia/Shanghai',
          description: 'Daily at 9 AM',
        },
      },
    });
    expect(repaired).toHaveLength(1);
  });

  it('deduplicates concurrent bootstrap repair requests', async () => {
    Intl.DateTimeFormat = vi.fn(
      () =>
        ({
          resolvedOptions: () => ({ timeZone: 'Asia/Shanghai' }),
        }) as Intl.DateTimeFormat
    ) as unknown as typeof Intl.DateTimeFormat;
    const { ipcBridge } = await loadBridge();
    let resolveListJobs: ((value: never[]) => void) | null = null;
    vi.mocked(ipcBridge.cron.listJobs.invoke).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveListJobs = resolve as (value: never[]) => void;
        })
    );

    const { repairAllCronJobTimeZonesOnce } = await loadModule();
    const first = repairAllCronJobTimeZonesOnce();
    const second = repairAllCronJobTimeZonesOnce();

    expect(first).toBe(second);
    expect(ipcBridge.cron.listJobs.invoke).toHaveBeenCalledTimes(1);

    resolveListJobs?.([]);
    await expect(first).resolves.toEqual([]);
  });
});
