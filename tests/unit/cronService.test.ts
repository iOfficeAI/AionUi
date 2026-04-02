import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(() => '/mock/userData'),
    getAppPath: vi.fn(() => '/mock/appPath'),
  },
  ipcMain: { handle: vi.fn(), on: vi.fn(), removeHandler: vi.fn() },
  powerMonitor: { on: vi.fn() },
}));
vi.mock('@/common/platform', () => ({
  getPlatformServices: () => ({
    power: {
      preventSleep: vi.fn(() => 1),
      allowSleep: vi.fn(),
    },
  }),
}));
vi.mock('croner', () => ({
  Cron: vi.fn(() => ({ stop: vi.fn(), nextRun: vi.fn(() => null) })),
}));
vi.mock('@process/services/i18n', () => ({
  default: { t: vi.fn((key: string) => key) },
  i18nReady: Promise.resolve(),
}));
vi.mock('@process/utils/message', () => ({ addMessage: vi.fn() }));
vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: { responseStream: { emit: vi.fn() } },
  },
}));
vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: { get: vi.fn(async () => false) },
  getCronSkillsDir: vi.fn(() => '/mock/cronSkills'),
}));
vi.mock('@/process/services/cron/cronSkillFile', () => ({
  writeCronSkillFile: vi.fn(async () => '/mock/cronSkills/job-id/SKILL.md'),
  deleteCronSkillFile: vi.fn(async () => {}),
}));

import { CronService } from '../../src/process/services/cron/CronService';
import type { ICronRepository } from '../../src/process/services/cron/ICronRepository';
import type { ICronEventEmitter } from '../../src/process/services/cron/ICronEventEmitter';
import type { ICronJobExecutor } from '../../src/process/services/cron/ICronJobExecutor';
import type { IConversationRepository } from '../../src/process/services/database/IConversationRepository';
import type { CronJob } from '../../src/process/services/cron/CronStore';

function makeRepo(overrides?: Partial<ICronRepository>): ICronRepository {
  return {
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getById: vi.fn(() => null),
    listAll: vi.fn(() => []),
    listEnabled: vi.fn(() => []),
    listByConversation: vi.fn(() => []),
    deleteByConversation: vi.fn(() => 0),
    ...overrides,
  };
}

function makeEmitter(overrides?: Partial<ICronEventEmitter>): ICronEventEmitter {
  return {
    emitJobCreated: vi.fn(),
    emitJobUpdated: vi.fn(),
    emitJobRemoved: vi.fn(),
    emitJobExecuted: vi.fn(),
    showNotification: vi.fn(async () => {}),
    ...overrides,
  };
}

function makeExecutor(overrides?: Partial<ICronJobExecutor>): ICronJobExecutor {
  return {
    isConversationBusy: vi.fn(() => false),
    executeJob: vi.fn(async () => {}),
    onceIdle: vi.fn(),
    setProcessing: vi.fn(),
    ...overrides,
  };
}

function makeConversationRepo(overrides?: Partial<IConversationRepository>): IConversationRepository {
  return {
    getConversation: vi.fn(() => undefined),
    createConversation: vi.fn(),
    updateConversation: vi.fn(),
    deleteConversation: vi.fn(),
    getMessages: vi.fn(() => ({ data: [], total: 0, hasMore: false })),
    insertMessage: vi.fn(),
    getUserConversations: vi.fn(() => ({ data: [], total: 0, hasMore: false })),
    listAllConversations: vi.fn(() => []),
    searchMessages: vi.fn(async () => ({ data: [], total: 0, hasMore: false })),
    getConversationsByCronJob: vi.fn(async () => []),
    ...overrides,
  };
}

function makeJob(overrides?: Partial<CronJob>): CronJob {
  return {
    id: 'job-1',
    name: 'test-job',
    enabled: true,
    schedule: { kind: 'every', everyMs: 60000, description: 'every 1 min' },
    target: { payload: { kind: 'message', text: 'hello' } },
    metadata: {
      conversationId: 'conv-1',
      agentType: 'gemini',
      createdBy: 'user',
      createdAt: 1000,
      updatedAt: 1000,
    },
    state: { runCount: 0, retryCount: 0, maxRetries: 3 },
    ...overrides,
  };
}

