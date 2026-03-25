import { describe, expect, it } from 'vitest';
import type { ICronJob } from '@/common/adapter/ipcBridge';
import {
  filterGlobalCronJobs,
  getGlobalCronJobStatus,
  summarizeGlobalCronJobs,
} from '@/renderer/pages/cron/globalCronSettingsUtils';

const createJob = (overrides: Partial<ICronJob> = {}): ICronJob =>
  ({
    id: 'job-1',
    name: 'Daily summary',
    enabled: true,
    schedule: {
      kind: 'cron',
      expr: '0 9 * * *',
      description: 'Every day at 09:00',
    },
    target: {
      payload: {
        kind: 'message',
        text: 'Summarize the latest agent platform updates',
      },
    },
    metadata: {
      conversationId: 'conv-1',
      conversationTitle: 'Workspace Alpha',
      agentType: 'claude',
      createdBy: 'user',
      createdAt: 1,
      updatedAt: 1,
    },
    state: {
      runCount: 0,
      retryCount: 0,
      maxRetries: 3,
      ...overrides.state,
    },
    ...overrides,
  }) as ICronJob;

describe('getGlobalCronJobStatus', () => {
  it('returns paused when a job is disabled even if the last run failed', () => {
    expect(
      getGlobalCronJobStatus(
        createJob({
          enabled: false,
          state: {
            lastStatus: 'error',
            runCount: 1,
            retryCount: 0,
            maxRetries: 3,
          },
        })
      )
    ).toBe('paused');
  });

  it('returns error for enabled jobs with a failed last run', () => {
    expect(
      getGlobalCronJobStatus(
        createJob({
          state: {
            lastStatus: 'error',
            runCount: 2,
            retryCount: 1,
            maxRetries: 3,
          },
        })
      )
    ).toBe('error');
  });

  it('returns active for enabled jobs without an error state', () => {
    expect(
      getGlobalCronJobStatus(
        createJob({
          state: {
            lastStatus: 'ok',
            runCount: 5,
            retryCount: 0,
            maxRetries: 3,
          },
        })
      )
    ).toBe('active');
  });
});

describe('filterGlobalCronJobs', () => {
  const jobs = [
    createJob(),
    createJob({
      id: 'job-2',
      name: 'Paused review',
      enabled: false,
      metadata: {
        conversationId: 'conv-2',
        conversationTitle: 'Ops Project',
        agentType: 'codex',
        createdBy: 'user',
        createdAt: 1,
        updatedAt: 1,
      },
      target: {
        payload: {
          kind: 'message',
          text: 'Review pending fixes',
        },
      },
    }),
    createJob({
      id: 'job-3',
      name: 'Broken report',
      metadata: {
        conversationId: 'conv-3',
        conversationTitle: 'Gemini Workspace',
        agentType: 'gemini',
        createdBy: 'user',
        createdAt: 1,
        updatedAt: 1,
      },
      state: {
        lastStatus: 'error',
        lastError: 'CLI disconnected',
        runCount: 3,
        retryCount: 2,
        maxRetries: 3,
      },
    }),
  ];

  it('returns all jobs when the query is empty and status is all', () => {
    expect(filterGlobalCronJobs(jobs, '', 'all')).toEqual(jobs);
  });

  it('filters by derived status', () => {
    expect(filterGlobalCronJobs(jobs, '', 'paused').map((job) => job.id)).toEqual(['job-2']);
    expect(filterGlobalCronJobs(jobs, '', 'error').map((job) => job.id)).toEqual(['job-3']);
    expect(filterGlobalCronJobs(jobs, '', 'active').map((job) => job.id)).toEqual(['job-1']);
  });

  it('matches against name, message, conversation info, agent type, and last error', () => {
    expect(filterGlobalCronJobs(jobs, 'review', 'all').map((job) => job.id)).toEqual(['job-2']);
    expect(filterGlobalCronJobs(jobs, 'workspace alpha', 'all').map((job) => job.id)).toEqual(['job-1']);
    expect(filterGlobalCronJobs(jobs, 'gemini', 'all').map((job) => job.id)).toEqual(['job-3']);
    expect(filterGlobalCronJobs(jobs, 'disconnected', 'all').map((job) => job.id)).toEqual(['job-3']);
  });

  it('returns an empty list when no jobs match the current query', () => {
    expect(filterGlobalCronJobs(jobs, 'missing', 'all')).toEqual([]);
  });
});

describe('summarizeGlobalCronJobs', () => {
  it('counts jobs across active, paused, and error buckets', () => {
    const jobs = [
      createJob(),
      createJob({ id: 'job-2', enabled: false }),
      createJob({
        id: 'job-3',
        state: {
          lastStatus: 'error',
          runCount: 1,
          retryCount: 0,
          maxRetries: 3,
        },
      }),
    ];

    expect(summarizeGlobalCronJobs(jobs)).toEqual({
      total: 3,
      active: 1,
      paused: 1,
      error: 1,
    });
  });

  it('returns zero counts for an empty list', () => {
    expect(summarizeGlobalCronJobs([])).toEqual({
      total: 0,
      active: 0,
      paused: 0,
      error: 0,
    });
  });
});
