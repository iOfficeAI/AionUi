/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import {
  useCronJobs,
  useAllCronJobs,
  useCronJobsMap,
  useCronJobConversations,
} from '@/renderer/pages/cron/useCronJobs';
import { ipcBridge } from '@/common';
import { emitter } from '@/renderer/utils/emitter';
import type { ICronJob } from '@/common/adapter/ipcBridge';
import type { TChatConversation } from '@/common/config/storage';

const originalDateTimeFormat = Intl.DateTimeFormat;

vi.mock('@/common', () => ({
  ipcBridge: {
    cron: {
      listJobsByConversation: { invoke: vi.fn() },
      listJobs: { invoke: vi.fn() },
      updateJob: { invoke: vi.fn() },
      removeJob: { invoke: vi.fn() },
      onJobCreated: { on: vi.fn() },
      onJobUpdated: { on: vi.fn() },
      onJobRemoved: { on: vi.fn() },
      onJobExecuted: { on: vi.fn() },
    },
    conversation: {
      listByCronJob: { invoke: vi.fn() },
      update: { invoke: vi.fn() },
      listChanged: { on: vi.fn() },
    },
  },
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    emit: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
}));

const mockJob = (overrides?: Partial<ICronJob>): ICronJob => ({
  id: 'job-1',
  enabled: true,
  schedule: { kind: 'cron', expr: '0 9 * * *', tz: 'Asia/Shanghai', description: 'Daily at 9 AM' },
  action: { command: 'test' },
  state: {
    last_status: 'success',
    last_run_at_ms: Date.now(),
    next_run_at_ms: Date.now() + 86400000,
  },
  metadata: {
    conversation_id: 'conv-1',
    created_at_ms: Date.now(),
  },
  ...overrides,
});

const mockConversation = (id: string): TChatConversation => ({
  id,
  title: `Conversation ${id}`,
  modifyTime: Date.now(),
  createTime: Date.now(),
  modelType: 'gpt-4',
  isTop: false,
  messageCollections: [],
  searchType: 'ai',
  searchScope: 'default',
  searchEngine: 'builtin',
});

