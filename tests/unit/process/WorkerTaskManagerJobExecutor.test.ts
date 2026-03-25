import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IConversationRepository } from '../../../src/process/services/database/IConversationRepository';
import type { CronBusyGuard } from '../../../src/process/services/cron/CronBusyGuard';
import type { CronJob } from '../../../src/process/services/cron/CronStore';
import type { IWorkerTaskManager } from '../../../src/process/task/IWorkerTaskManager';

vi.mock('../../../src/process/utils', () => ({
  copyFilesToDirectory: vi.fn(async () => []),
}));

import { WorkerTaskManagerJobExecutor } from '../../../src/process/services/cron/WorkerTaskManagerJobExecutor';

function makeConversationRepo(overrides: Partial<IConversationRepository> = {}): IConversationRepository {
  return {
    getConversation: vi.fn(async () => undefined),
    createConversation: vi.fn(async () => {}),
    updateConversation: vi.fn(async () => {}),
    deleteConversation: vi.fn(async () => {}),
    getMessages: vi.fn(async () => ({ data: [], total: 0, hasMore: false })),
    insertMessage: vi.fn(async () => {}),
    getUserConversations: vi.fn(async () => ({ data: [], total: 0, hasMore: false })),
    listAllConversations: vi.fn(async () => []),
    searchMessages: vi.fn(async () => ({ data: [], total: 0, hasMore: false })),
    ...overrides,
  };
}

function makeTaskManager(overrides: Partial<IWorkerTaskManager> = {}): IWorkerTaskManager {
  return {
    getTask: vi.fn(() => undefined),
    getOrBuildTask: vi.fn(async () => {
      throw new Error('not implemented');
    }),
    addTask: vi.fn(),
    kill: vi.fn(),
    clear: vi.fn(),
    listTasks: vi.fn(() => []),
    ...overrides,
  };
}

function makeBusyGuard(): CronBusyGuard {
  return {
    setProcessing: vi.fn(),
    isProcessing: vi.fn(() => false),
    onceIdle: vi.fn(),
  } as unknown as CronBusyGuard;
}

function makeJob(overrides: Partial<CronJob> = {}): CronJob {
  return {
    id: 'job-1',
    name: 'Morning Sync',
    enabled: true,
    schedule: { kind: 'every', everyMs: 60000, description: 'Every minute' },
    target: { payload: { kind: 'message', text: 'daily summary' } },
    metadata: {
      conversationId: 'conv-1',
      agentType: 'gemini',
      createdBy: 'user',
      createdAt: 1,
      updatedAt: 1,
    },
    state: { runCount: 0, retryCount: 0, maxRetries: 3 },
    ...overrides,
  };
}

describe('WorkerTaskManagerJobExecutor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes raw and transformed prompt separately for gemini jobs', async () => {
    const sendMessage = vi.fn(async () => undefined);
    const taskManager = makeTaskManager({
      getTask: vi.fn(() => undefined),
      getOrBuildTask: vi.fn(async () => ({
        type: 'gemini',
        workspace: '/ws',
        sendMessage,
      })),
    });
    const busyGuard = makeBusyGuard();
    const conversationRepo = makeConversationRepo({
      getConversation: vi.fn(async () => ({
        id: 'conv-1',
        type: 'gemini',
        name: 'test',
        extra: { workspace: '/ws', enabledHooks: ['prompt-guard'] },
      })),
    });
    const hookRuntime = {
      applyBeforeUserPrompt: vi.fn(async () => ({
        content: 'hooked summary',
        appliedHooks: ['prompt-guard'],
      })),
    };

    const executor = new WorkerTaskManagerJobExecutor(taskManager, busyGuard, conversationRepo, hookRuntime);
    await executor.executeJob(makeJob());

    expect(hookRuntime.applyBeforeUserPrompt).toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        input: 'daily summary',
        agentInput: 'hooked summary',
      })
    );
  });

  it('passes transformed content for acp jobs', async () => {
    const sendMessage = vi.fn(async () => undefined);
    const taskManager = makeTaskManager({
      getTask: vi.fn(() => undefined),
      getOrBuildTask: vi.fn(async () => ({
        type: 'acp',
        workspace: '/ws',
        sendMessage,
      })),
    });
    const busyGuard = makeBusyGuard();
    const conversationRepo = makeConversationRepo({
      getConversation: vi.fn(async () => ({
        id: 'conv-1',
        type: 'acp',
        name: 'test',
        extra: { workspace: '/ws', backend: 'claude', enabledHooks: ['prompt-guard'] },
      })),
    });
    const hookRuntime = {
      applyBeforeUserPrompt: vi.fn(async () => ({
        content: 'hooked summary',
        appliedHooks: ['prompt-guard'],
      })),
    };

    const executor = new WorkerTaskManagerJobExecutor(taskManager, busyGuard, conversationRepo, hookRuntime);
    await executor.executeJob(makeJob({ metadata: { ...makeJob().metadata, agentType: 'claude' } }));

    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: 'daily summary',
        agentContent: 'hooked summary',
      })
    );
  });
});
