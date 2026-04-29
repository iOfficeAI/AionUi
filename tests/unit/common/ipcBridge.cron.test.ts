/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cron, type ICronJob } from '../../../src/common/adapter/ipcBridge';

describe('ipcBridge.cron', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({ data: null }),
        } as unknown as Response;
      })
    );
  });

  it('updateJob maps nested cron job updates to backend request fields', async () => {
    const updates: Partial<ICronJob> = {
      name: 'Updated task',
      enabled: true,
      schedule: {
        kind: 'cron',
        expr: '0 9 * * *',
        description: 'Every day at 9:00 AM',
      },
      target: {
        payload: { kind: 'message', text: 'Ping me daily' },
        execution_mode: 'new_conversation',
      },
      metadata: {
        conversation_id: 'conv-1',
        conversation_title: 'Daily checks',
        agent_type: 'aionrs',
        created_by: 'agent',
        created_at: 1,
        updated_at: 2,
        agent_config: {
          backend: 'aionrs',
          name: 'Aion',
          mode: 'full-auto',
        },
      },
      state: {
        run_count: 1,
        retry_count: 0,
        max_retries: 3,
      },
    };

    await cron.updateJob.invoke({ job_id: 'job-1', updates });

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/cron/jobs/job-1');
    expect(init!.method).toBe('PUT');
    expect(JSON.parse(init!.body as string)).toEqual({
      name: 'Updated task',
      enabled: true,
      schedule: {
        kind: 'cron',
        expr: '0 9 * * *',
        description: 'Every day at 9:00 AM',
      },
      message: 'Ping me daily',
      execution_mode: 'new_conversation',
      agent_config: {
        backend: 'aionrs',
        name: 'Aion',
        mode: 'full-auto',
      },
      conversation_title: 'Daily checks',
      max_retries: 3,
    });
  });

  it('deleteSkill targets the cron skill endpoint', async () => {
    await cron.deleteSkill.invoke({ job_id: 'job-42' });

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/api/cron/jobs/job-42/skill');
    expect(init!.method).toBe('DELETE');
    expect(init!.body).toBeUndefined();
  });

  it('hasSkill unwraps backend has_skill=false responses to false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({ data: { has_skill: false } }),
        } as unknown as Response;
      })
    );

    const result = await cron.hasSkill.invoke({ job_id: 'job-7' });

    expect(result).toBe(false);
  });

  it('hasSkill unwraps backend has_skill=true responses to true', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return {
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: async () => ({ data: { has_skill: true } }),
        } as unknown as Response;
      })
    );

    const result = await cron.hasSkill.invoke({ job_id: 'job-8' });

    expect(result).toBe(true);
  });
});