describe('useCronJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(ipcBridge.conversation.listByCronJob.invoke).mockResolvedValue([]);
    vi.mocked(ipcBridge.conversation.update.invoke).mockResolvedValue(true);
    Intl.DateTimeFormat = vi.fn(
      () =>
        ({
          resolvedOptions: () => ({ timeZone: 'Asia/Shanghai' }),
        }) as Intl.DateTimeFormat
    ) as unknown as typeof Intl.DateTimeFormat;
  });

  afterEach(() => {
    Intl.DateTimeFormat = originalDateTimeFormat;
  });

  it('fetches jobs on mount with valid conversation_id', async () => {
    const jobs = [mockJob(), mockJob({ id: 'job-2' })];
    vi.mocked(ipcBridge.cron.listJobsByConversation.invoke).mockResolvedValue(jobs);
    vi.mocked(ipcBridge.cron.onJobCreated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobUpdated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobRemoved.on).mockReturnValue(() => {});

    const { result } = renderHook(() => useCronJobs('conv-1'));

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(ipcBridge.cron.listJobsByConversation.invoke).toHaveBeenCalledWith({
      conversation_id: 'conv-1',
    });
    expect(result.current.jobs).toEqual(jobs);
    expect(result.current.hasJobs).toBe(true);
    expect(result.current.activeJobsCount).toBe(2);
    expect(result.current.hasError).toBe(false);
    expect(ipcBridge.cron.updateJob.invoke).not.toHaveBeenCalled();
  });

  it('repairs missing cron timezone on conversation fetch', async () => {
    const jobWithoutTz = mockJob({
      schedule: { kind: 'cron', expr: '0 9 * * *', description: 'Daily at 9 AM' },
    });
    const repairedJob = mockJob();
    vi.mocked(ipcBridge.cron.listJobsByConversation.invoke).mockResolvedValue([jobWithoutTz]);
    vi.mocked(ipcBridge.cron.updateJob.invoke).mockResolvedValue(repairedJob);
    vi.mocked(ipcBridge.cron.onJobCreated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobUpdated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobRemoved.on).mockReturnValue(() => {});

    const { result } = renderHook(() => useCronJobs('conv-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

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
    expect(result.current.jobs).toEqual([repairedJob]);
  });

  it('sets empty jobs when conversation_id is undefined', async () => {
    vi.mocked(ipcBridge.cron.onJobCreated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobUpdated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobRemoved.on).mockReturnValue(() => {});

    const { result } = renderHook(() => useCronJobs(undefined));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(ipcBridge.cron.listJobsByConversation.invoke).not.toHaveBeenCalled();
    expect(result.current.jobs).toEqual([]);
  });

  it('handles fetch error', async () => {
    const error = new Error('Network error');
    vi.mocked(ipcBridge.cron.listJobsByConversation.invoke).mockRejectedValue(error);
    vi.mocked(ipcBridge.cron.onJobCreated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobUpdated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobRemoved.on).mockReturnValue(() => {});

    const { result } = renderHook(() => useCronJobs('conv-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toEqual(error);
    expect(result.current.jobs).toEqual([]);
  });

  it('detects error status in jobs', async () => {
    const jobs = [mockJob({ state: { last_status: 'error' } as any })];
    vi.mocked(ipcBridge.cron.listJobsByConversation.invoke).mockResolvedValue(jobs);
    vi.mocked(ipcBridge.cron.onJobCreated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobUpdated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobRemoved.on).mockReturnValue(() => {});

    const { result } = renderHook(() => useCronJobs('conv-1'));

    await waitFor(() => expect(result.current.hasError).toBe(true));
  });

  it('pauses job and invokes callback', async () => {
    const jobs = [mockJob()];
    const updatedJob = mockJob({ enabled: false });
    vi.mocked(ipcBridge.cron.listJobsByConversation.invoke).mockResolvedValue(jobs);
    vi.mocked(ipcBridge.cron.updateJob.invoke).mockResolvedValue(updatedJob);
    vi.mocked(ipcBridge.cron.onJobCreated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobUpdated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobRemoved.on).mockReturnValue(() => {});

    const { result } = renderHook(() => useCronJobs('conv-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.pauseJob('job-1');

    expect(ipcBridge.cron.updateJob.invoke).toHaveBeenCalledWith({
      job_id: 'job-1',
      updates: { enabled: false },
    });
  });

  it('resumes job', async () => {
    const jobs = [mockJob({ enabled: false })];
    const updatedJob = mockJob({ enabled: true });
    vi.mocked(ipcBridge.cron.listJobsByConversation.invoke).mockResolvedValue(jobs);
    vi.mocked(ipcBridge.cron.updateJob.invoke).mockResolvedValue(updatedJob);
    vi.mocked(ipcBridge.cron.onJobCreated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobUpdated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobRemoved.on).mockReturnValue(() => {});

    const { result } = renderHook(() => useCronJobs('conv-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.resumeJob('job-1');

    expect(ipcBridge.cron.updateJob.invoke).toHaveBeenCalledWith({
      job_id: 'job-1',
      updates: { enabled: true },
    });
  });

  it('deletes job', async () => {
    const jobs = [mockJob()];
    vi.mocked(ipcBridge.cron.listJobsByConversation.invoke).mockResolvedValue(jobs);
    vi.mocked(ipcBridge.cron.removeJob.invoke).mockResolvedValue(undefined);
    vi.mocked(ipcBridge.cron.onJobCreated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobUpdated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobRemoved.on).mockReturnValue(() => {});

    const { result } = renderHook(() => useCronJobs('conv-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.deleteJob('job-1');

    expect(ipcBridge.cron.removeJob.invoke).toHaveBeenCalledWith({ job_id: 'job-1' });
  });

  it('updates job', async () => {
    const jobs = [mockJob()];
    const updatedJob = mockJob({ enabled: false });
    vi.mocked(ipcBridge.cron.listJobsByConversation.invoke).mockResolvedValue(jobs);
    vi.mocked(ipcBridge.cron.updateJob.invoke).mockResolvedValue(updatedJob);
    vi.mocked(ipcBridge.cron.onJobCreated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobUpdated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobRemoved.on).mockReturnValue(() => {});

    const { result } = renderHook(() => useCronJobs('conv-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const updated = await result.current.updateJob('job-1', { enabled: false });

    expect(ipcBridge.cron.updateJob.invoke).toHaveBeenCalledWith({
      job_id: 'job-1',
      updates: { enabled: false },
    });
    expect(updated).toEqual(updatedJob);
  });

  it('subscribes to events and handles onJobCreated', async () => {
    let onJobCreatedHandler: ((job: ICronJob) => void) | null = null;
    vi.mocked(ipcBridge.cron.listJobsByConversation.invoke).mockResolvedValue([]);
    vi.mocked(ipcBridge.cron.onJobCreated.on).mockImplementation((handler) => {
      onJobCreatedHandler = handler;
      return () => {};
    });
    vi.mocked(ipcBridge.cron.onJobUpdated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobRemoved.on).mockReturnValue(() => {});

    const { result } = renderHook(() => useCronJobs('conv-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    const newJob = mockJob({ id: 'job-new' });
    onJobCreatedHandler!(newJob);

    await waitFor(() => expect(result.current.jobs).toEqual([newJob]));
  });

  it('does not add duplicate job on onJobCreated', async () => {
    const existingJob = mockJob();
    let onJobCreatedHandler: ((job: ICronJob) => void) | null = null;
    vi.mocked(ipcBridge.cron.listJobsByConversation.invoke).mockResolvedValue([existingJob]);
    vi.mocked(ipcBridge.cron.onJobCreated.on).mockImplementation((handler) => {
      onJobCreatedHandler = handler;
      return () => {};
    });
    vi.mocked(ipcBridge.cron.onJobUpdated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobRemoved.on).mockReturnValue(() => {});

    const { result } = renderHook(() => useCronJobs('conv-1'));

    await waitFor(() => expect(result.current.jobs).toEqual([existingJob]));

    onJobCreatedHandler!(existingJob);

    await waitFor(() => expect(result.current.jobs).toHaveLength(1));
  });

  it('handles onJobUpdated', async () => {
    const job = mockJob();
    let onJobUpdatedHandler: ((job: ICronJob) => void) | null = null;
    vi.mocked(ipcBridge.cron.listJobsByConversation.invoke).mockResolvedValue([job]);
    vi.mocked(ipcBridge.cron.onJobCreated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobUpdated.on).mockImplementation((handler) => {
      onJobUpdatedHandler = handler;
      return () => {};
    });
    vi.mocked(ipcBridge.cron.onJobRemoved.on).mockReturnValue(() => {});

    const { result } = renderHook(() => useCronJobs('conv-1'));

    await waitFor(() => expect(result.current.jobs).toEqual([job]));

    const updatedJob = mockJob({ enabled: false });
    onJobUpdatedHandler!(updatedJob);

    await waitFor(() => expect(result.current.jobs).toEqual([updatedJob]));
  });

  it('handles onJobRemoved', async () => {
    const job = mockJob();
    let onJobRemovedHandler: ((data: { job_id: string }) => void) | null = null;
    vi.mocked(ipcBridge.cron.listJobsByConversation.invoke).mockResolvedValue([job]);
    vi.mocked(ipcBridge.cron.onJobCreated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobUpdated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobRemoved.on).mockImplementation((handler) => {
      onJobRemovedHandler = handler;
      return () => {};
    });

    const { result } = renderHook(() => useCronJobs('conv-1'));

    await waitFor(() => expect(result.current.jobs).toEqual([job]));

    onJobRemovedHandler!({ job_id: 'job-1' });

    await waitFor(() => expect(result.current.jobs).toEqual([]));
  });
});

describe('useAllCronJobs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Intl.DateTimeFormat = vi.fn(
      () =>
        ({
          resolvedOptions: () => ({ timeZone: 'Asia/Shanghai' }),
        }) as Intl.DateTimeFormat
    ) as unknown as typeof Intl.DateTimeFormat;
  });

  afterEach(() => {
    Intl.DateTimeFormat = originalDateTimeFormat;
  });

  it('fetches all jobs on mount', async () => {
    const jobs = [mockJob(), mockJob({ id: 'job-2', metadata: { conversation_id: 'conv-2' } } as any)];
    vi.mocked(ipcBridge.cron.listJobs.invoke).mockResolvedValue(jobs);
    vi.mocked(ipcBridge.cron.onJobCreated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobUpdated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobRemoved.on).mockReturnValue(() => {});

    const { result } = renderHook(() => useAllCronJobs());

    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(ipcBridge.cron.listJobs.invoke).toHaveBeenCalled();
    expect(result.current.jobs).toEqual(jobs);
    expect(result.current.activeCount).toBe(2);
    expect(result.current.hasError).toBe(false);
    expect(ipcBridge.cron.updateJob.invoke).not.toHaveBeenCalled();
  });

  it('repairs missing cron timezone on all-jobs fetch', async () => {
    const jobWithoutTz = mockJob({
      schedule: { kind: 'cron', expr: '0 9 * * *', description: 'Daily at 9 AM' },
    });
    const repairedJob = mockJob();
    vi.mocked(ipcBridge.cron.listJobs.invoke).mockResolvedValue([jobWithoutTz]);
    vi.mocked(ipcBridge.cron.updateJob.invoke).mockResolvedValue(repairedJob);
    vi.mocked(ipcBridge.cron.onJobCreated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobUpdated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobRemoved.on).mockReturnValue(() => {});

    const { result } = renderHook(() => useAllCronJobs());

    await waitFor(() => expect(result.current.loading).toBe(false));

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
    expect(result.current.jobs).toEqual([repairedJob]);
  });

  it('computes activeCount correctly', async () => {
    const jobs = [mockJob({ enabled: true }), mockJob({ id: 'job-2', enabled: false })];
    vi.mocked(ipcBridge.cron.listJobs.invoke).mockResolvedValue(jobs);
    vi.mocked(ipcBridge.cron.onJobCreated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobUpdated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobRemoved.on).mockReturnValue(() => {});

    const { result } = renderHook(() => useAllCronJobs());

    await waitFor(() => expect(result.current.activeCount).toBe(1));
  });

  it('detects error status across all jobs', async () => {
    const jobs = [mockJob(), mockJob({ id: 'job-2', state: { last_status: 'missed' } as any })];
    vi.mocked(ipcBridge.cron.listJobs.invoke).mockResolvedValue(jobs);
    vi.mocked(ipcBridge.cron.onJobCreated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobUpdated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobRemoved.on).mockReturnValue(() => {});

    const { result } = renderHook(() => useAllCronJobs());

    await waitFor(() => expect(result.current.hasError).toBe(true));
  });

  it('handles pauseJob with local state update', async () => {
    const job = mockJob();
    const updatedJob = mockJob({ enabled: false });
    vi.mocked(ipcBridge.cron.listJobs.invoke).mockResolvedValue([job]);
    vi.mocked(ipcBridge.cron.updateJob.invoke).mockResolvedValue(updatedJob);
    vi.mocked(ipcBridge.cron.onJobCreated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobUpdated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobRemoved.on).mockReturnValue(() => {});

    const { result } = renderHook(() => useAllCronJobs());

    await waitFor(() => expect(result.current.jobs).toEqual([job]));

    await result.current.pauseJob('job-1');

    await waitFor(() => expect(result.current.jobs).toEqual([updatedJob]));
  });

  it('handles deleteJob with local state update', async () => {
    const job = mockJob();
    vi.mocked(ipcBridge.cron.listJobs.invoke).mockResolvedValue([job]);
    vi.mocked(ipcBridge.cron.removeJob.invoke).mockResolvedValue(undefined);
    vi.mocked(ipcBridge.cron.onJobCreated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobUpdated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobRemoved.on).mockReturnValue(() => {});

    const { result } = renderHook(() => useAllCronJobs());

    await waitFor(() => expect(result.current.jobs).toEqual([job]));

    await result.current.deleteJob('job-1');

    await waitFor(() => expect(result.current.jobs).toEqual([]));
  });
});

describe('useCronJobsMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    Intl.DateTimeFormat = vi.fn(
      () =>
        ({
          resolvedOptions: () => ({ timeZone: 'Asia/Shanghai' }),
        }) as Intl.DateTimeFormat
    ) as unknown as typeof Intl.DateTimeFormat;
  });

  afterEach(() => {
    Intl.DateTimeFormat = originalDateTimeFormat;
  });

  it('fetches and groups jobs by conversation', async () => {
    const jobs = [
      mockJob({ id: 'job-1', metadata: { conversation_id: 'conv-1' } } as any),
      mockJob({ id: 'job-2', metadata: { conversation_id: 'conv-1' } } as any),
      mockJob({ id: 'job-3', metadata: { conversation_id: 'conv-2' } } as any),
    ];
    vi.mocked(ipcBridge.cron.listJobs.invoke).mockResolvedValue(jobs);
    vi.mocked(ipcBridge.cron.onJobCreated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobUpdated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobRemoved.on).mockReturnValue(() => {});

    const { result } = renderHook(() => useCronJobsMap());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.hasJobsForConversation('conv-1')).toBe(true);
    expect(result.current.getJobsForConversation('conv-1')).toHaveLength(2);
    expect(result.current.getJobsForConversation('conv-2')).toHaveLength(1);
  });

  it('returns correct job status for conversation', async () => {
    const jobs = [
      mockJob({ id: 'job-1', metadata: { conversation_id: 'conv-active' }, enabled: true } as any),
      mockJob({
        id: 'job-2',
        metadata: { conversation_id: 'conv-error' },
        state: { last_status: 'error' },
      } as any),
      mockJob({ id: 'job-3', metadata: { conversation_id: 'conv-paused' }, enabled: false } as any),
    ];
    vi.mocked(ipcBridge.cron.listJobs.invoke).mockResolvedValue(jobs);
    vi.mocked(ipcBridge.cron.onJobCreated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobUpdated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobRemoved.on).mockReturnValue(() => {});

    const { result } = renderHook(() => useCronJobsMap());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.getJobStatus('conv-active')).toBe('active');
    expect(result.current.getJobStatus('conv-error')).toBe('error');
    expect(result.current.getJobStatus('conv-paused')).toBe('paused');
    expect(result.current.getJobStatus('conv-none')).toBe('none');
  });

  it('marks conversation as unread on new execution', async () => {
    let onJobUpdatedHandler: ((job: ICronJob) => void) | null = null;
    const job = mockJob({
      id: 'job-1',
      metadata: { conversation_id: 'conv-1' },
      state: { last_run_at_ms: 1000 },
    } as any);
    vi.mocked(ipcBridge.cron.listJobs.invoke).mockResolvedValue([job]);
    vi.mocked(ipcBridge.cron.onJobCreated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobUpdated.on).mockImplementation((handler) => {
      onJobUpdatedHandler = handler;
      return () => {};
    });
    vi.mocked(ipcBridge.cron.onJobRemoved.on).mockReturnValue(() => {});

    const { result } = renderHook(() => useCronJobsMap());

    await waitFor(() => expect(result.current.loading).toBe(false));

    const updatedJob = mockJob({
      id: 'job-1',
      metadata: { conversation_id: 'conv-1' },
      state: { last_run_at_ms: 2000 },
    } as any);
    onJobUpdatedHandler!(updatedJob);

    await waitFor(() => expect(result.current.hasUnread('conv-1')).toBe(true));
    expect(result.current.getJobStatus('conv-1')).toBe('unread');
  });

  it('renames the latest new-conversation run when a scheduled task executes', async () => {
    let onJobUpdatedHandler: ((job: ICronJob) => void) | null = null;
    const initialJob = mockJob({
      id: 'job-1',
      name: 'Daily report',
      metadata: { ...mockJob().metadata, conversation_id: 'conv-1' },
      target: {
        execution_mode: 'new_conversation',
        payload: { kind: 'message', text: 'report' },
      },
      state: { ...mockJob().state, last_run_at_ms: 1000 },
    });
    vi.mocked(ipcBridge.cron.listJobs.invoke).mockResolvedValue([initialJob]);
    vi.mocked(ipcBridge.cron.onJobCreated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobUpdated.on).mockImplementation((handler) => {
      onJobUpdatedHandler = handler;
      return () => {};
    });
    vi.mocked(ipcBridge.cron.onJobRemoved.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.conversation.listByCronJob.invoke).mockResolvedValue([
      {
        ...mockConversation('conv-run'),
        name: 'Daily report',
        created_at: Date.UTC(2026, 6, 1, 12, 0, 0),
      } as TChatConversation,
    ]);

    const { result } = renderHook(() => useCronJobsMap());

    await waitFor(() => expect(result.current.loading).toBe(false));

    onJobUpdatedHandler!(
      mockJob({
        id: 'job-1',
        name: 'Daily report',
        metadata: { ...mockJob().metadata, conversation_id: 'conv-1' },
        target: {
          execution_mode: 'new_conversation',
          payload: { kind: 'message', text: 'report' },
        },
        state: { ...mockJob().state, last_run_at_ms: Date.UTC(2026, 6, 1, 12, 0, 0) },
      })
    );

    await waitFor(() =>
      expect(ipcBridge.conversation.update.invoke).toHaveBeenCalledWith({
        id: 'conv-run',
        updates: { name: 'Daily report 01-07-26' },
      })
    );
  });

  it('does not mark as unread if active conversation', async () => {
    let onJobUpdatedHandler: ((job: ICronJob) => void) | null = null;
    const job = mockJob({
      id: 'job-1',
      metadata: { conversation_id: 'conv-1' },
      state: { last_run_at_ms: 1000 },
    } as any);
    vi.mocked(ipcBridge.cron.listJobs.invoke).mockResolvedValue([job]);
    vi.mocked(ipcBridge.cron.onJobCreated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobUpdated.on).mockImplementation((handler) => {
      onJobUpdatedHandler = handler;
      return () => {};
    });
    vi.mocked(ipcBridge.cron.onJobRemoved.on).mockReturnValue(() => {});

    const { result } = renderHook(() => useCronJobsMap());

    await waitFor(() => expect(result.current.loading).toBe(false));

    result.current.setActiveConversation('conv-1');

    const updatedJob = mockJob({
      id: 'job-1',
      metadata: { conversation_id: 'conv-1' },
      state: { last_run_at_ms: 2000 },
    } as any);
    onJobUpdatedHandler!(updatedJob);

    await waitFor(() => expect(result.current.hasUnread('conv-1')).toBe(false));
  });

  it('marks conversation as read', async () => {
    const jobs = [mockJob({ id: 'job-1', metadata: { conversation_id: 'conv-1' } } as any)];
    vi.mocked(ipcBridge.cron.listJobs.invoke).mockResolvedValue(jobs);
    vi.mocked(ipcBridge.cron.onJobCreated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobUpdated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobRemoved.on).mockReturnValue(() => {});

    const { result } = renderHook(() => useCronJobsMap());

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Manually set unread
    localStorage.setItem('aionui_cron_unread', JSON.stringify(['conv-1']));
    result.current.refetch();

    await waitFor(() => {
      // refetch triggers full remount of state
    });

    result.current.markAsRead('conv-1');

    await waitFor(() => expect(result.current.hasUnread('conv-1')).toBe(false));
  });

  it('emits chat.history.refresh on job created', async () => {
    let onJobCreatedHandler: ((job: ICronJob) => void) | null = null;
    vi.mocked(ipcBridge.cron.listJobs.invoke).mockResolvedValue([]);
    vi.mocked(ipcBridge.cron.onJobCreated.on).mockImplementation((handler) => {
      onJobCreatedHandler = handler;
      return () => {};
    });
    vi.mocked(ipcBridge.cron.onJobUpdated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobRemoved.on).mockReturnValue(() => {});

    renderHook(() => useCronJobsMap());

    await waitFor(() => {
      /* wait for initial fetch */
    });

    const newJob = mockJob({ id: 'job-new', metadata: { conversation_id: 'conv-1' } } as any);
    onJobCreatedHandler!(newJob);

    await waitFor(() => expect(emitter.emit).toHaveBeenCalledWith('chat.history.refresh'));
  });
});

// Mock the shared conversation list store for the cron jobs map tests.
let conversationListSyncSnapshot: { conversations: TChatConversation[] } = { conversations: [] };
vi.mock('@renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync', () => ({
  useConversationListSync: () => conversationListSyncSnapshot,
}));

describe('useCronJobConversations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    conversationListSyncSnapshot = { conversations: [] };
    vi.mocked(ipcBridge.conversation.listByCronJob.invoke).mockResolvedValue([]);
    vi.mocked(ipcBridge.conversation.update.invoke).mockResolvedValue(true);
    vi.mocked(ipcBridge.conversation.listChanged.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobCreated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobUpdated.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobRemoved.on).mockReturnValue(() => {});
    vi.mocked(ipcBridge.cron.onJobExecuted.on).mockReturnValue(() => {});
  });

  const mockCronConversation = (id: string, cronJobId: string): TChatConversation =>
    ({
      ...mockConversation(id),
      extra: { cron_job_id: cronJobId },
    }) as TChatConversation;

  it('fetches associated conversations from the backend instead of relying on stale sidebar cache', async () => {
    const owned1 = mockCronConversation('conv-1', 'job-1');
    const owned2 = mockCronConversation('conv-2', 'job-1');
    const other = mockCronConversation('conv-3', 'job-2');
    conversationListSyncSnapshot = { conversations: [other] };
    vi.mocked(ipcBridge.conversation.listByCronJob.invoke).mockResolvedValue([owned1, owned2]);

    const { result } = renderHook(() => useCronJobConversations('job-1'));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.conversations.map((c) => c.id)).toEqual(['conv-1', 'conv-2']);
    expect(ipcBridge.conversation.listByCronJob.invoke).toHaveBeenCalledWith({ cron_job_id: 'job-1' });
  });

  it('refreshes when the matching cron job changes', async () => {
    const legacy = {
      ...mockConversation('conv-legacy'),
      extra: { cronJobId: 'job-1' },
    } as TChatConversation;
    let onJobUpdated: ((job: ICronJob) => void) | undefined;
    vi.mocked(ipcBridge.cron.onJobUpdated.on).mockImplementation((handler) => {
      onJobUpdated = handler;
      return () => {};
    });
    vi.mocked(ipcBridge.conversation.listByCronJob.invoke).mockResolvedValueOnce([]).mockResolvedValueOnce([legacy]);

    const { result } = renderHook(() => useCronJobConversations('job-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.conversations).toEqual([]);

    onJobUpdated?.(mockJob({ id: 'job-1' }));

    await waitFor(() => expect(result.current.conversations.map((c) => c.id)).toEqual(['conv-legacy']));
    expect(ipcBridge.conversation.listByCronJob.invoke).toHaveBeenCalledTimes(2);
  });

  it('does not refresh for unrelated cron job changes', async () => {
    let onJobUpdated: ((job: ICronJob) => void) | undefined;
    vi.mocked(ipcBridge.cron.onJobUpdated.on).mockImplementation((handler) => {
      onJobUpdated = handler;
      return () => {};
    });

    const { result } = renderHook(() => useCronJobConversations('job-1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    onJobUpdated?.(mockJob({ id: 'job-2' }));

    expect(ipcBridge.conversation.listByCronJob.invoke).toHaveBeenCalledTimes(1);
    expect(result.current.conversations).toEqual([]);
  });

  it('returns an empty list when job_id is undefined', () => {
    conversationListSyncSnapshot = {
      conversations: [mockCronConversation('conv-1', 'job-1')],
    };

    const { result } = renderHook(() => useCronJobConversations(undefined));

    expect(result.current.conversations).toEqual([]);
    expect(ipcBridge.conversation.listByCronJob.invoke).not.toHaveBeenCalled();
  });
});
