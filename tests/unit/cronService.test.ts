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
    insertBinding: vi.fn(),
    deleteBinding: vi.fn(() => 0),
    deleteBindingsByJob: vi.fn(() => 0),
    listBindingsByJob: vi.fn(() => []),
    listBindingsByConversation: vi.fn(() => []),
    getDefaultBinding: vi.fn(() => null),
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
    prepareConversation: vi.fn(async (_job, conversationId) => conversationId ?? 'prepared-conv'),
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

  it('does not remove jobs whose creator conversation is gone but a bound target exists', async () => {
    const job = makeJob({
      id: 'valid-binding',
      metadata: { ...makeJob().metadata, conversationId: 'deleted-creator' },
    });
    vi.mocked(repo.listAll).mockReturnValue([job]);
    vi.mocked(repo.listEnabled).mockReturnValue([]);
    vi.mocked(repo.listBindingsByJob).mockReturnValue([
      {
        id: 'binding-1',
        jobId: 'valid-binding',
        conversationId: 'bound-conv',
        isDefaultTarget: true,
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    vi.mocked(conversationRepo.getConversation).mockImplementation((conversationId) => {
      if (conversationId === 'bound-conv') {
        return { id: 'bound-conv' } as ReturnType<IConversationRepository['getConversation']>;
      }
      return undefined;
    });

    await service.init();

    expect(repo.delete).not.toHaveBeenCalled();
    expect(emitter.emitJobRemoved).not.toHaveBeenCalled();
  });

  // --- addJob ---

  it('addJob inserts into repo and emits jobCreated', async () => {
    vi.mocked(repo.listByConversation).mockReturnValue([]);

    const job = await service.addJob({
      name: 'my-job',
      description: 'my description',
      schedule: { kind: 'every', everyMs: 10000, description: 'test' },
      prompt: 'hello',
      conversationId: 'conv-1',
      agentType: 'gemini',
      createdBy: 'user',
    });

    expect(repo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'my-job',
        description: 'my description',
        target: expect.objectContaining({ payload: { kind: 'message', text: 'hello' } }),
      })
    );
    expect(emitter.emitJobCreated).toHaveBeenCalledWith(expect.objectContaining({ name: 'my-job' }));
    expect(job.name).toBe('my-job');
    expect(job.description).toBe('my description');
  });

  it('addJob binds existing-mode task to the source conversation', async () => {
    vi.mocked(conversationRepo.getConversation).mockReturnValue({
      id: 'conv-1',
      name: 'Current conversation',
      source: 'weixin',
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

    expect(repo.insertBinding).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: expect.any(String),
        conversationId: 'conv-1',
        conversationTitle: 'Current conversation',
        conversationSource: 'weixin',
        isDefaultTarget: true,
      })
    );
    expect(conversationRepo.updateConversation).toHaveBeenCalledWith(
      'conv-1',
      expect.objectContaining({ modifyTime: expect.any(Number) })
    );
  });

  it('addJob stores agent config only for new-conversation jobs', async () => {
    vi.mocked(repo.listByConversation).mockReturnValue([]);
    const agentConfig = { backend: 'claude' as const, modelId: 'claude-sonnet-4-6' };

    await service.addJob({
      name: 'existing-job',
      schedule: { kind: 'every', everyMs: 10000, description: 'test' },
      prompt: 'hello',
      conversationId: 'conv-1',
      agentType: 'claude',
      createdBy: 'user',
      executionMode: 'existing',
      agentConfig,
    });
    await service.addJob({
      name: 'new-conv-job',
      schedule: { kind: 'every', everyMs: 10000, description: 'test' },
      prompt: 'hello',
      conversationId: 'conv-1',
      agentType: 'claude',
      createdBy: 'user',
      executionMode: 'new_conversation',
      agentConfig,
    });

    expect(repo.insert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        target: expect.objectContaining({ executionMode: 'existing' }),
        metadata: expect.not.objectContaining({ agentConfig }),
      })
    );
    expect(repo.insert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        target: expect.objectContaining({ executionMode: 'new_conversation' }),
        metadata: expect.objectContaining({ agentConfig }),
      })
    );
  });

  it('updateJob preserves edited description', async () => {
    const existing = makeJob({ description: 'Old description' });
    const updated = makeJob({ description: 'New description' });
    vi.mocked(repo.getById).mockReturnValueOnce(existing).mockReturnValueOnce(updated);

    const result = await service.updateJob(existing.id, { description: 'New description' });

    expect(repo.update).toHaveBeenCalledWith(existing.id, expect.objectContaining({ description: 'New description' }));
    expect(emitter.emitJobUpdated).toHaveBeenCalledWith(expect.objectContaining({ description: 'New description' }));
    expect(result.description).toBe('New description');
  });

  it('addJob allows multiple scheduled tasks on the same conversation', async () => {
    vi.mocked(repo.listByConversation).mockReturnValue([makeJob({ name: 'existing-job', id: 'existing-id' })]);
    vi.mocked(conversationRepo.getConversation).mockReturnValue({
      id: 'conv-1',
      name: 'Current conversation',
      extra: {},
    } as ReturnType<IConversationRepository['getConversation']>);

    await expect(
      service.addJob({
        name: 'new-job',
        schedule: { kind: 'every', everyMs: 10000, description: 'test' },
        prompt: 'hello',
        conversationId: 'conv-1',
        agentType: 'gemini',
        createdBy: 'user',
      })
    ).resolves.toEqual(expect.objectContaining({ name: 'new-job' }));
    expect(repo.insertBinding).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'conv-1' }));
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

  it('bindConversation makes the selected conversation the default target', async () => {
    const job = makeJob({ id: 'j1' });
    vi.mocked(repo.getById).mockReturnValue(job);
    vi.mocked(repo.listBindingsByJob).mockReturnValue([
      {
        id: 'binding-old',
        jobId: 'j1',
        conversationId: 'old-conv',
        isDefaultTarget: true,
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    vi.mocked(conversationRepo.getConversation).mockReturnValue({
      id: 'conv-2',
      name: 'Target conversation',
      extra: {},
    } as ReturnType<IConversationRepository['getConversation']>);

    const binding = await service.bindConversation('j1', 'conv-2');

    expect(binding).toEqual(expect.objectContaining({ jobId: 'j1', conversationId: 'conv-2', isDefaultTarget: true }));
    expect(repo.insertBinding).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'j1', conversationId: 'conv-2', isDefaultTarget: true })
    );
    expect(conversationRepo.updateConversation).toHaveBeenCalledWith(
      'conv-2',
      expect.objectContaining({ modifyTime: expect.any(Number) })
    );
    expect(emitter.emitJobUpdated).toHaveBeenCalledWith(job);
  });

  it('unbindConversation removes the binding and emits the updated job', async () => {
    const job = makeJob({ id: 'j1' });
    vi.mocked(repo.getById).mockReturnValue(job);

    await service.unbindConversation('j1', 'conv-2');

    expect(repo.deleteBinding).toHaveBeenCalledWith('j1', 'conv-2');
    expect(conversationRepo.updateConversation).toHaveBeenCalledWith(
      'conv-2',
      expect.objectContaining({ modifyTime: expect.any(Number) })
    );
    expect(emitter.emitJobUpdated).toHaveBeenCalledWith(job);
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

  it('runNow starts existing-mode jobs for every bound conversation and returns the default target', async () => {
    const job = makeJob({ id: 'j1', metadata: { ...makeJob().metadata, conversationId: 'creator-conv' } });
    vi.mocked(repo.getById).mockReturnValue(job);
    vi.mocked(repo.getDefaultBinding).mockReturnValue({
      id: 'binding-1',
      jobId: 'j1',
      conversationId: 'bound-conv-1',
      isDefaultTarget: true,
      createdAt: 1,
      updatedAt: 1,
    });
    vi.mocked(repo.listBindingsByJob).mockReturnValue([
      {
        id: 'binding-1',
        jobId: 'j1',
        conversationId: 'bound-conv-1',
        isDefaultTarget: true,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'binding-2',
        jobId: 'j1',
        conversationId: 'bound-conv-2',
        isDefaultTarget: false,
        createdAt: 2,
        updatedAt: 2,
      },
    ]);
    vi.mocked(executor.isConversationBusy).mockReturnValue(false);
    vi.mocked(executor.executeJob).mockResolvedValue(undefined);

    const conversationId = await service.runNow('j1');
    await vi.waitFor(() => {
      expect(executor.executeJob).toHaveBeenCalledTimes(2);
    });

    expect(conversationId).toBe('bound-conv-1');
    expect(executor.prepareConversation).not.toHaveBeenCalled();
    expect(executor.executeJob).toHaveBeenCalledWith(job, expect.any(Function), 'bound-conv-1');
    expect(executor.executeJob).toHaveBeenCalledWith(job, expect.any(Function), 'bound-conv-2');
  });

  it('runNow rejects existing-mode jobs without any conversation bindings', async () => {
    const job = makeJob({ id: 'j1', metadata: { ...makeJob().metadata, conversationId: 'creator-conv' } });
    vi.mocked(repo.getById).mockReturnValue(job);
    vi.mocked(repo.listBindingsByJob).mockReturnValue([]);

    await expect(service.runNow('j1')).rejects.toThrow(/cron:error\.existingNoBindings|未绑定|not bound/i);
    expect(executor.executeJob).not.toHaveBeenCalled();
    expect(executor.prepareConversation).not.toHaveBeenCalled();
  });

  it('executeJob sends existing-mode jobs to every bound conversation', async () => {
    const job = makeJob({ id: 'j1', metadata: { ...makeJob().metadata, conversationId: 'creator-conv' } });
    const updatedJob = makeJob({ id: 'j1' });
    vi.mocked(repo.listEnabled).mockReturnValue([job]);
    vi.mocked(repo.getById).mockReturnValue(updatedJob);
    vi.mocked(repo.listBindingsByJob).mockReturnValue([
      {
        id: 'binding-1',
        jobId: 'j1',
        conversationId: 'bound-conv-1',
        isDefaultTarget: true,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'binding-2',
        jobId: 'j1',
        conversationId: 'bound-conv-2',
        isDefaultTarget: false,
        createdAt: 2,
        updatedAt: 2,
      },
    ]);
    vi.mocked(executor.isConversationBusy).mockReturnValue(false);
    vi.mocked(executor.executeJob).mockResolvedValue(undefined);

    await service.init();
    await vi.advanceTimersByTimeAsync(60000);

    expect(executor.isConversationBusy).toHaveBeenCalledWith('bound-conv-1');
    expect(executor.isConversationBusy).toHaveBeenCalledWith('bound-conv-2');
    expect(executor.executeJob).toHaveBeenCalledWith(job, expect.any(Function), 'bound-conv-1');
    expect(executor.executeJob).toHaveBeenCalledWith(job, expect.any(Function), 'bound-conv-2');
    expect(conversationRepo.updateConversation).toHaveBeenCalledWith(
      'bound-conv-1',
      expect.objectContaining({ modifyTime: expect.any(Number) })
    );
    expect(conversationRepo.updateConversation).toHaveBeenCalledWith(
      'bound-conv-2',
      expect.objectContaining({ modifyTime: expect.any(Number) })
    );
  });

  it('starts existing-mode bound targets concurrently with a small cap', async () => {
    const job = makeJob({ id: 'j1', metadata: { ...makeJob().metadata, conversationId: 'creator-conv' } });
    const resolvers: Array<() => void> = [];
    vi.mocked(repo.listEnabled).mockReturnValue([job]);
    vi.mocked(repo.getById).mockReturnValue(job);
    vi.mocked(repo.listBindingsByJob).mockReturnValue(
      Array.from({ length: 5 }, (_, index) => ({
        id: `binding-${index + 1}`,
        jobId: 'j1',
        conversationId: `bound-conv-${index + 1}`,
        isDefaultTarget: index === 0,
        createdAt: index + 1,
        updatedAt: index + 1,
      }))
    );
    vi.mocked(executor.isConversationBusy).mockReturnValue(false);
    vi.mocked(executor.executeJob).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvers.push(resolve);
        })
    );

    await service.init();
    await vi.advanceTimersByTimeAsync(60000);

    expect(executor.executeJob).toHaveBeenCalledTimes(4);
    expect(executor.executeJob).toHaveBeenCalledWith(job, expect.any(Function), 'bound-conv-1');
    expect(executor.executeJob).toHaveBeenCalledWith(job, expect.any(Function), 'bound-conv-4');
    expect(executor.executeJob).not.toHaveBeenCalledWith(job, expect.any(Function), 'bound-conv-5');

    resolvers[0]();
    await vi.waitFor(() => {
      expect(executor.executeJob).toHaveBeenCalledWith(job, expect.any(Function), 'bound-conv-5');
    });
    resolvers.slice(1).forEach((resolve) => resolve());
  });

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

    expect(executor.executeJob).toHaveBeenCalledWith(job, expect.any(Function), 'conv-1');
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

  it('executeJob schedules retry timers independently for busy bound conversations', async () => {
    const job = makeJob({
      id: 'j1',
      metadata: { ...makeJob().metadata, conversationId: 'creator-conv' },
      state: { runCount: 0, retryCount: 0, maxRetries: 1 },
    });
    vi.mocked(repo.listEnabled).mockReturnValue([job]);
    vi.mocked(repo.listBindingsByJob).mockReturnValue([
      {
        id: 'binding-1',
        jobId: 'j1',
        conversationId: 'bound-conv-1',
        isDefaultTarget: true,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'binding-2',
        jobId: 'j1',
        conversationId: 'bound-conv-2',
        isDefaultTarget: false,
        createdAt: 2,
        updatedAt: 2,
      },
    ]);
    vi.mocked(repo.getById).mockReturnValue(job);
    vi.mocked(executor.isConversationBusy).mockReturnValue(true);

    await service.init();
    await vi.advanceTimersByTimeAsync(60000);

    expect(executor.executeJob).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalledWith(
      'j1',
      expect.objectContaining({ state: expect.objectContaining({ lastStatus: 'skipped' }) })
    );

    await vi.advanceTimersByTimeAsync(30000);

    expect(repo.update).toHaveBeenCalledTimes(3);
    expect(repo.update).toHaveBeenCalledWith(
      'j1',
      expect.objectContaining({ state: expect.objectContaining({ lastStatus: 'skipped' }) })
    );
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

  // --- startTimer invalid cron expression ---

  it('startTimer disables job and records error when cron expression is invalid', async () => {
    const { Cron } = await import('croner');
    vi.mocked(Cron).mockImplementationOnce(() => {
      throw new TypeError('CronPattern: configuration entry 2 (NaN) contains illegal characters.');
    });

    const job = makeJob({
      id: 'bad-cron',
      schedule: { kind: 'cron', expr: 'NaN NaN * * *', description: 'invalid' },
    });
    vi.mocked(repo.listEnabled).mockReturnValue([job]);

    await service.init();

    expect(repo.update).toHaveBeenCalledWith(
      'bad-cron',
      expect.objectContaining({
        enabled: false,
        state: expect.objectContaining({
          lastStatus: 'error',
          lastError: 'Invalid cron expression: NaN NaN * * *',
        }),
      })
    );
    expect(emitter.emitJobUpdated).toHaveBeenCalledWith(expect.objectContaining({ id: 'bad-cron', enabled: false }));
  });
});