describe('CronService', () => {
  let repo: ICronRepository;
  let emitter: ICronEventEmitter;
  let executor: ICronJobExecutor;
  let conversationRepo: IConversationRepository;
  let service: CronService;

  beforeEach(() => {
    vi.useFakeTimers();
    repo = makeRepo();
    emitter = makeEmitter();
    executor = makeExecutor();
    conversationRepo = makeConversationRepo();
    service = new CronService(repo, emitter, executor, conversationRepo);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // --- init ---

  it('starts timers for all enabled jobs at correct intervals', async () => {
    const job = makeJob();
    vi.mocked(repo.listEnabled).mockReturnValue([job]);

    await service.init();

    expect(repo.listEnabled).toHaveBeenCalled();
    // startTimer (every kind) syncs nextRunAtMs via repo.update
    expect(repo.update).toHaveBeenCalledWith(job.id, expect.objectContaining({ state: expect.any(Object) }));
  });

  it('removes orphan jobs whose conversation no longer exists in repo', async () => {
    const job = makeJob({ id: 'orphan' });
    vi.mocked(repo.listAll).mockReturnValue([job]);
    vi.mocked(repo.listEnabled).mockReturnValue([]);
    vi.mocked(conversationRepo.getConversation).mockReturnValue(undefined);

    await service.init();

    expect(repo.delete).toHaveBeenCalledWith('orphan');
    expect(emitter.emitJobRemoved).toHaveBeenCalledWith('orphan');
  });

  it('does not remove jobs when their conversation exists', async () => {
    const job = makeJob({ id: 'valid' });
    vi.mocked(repo.listAll).mockReturnValue([job]);
    vi.mocked(repo.listEnabled).mockReturnValue([]);
    vi.mocked(conversationRepo.getConversation).mockReturnValue({
      id: 'conv-1',
    } as ReturnType<IConversationRepository['getConversation']>);

    await service.init();

    expect(repo.delete).not.toHaveBeenCalled();
    expect(emitter.emitJobRemoved).not.toHaveBeenCalled();
  });

  // --- addJob ---

  it('addJob inserts into repo and emits jobCreated', async () => {
    vi.mocked(repo.listByConversation).mockReturnValue([]);

    const job = await service.addJob({
      name: 'my-job',
      schedule: { kind: 'every', everyMs: 10000, description: 'test' },
      prompt: 'hello',
      conversationId: 'conv-1',
      agentType: 'gemini',
      createdBy: 'user',
    });

    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'my-job',
        target: expect.objectContaining({ payload: { kind: 'message', text: 'hello' } }),
      })
    );
    expect(emitter.emitJobCreated).toHaveBeenCalledWith(expect.objectContaining({ name: 'my-job' }));
    expect(job.name).toBe('my-job');
  });

  it('addJob tags conversation with cronJobId', async () => {
    vi.mocked(repo.listByConversation).mockReturnValue([]);
    vi.mocked(conversationRepo.getConversation).mockReturnValue({
      id: 'conv-1',
      extra: {},
    } as ReturnType<IConversationRepository['getConversation']>);

    await service.addJob({
      name: 'my-job',
      description: 'my description',
      schedule: { kind: 'every', everyMs: 10000, description: 'test' },
      prompt: 'hello',
      conversationId: 'conv-1',
      agentType: 'gemini',
      createdBy: 'user',
    });

    expect(conversationRepo.updateConversation).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({
        extra: expect.objectContaining({ cronJobId: expect.any(String) }),
      })
    );
  });

  it('addJob stores executionMode when provided', async () => {
    vi.mocked(repo.listByConversation).mockReturnValue([]);

    await service.addJob({
      name: 'new-conv-job',
      schedule: { kind: 'every', everyMs: 10000, description: 'test' },
      prompt: 'hello',
      conversationId: 'conv-1',
      agentType: 'gemini',
      createdBy: 'user',
      executionMode: 'new_conversation',
    });

    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({ executionMode: 'new_conversation' }),
      })
    );
  });

  it('addJob throws when conversation already has a scheduled job', async () => {
    const existing = makeJob({ name: 'existing-job', id: 'existing-id' });
    vi.mocked(repo.listByConversation).mockReturnValue([existing]);

    await expect(
      service.addJob({
        name: 'new-job',
        schedule: { kind: 'every', everyMs: 10000, description: 'test' },
        prompt: 'hello',
        conversationId: 'conv-1',
        agentType: 'gemini',
        createdBy: 'user',
      })
    ).rejects.toThrow();
  });

  // --- updateJob ---

  it('updateJob restarts timer when enabled flips from false to true', async () => {
    const disabledJob = makeJob({ id: 'j1', enabled: false });
    const updatedJob = makeJob({ id: 'j1', enabled: true });
    vi.mocked(repo.getById).mockReturnValueOnce(disabledJob).mockReturnValueOnce(updatedJob);

    await service.updateJob('j1', { enabled: true });

    // startTimer was called for the re-enabled job → emitter.emitJobUpdated
    expect(emitter.emitJobUpdated).toHaveBeenCalledWith(updatedJob);
  });

  it('updateJob throws when job does not exist', async () => {
    vi.mocked(repo.getById).mockReturnValue(null);

    await expect(service.updateJob('missing', {})).rejects.toThrow('Job not found: missing');
  });

  // --- removeJob ---

  it('removeJob stops timer and emits jobRemoved', async () => {
    await service.removeJob('job-1');

    expect(repo.delete).toHaveBeenCalledWith('job-1');
    expect(emitter.emitJobRemoved).toHaveBeenCalledWith('job-1');
  });

  it('removeJob cleans up SKILL.md file', async () => {
    const { deleteCronSkillFile } = await import('@/process/services/cron/cronSkillFile');
    await service.removeJob('job-1');

    expect(deleteCronSkillFile).toHaveBeenCalledWith('job-1');
  });

  // --- executeJob (via startTimer interval) ---

  it('executeJob calls executor.executeJob, updates job state, and emits completion', async () => {
    const job = makeJob({ id: 'j1' });
    const updatedJob = makeJob({
      id: 'j1',
      state: { runCount: 1, retryCount: 0, maxRetries: 3 },
    });
    vi.mocked(repo.listEnabled).mockReturnValue([job]);
    vi.mocked(repo.getById).mockReturnValue(updatedJob);
    vi.mocked(executor.isConversationBusy).mockReturnValue(false);
    vi.mocked(executor.executeJob).mockResolvedValue(undefined);

    await service.init();
    // Advance exactly one interval period to fire the timer once.
    await vi.advanceTimersByTimeAsync(60000);

    expect(executor.executeJob).toHaveBeenCalledWith(job, expect.any(Function), undefined);
    expect(repo.update).toHaveBeenCalledWith(
      'j1',
      expect.objectContaining({
        state: expect.objectContaining({ lastStatus: 'ok' }),
      })
    );
    expect(emitter.emitJobUpdated).toHaveBeenCalledWith(updatedJob);
  });

  it('executeJob records error status when executor throws', async () => {
    const job = makeJob({ id: 'j1' });
    const updatedJob = makeJob({ id: 'j1' });
    vi.mocked(repo.listEnabled).mockReturnValue([job]);
    vi.mocked(repo.getById).mockReturnValue(updatedJob);
    vi.mocked(executor.isConversationBusy).mockReturnValue(false);
    vi.mocked(executor.executeJob).mockRejectedValue(new Error('task not found'));

    await service.init();
    await vi.advanceTimersByTimeAsync(60000);

    expect(repo.update).toHaveBeenCalledWith(
      'j1',
      expect.objectContaining({
        state: expect.objectContaining({
          lastStatus: 'error',
          lastError: 'task not found',
        }),
      })
    );
  });

  it('executeJob skips and stops retrying when conversation is busy beyond maxRetries', async () => {
    const job = makeJob({
      id: 'j1',
      state: { runCount: 0, retryCount: 0, maxRetries: 1 },
    });
    const skippedJob = makeJob({ id: 'j1' });
    vi.mocked(repo.listEnabled).mockReturnValue([job]);
    vi.mocked(repo.getById).mockReturnValue(skippedJob);
    vi.mocked(executor.isConversationBusy).mockReturnValue(true);

    await service.init();
    // First interval fires: retry count = 1, not > maxRetries(1) → schedules 30s retry timer
    await vi.advanceTimersByTimeAsync(60000);
    // Retry timer fires: retry count = 2 > maxRetries(1) → skip
    await vi.advanceTimersByTimeAsync(30000);

    expect(executor.executeJob).not.toHaveBeenCalled();
    expect(repo.update).toHaveBeenCalledWith(
      'j1',
      expect.objectContaining({
        state: expect.objectContaining({ lastStatus: 'skipped' }),
      })
    );
    expect(emitter.emitJobUpdated).toHaveBeenCalledWith(skippedJob);
  });

  it('executeJob schedules a retry timer when conversation is busy within retry limit', async () => {
    const job = makeJob({
      id: 'j1',
      state: { runCount: 0, retryCount: 0, maxRetries: 3 },
    });
    vi.mocked(repo.listEnabled).mockReturnValue([job]);
    vi.mocked(executor.isConversationBusy).mockReturnValue(true);

    await service.init();
    // First interval fires — busy, retry count = 1 (within limit), schedules retry
    // Advance only the interval (60 s), not the retry timer (30 s)
    await vi.advanceTimersByTimeAsync(60000);

    // Executor must not have been called — still waiting for retry
    expect(executor.executeJob).not.toHaveBeenCalled();
  });

  // --- handleSystemResume ---

  it('handleSystemResume inserts missed-job messages for jobs that fired while system was asleep', async () => {
    vi.mocked(repo.listEnabled).mockReturnValue([]);
    await service.init();

    const pastTime = Date.now() - 1000;
    const job = makeJob({
      id: 'j1',
      state: {
        runCount: 0,
        retryCount: 0,
        maxRetries: 3,
        nextRunAtMs: pastTime,
      },
    });
    vi.mocked(repo.listEnabled).mockReturnValue([job]);
    vi.mocked(repo.getById).mockReturnValue(job);

    await service.handleSystemResume();

    expect(repo.update).toHaveBeenCalledWith(
      'j1',
      expect.objectContaining({
        state: expect.objectContaining({ lastStatus: 'missed' }),
      })
    );
    expect(emitter.emitJobUpdated).toHaveBeenCalledWith(job);
    const { addMessage } = await import('@process/utils/message');
    expect(addMessage).toHaveBeenCalledWith('conv-1', expect.objectContaining({ type: 'tips' }));
  });

  it('handleSystemResume does nothing when service is not yet initialized', async () => {
    await service.handleSystemResume();

    // listEnabled should only be called during init, not during uninitialized handleSystemResume
    expect(repo.listEnabled).not.toHaveBeenCalled();
  });
});
