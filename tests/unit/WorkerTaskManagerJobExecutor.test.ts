import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: vi.fn(() => '/tmp') } }));
vi.mock('@/common/utils', () => ({ uuid: vi.fn(() => 'test-uuid') }));
vi.mock('@process/utils', () => ({ copyFilesToDirectory: vi.fn(async () => []) }));
vi.mock('@process/utils/initStorage', () => ({
  getCronSkillsDir: vi.fn(() => '/mock/cronSkills'),
  ProcessConfig: { get: vi.fn(async () => false) },
}));
vi.mock('@process/utils/message', () => ({ addMessage: vi.fn() }));
vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: { responseStream: { emit: vi.fn() }, listChanged: { emit: vi.fn() } },
    geminiConversation: { responseStream: { emit: vi.fn() } },
    acpConversation: { responseStream: { emit: vi.fn() } },
    openclawConversation: { responseStream: { emit: vi.fn() } },
  },
}));
vi.mock('@/process/services/cron/cronSkillFile', () => ({
  readCronSkillContent: vi.fn(async () => null),
  parseCronSkillContent: vi.fn(() => null),
  hasCronSkillFile: vi.fn(async () => false),
  getCronSkillDir: vi.fn((jobId: string) => `/mock/cronSkills/${jobId}`),
}));
vi.mock('@/process/services/cron/SkillSuggestWatcher', () => ({
  skillSuggestWatcher: {
    register: vi.fn(),
    unregister: vi.fn(),
    has: vi.fn(() => false),
    onFinish: vi.fn(),
    setLastHash: vi.fn(),
  },
}));
const mockConversationService = vi.hoisted(() => ({
  createConversation: vi.fn(),
  getConversation: vi.fn(),
  getConversationsByCronJob: vi.fn(),
  updateConversation: vi.fn(),
}));
vi.mock('@process/services/conversationServiceSingleton', () => ({
  conversationServiceSingleton: mockConversationService,
}));

import { WorkerTaskManagerJobExecutor } from '../../src/process/services/cron/WorkerTaskManagerJobExecutor';
import { CronBusyGuard } from '../../src/process/services/cron/CronBusyGuard';
import type { IWorkerTaskManager } from '../../src/process/task/IWorkerTaskManager';
import type { CronJob } from '../../src/process/services/cron/CronStore';
import { copyFilesToDirectory } from '@process/utils';

function makeTaskManager(overrides?: Partial<IWorkerTaskManager>): IWorkerTaskManager {
  return {
    getTask: vi.fn(),
    getOrBuildTask: vi.fn(),
    addTask: vi.fn(),
    kill: vi.fn(),
    clear: vi.fn(),
    listTasks: vi.fn(() => []),
    ...overrides,
  };
}

