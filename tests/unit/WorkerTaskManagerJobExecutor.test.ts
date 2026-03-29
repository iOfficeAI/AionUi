import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: vi.fn(() => '/tmp') } }));
vi.mock('@/common/utils', () => ({ uuid: vi.fn(() => 'test-uuid') }));
vi.mock('@process/utils', () => ({ copyFilesToDirectory: vi.fn(async () => []) }));

import { WorkerTaskManagerJobExecutor } from '../../src/process/services/cron/WorkerTaskManagerJobExecutor';
import { CronBusyGuard } from '../../src/process/services/cron/CronBusyGuard';
import type { IWorkerTaskManager } from '../../src/process/task/IWorkerTaskManager';
import type { CronJob } from '../../src/process/services/cron/CronStore';

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
});