function makeJob(conversationId = 'conv-1'): CronJob {
  return {
    id: 'job-1',
    name: 'Test Job',
    enabled: true,
    schedule: { kind: 'every', everyMs: 60000, description: 'every minute' },
    target: { payload: { kind: 'message', text: 'hello' } },
    metadata: {
      conversationId,
      agentType: 'acp',
      createdBy: 'user',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    state: { runCount: 0, retryCount: 0, maxRetries: 3 },
  };
}

function makeTask(type = 'acp') {
  return {
    type,
    sendMessage: vi.fn(),
    kill: vi.fn(),
    stop: vi.fn(),
    workspace: undefined,
    ensureYoloMode: vi.fn(async () => true),
  };
}

describe('WorkerTaskManagerJobExecutor', () => {
  let busyGuard: CronBusyGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    busyGuard = new CronBusyGuard();
    mockConversationService.createConversation.mockResolvedValue({
      id: 'created-conv',
      type: 'codex',
      name: 'Created Conversation',
      extra: { backend: 'codex', cronWorkspace: '/workspace', workspace: '/workspace' },
    });
    mockConversationService.getConversation.mockResolvedValue(undefined);
    mockConversationService.getConversationsByCronJob.mockResolvedValue([]);
  });

  it('throws a contextual error when getOrBuildTask rejects (conversation deleted)', async () => {
    const taskManager = makeTaskManager({
      getTask: vi.fn(() => undefined),
      getOrBuildTask: vi.fn().mockRejectedValue(new Error('Conversation not found: conv-1')),
    });
    const executor = new WorkerTaskManagerJobExecutor(taskManager, busyGuard);

    await expect(executor.executeJob(makeJob('conv-1'))).rejects.toThrow(
      'Failed to acquire task for conversation conv-1: Conversation not found: conv-1'
    );

    // Verify busy state was NOT set (no leaked busy state)
    expect(busyGuard.isProcessing('conv-1')).toBe(false);
  });

  it('does not set busy state when task acquisition fails', async () => {
    const taskManager = makeTaskManager({
      getTask: vi.fn(() => undefined),
      getOrBuildTask: vi.fn().mockRejectedValue(new Error('Conversation not found: conv-1')),
    });
    const executor = new WorkerTaskManagerJobExecutor(taskManager, busyGuard);

    await executor.executeJob(makeJob('conv-1')).catch(() => {});
    expect(busyGuard.isProcessing('conv-1')).toBe(false);
  });

  it('executes successfully when task is acquired from cache', async () => {
    const task = makeTask('acp');
    const taskManager = makeTaskManager({
      getTask: vi.fn(() => task as any),
    });
    const executor = new WorkerTaskManagerJobExecutor(taskManager, busyGuard);

    await executor.executeJob(makeJob('conv-1'));

    expect(task.sendMessage).toHaveBeenCalledTimes(1);
    expect(busyGuard.isProcessing('conv-1')).toBe(true);
  });

  it('uses raw payload text for message content (skill content injected via workspace symlink)', async () => {
    const task = makeTask('acp');
    const taskManager = makeTaskManager({
      getTask: vi.fn(() => task as any),
    });
    const executor = new WorkerTaskManagerJobExecutor(taskManager, busyGuard);

    await executor.executeJob(makeJob('conv-1'));

    expect(task.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('hello'),
        hidden: true,
        cronMeta: expect.objectContaining({ cronJobId: 'job-1' }),
      })
    );
  });

  it('copies associated files into the workspace before sending the scheduled prompt', async () => {
    vi.mocked(copyFilesToDirectory).mockResolvedValueOnce(['/workspace/spec.md']);

    const task = {
      ...makeTask('acp'),
      workspace: '/workspace',
    };
    const taskManager = makeTaskManager({
      getTask: vi.fn(() => task as any),
    });
    const executor = new WorkerTaskManagerJobExecutor(taskManager, busyGuard);
    const job = makeJob('conv-1');
    job.metadata.agentConfig = {
      backend: 'claude',
      name: 'Claude',
      defaultFiles: ['E:/docs/spec.md'],
    };

    await executor.executeJob(job);

    expect(copyFilesToDirectory).toHaveBeenCalledWith('/workspace', ['E:/docs/spec.md'], false);
    expect(task.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        files: ['/workspace/spec.md'],
      })
    );
  });

  describe('Codex routing', () => {
    it('creates native Codex conversations for new-conversation Codex jobs', async () => {
      const task = makeTask('codex');
      const taskManager = makeTaskManager({
        getTask: vi.fn(() => undefined),
        getOrBuildTask: vi.fn(async () => task as any),
      });
      const executor = new WorkerTaskManagerJobExecutor(taskManager, busyGuard);
      const job = makeJob('');
      job.target.executionMode = 'new_conversation';
      job.metadata.agentConfig = {
        backend: 'codex',
        name: 'Codex',
        workspace: '/workspace',
        mode: 'yolo',
      };

      await executor.executeJob(job);

      expect(mockConversationService.createConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'codex',
          extra: expect.objectContaining({
            backend: 'codex',
            workspace: '/workspace',
            sessionMode: 'yolo',
          }),
        })
      );
      expect(taskManager.getOrBuildTask).toHaveBeenCalledWith('created-conv', { yoloMode: true });
      expect(task.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('does not reuse legacy ACP child conversations for existing Codex jobs', async () => {
      mockConversationService.getConversationsByCronJob.mockResolvedValueOnce([{ id: 'legacy-acp-conv' }]);
      mockConversationService.getConversation.mockResolvedValueOnce({
        id: 'legacy-acp-conv',
        type: 'acp',
        name: 'Legacy ACP Codex',
        extra: { backend: 'codex', cronWorkspace: '/workspace', workspace: '/workspace' },
      });
      const task = makeTask('codex');
      const taskManager = makeTaskManager({
        getTask: vi.fn(() => undefined),
        getOrBuildTask: vi.fn(async () => task as any),
      });
      const executor = new WorkerTaskManagerJobExecutor(taskManager, busyGuard);
      const job = makeJob('seed-conv');
      job.target.executionMode = 'existing';
      job.metadata.agentConfig = {
        backend: 'codex',
        name: 'Codex',
        workspace: '/workspace',
      };

      await executor.executeJob(job);

      expect(mockConversationService.createConversation).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'codex' })
      );
      expect(taskManager.getOrBuildTask).toHaveBeenCalledWith('created-conv', { yoloMode: true });
    });
  });

  describe('buildMessageText behavior', () => {
    it('includes [Scheduled Task Execution] header when hasSkill=false and executionMode is not new_conversation', async () => {
      const task = makeTask('acp');
      const taskManager = makeTaskManager({
        getTask: vi.fn(() => task as any),
      });
      const executor = new WorkerTaskManagerJobExecutor(taskManager, busyGuard);
      const job = makeJob('conv-1');

      await executor.executeJob(job);

      const sentArg = task.sendMessage.mock.calls[0][0];
      expect(sentArg.content).toContain('[Scheduled Task Execution]');
      expect(sentArg.content).toContain('Test Job');
      expect(sentArg.content).toContain('every minute');
      expect(sentArg.content).toContain('hello');
    });

    it('uses [Scheduled Task Context] without skill reminder when hasSkill=false and executionMode=new_conversation', async () => {
      const task = makeTask('acp');
      const taskManager = makeTaskManager({
        getTask: vi.fn(() => task as any),
      });
      const executor = new WorkerTaskManagerJobExecutor(taskManager, busyGuard);
      const job = makeJob('conv-1');
      job.target.executionMode = 'new_conversation';

      await executor.executeJob(job);

      const sentArg = task.sendMessage.mock.calls[0][0];
      expect(sentArg.content).toContain('[Scheduled Task Context]');
      expect(sentArg.content).toContain('Schedule:');
      expect(sentArg.content).not.toContain('skill file with detailed instructions');
      expect(sentArg.content).toContain('hello');
    });

    it('uses skill-aware prompt when hasSkill=true and executionMode=new_conversation', async () => {
      const { hasCronSkillFile } = await import('@/process/services/cron/cronSkillFile');
      vi.mocked(hasCronSkillFile).mockResolvedValueOnce(true);

      const task = makeTask('acp');
      const taskManager = makeTaskManager({
        getTask: vi.fn(() => task as any),
      });
      const executor = new WorkerTaskManagerJobExecutor(taskManager, busyGuard);
      const job = makeJob('conv-1');
      job.target.executionMode = 'new_conversation';

      await executor.executeJob(job);

      const sentArg = task.sendMessage.mock.calls[0][0];
      expect(sentArg.content).toContain('[Scheduled Task Context]');
      expect(sentArg.content).toContain('skill file with detailed instructions');
      expect(sentArg.content).not.toContain('[Scheduled Task Execution]');
      expect(sentArg.content).not.toContain('Schedule:');
      expect(sentArg.content).toContain('hello');
    });
  });

  describe('hidden flag', () => {
    it('sets hidden=true on all cron messages', async () => {
      const task = makeTask('acp');
      const taskManager = makeTaskManager({
        getTask: vi.fn(() => task as any),
      });
      const executor = new WorkerTaskManagerJobExecutor(taskManager, busyGuard);

      await executor.executeJob(makeJob('conv-1'));

      expect(task.sendMessage).toHaveBeenCalledWith(expect.objectContaining({ hidden: true }));
    });
  });

  describe('cronMeta attachment', () => {
    it('includes cronMeta with source, cronJobId, cronJobName, and triggeredAt', async () => {
      const task = makeTask('acp');
      const taskManager = makeTaskManager({
        getTask: vi.fn(() => task as any),
      });
      const executor = new WorkerTaskManagerJobExecutor(taskManager, busyGuard);
      const before = Date.now();

      await executor.executeJob(makeJob('conv-1'));

      const sentArg = task.sendMessage.mock.calls[0][0];
      expect(sentArg.cronMeta).toBeDefined();
      expect(sentArg.cronMeta.source).toBe('cron');
      expect(sentArg.cronMeta.cronJobId).toBe('job-1');
      expect(sentArg.cronMeta.cronJobName).toBe('Test Job');
      expect(sentArg.cronMeta.triggeredAt).toBeGreaterThanOrEqual(before);
      expect(sentArg.cronMeta.triggeredAt).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('Gemini agent', () => {
    it('passes both content and input keys for gemini task type', async () => {
      const task = makeTask('gemini');
      const taskManager = makeTaskManager({
        getTask: vi.fn(() => task as any),
      });
      const executor = new WorkerTaskManagerJobExecutor(taskManager, busyGuard);

      await executor.executeJob(makeJob('conv-1'));

      const sentArg = task.sendMessage.mock.calls[0][0];
      expect(sentArg.input).toBeDefined();
      expect(sentArg.input).toContain('hello');
      expect(sentArg.content).toContain('hello');
    });

    it('includes hidden and cronMeta for gemini agent messages', async () => {
      const task = makeTask('gemini');
      const taskManager = makeTaskManager({
        getTask: vi.fn(() => task as any),
      });
      const executor = new WorkerTaskManagerJobExecutor(taskManager, busyGuard);

      await executor.executeJob(makeJob('conv-1'));

      const sentArg = task.sendMessage.mock.calls[0][0];
      expect(sentArg.hidden).toBe(true);
      expect(sentArg.cronMeta).toEqual(
        expect.objectContaining({
          source: 'cron',
          cronJobId: 'job-1',
          cronJobName: 'Test Job',
        })
      );
    });
  });
});
