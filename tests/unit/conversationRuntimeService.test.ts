/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const workerManageGetTaskById = vi.fn(() => undefined);
const workerManagePeekTaskById = vi.fn(() => undefined);
const workerManageListTasks = vi.fn(() => []);
const workerManageKillAndDrain = vi.fn(async () => undefined);

const workerTaskManagerGetTask = vi.fn(() => undefined);
const workerTaskManagerListTasks = vi.fn(() => []);
const workerTaskManagerKill = vi.fn(() => undefined);
const workerTaskManagerRemoveTask = vi.fn(() => undefined);

const cronBusyGuardRemove = vi.fn(() => undefined);
const releaseConversationMessageCache = vi.fn(async () => undefined);
const forgetSession = vi.fn(() => undefined);
const forgetLiveSession = vi.fn(() => undefined);

vi.mock('@process/WorkerManage', () => ({
  default: {
    getTaskById: workerManageGetTaskById,
    peekTaskById: workerManagePeekTaskById,
    listTasks: workerManageListTasks,
    killAndDrain: workerManageKillAndDrain,
  },
}));

vi.mock('@process/task/workerTaskManagerSingleton', () => ({
  workerTaskManager: {
    getTask: workerTaskManagerGetTask,
    listTasks: workerTaskManagerListTasks,
    kill: workerTaskManagerKill,
    removeTask: workerTaskManagerRemoveTask,
  },
}));

vi.mock('@process/services/cron/CronBusyGuard', () => ({
  cronBusyGuard: {
    remove: cronBusyGuardRemove,
  },
}));

vi.mock('@process/utils/message', () => ({
  releaseConversationMessageCache,
}));

vi.mock('@process/services/ConversationTurnCompletionService', () => ({
  ConversationTurnCompletionService: {
    getInstance: () => ({
      forgetSession,
    }),
  },
}));

vi.mock('@process/services/ConversationLiveStateService', () => ({
  conversationLiveStateService: {
    forgetSession: forgetLiveSession,
  },
}));

describe('ConversationRuntimeService', () => {
  beforeEach(() => {
    workerManageGetTaskById.mockReset();
    workerManagePeekTaskById.mockReset();
    workerManageListTasks.mockReset();
    workerManageKillAndDrain.mockReset();
    workerTaskManagerGetTask.mockReset();
    workerTaskManagerListTasks.mockReset();
    workerTaskManagerKill.mockReset();
    workerTaskManagerRemoveTask.mockReset();
    cronBusyGuardRemove.mockReset();
    releaseConversationMessageCache.mockReset();
    forgetSession.mockReset();
    forgetLiveSession.mockReset();

    workerManageGetTaskById.mockReturnValue(undefined);
    workerManagePeekTaskById.mockReturnValue(undefined);
    workerManageListTasks.mockReturnValue([]);
    workerManageKillAndDrain.mockResolvedValue(undefined);
    workerTaskManagerGetTask.mockReturnValue(undefined);
    workerTaskManagerListTasks.mockReturnValue([]);
    workerTaskManagerKill.mockReturnValue(undefined);
    workerTaskManagerRemoveTask.mockReturnValue(undefined);
    cronBusyGuardRemove.mockReturnValue(undefined);
    releaseConversationMessageCache.mockResolvedValue(undefined);
    forgetSession.mockReturnValue(undefined);
    forgetLiveSession.mockReturnValue(undefined);
  });

  it('reads runtime task state from workerTaskManager only', async () => {
    const workerTask = {
      status: 'finished',
      getConfirmations: () => [],
    };

    workerTaskManagerGetTask.mockReturnValue(workerTask);

    const { getConversationRuntimeTask } = await import('../../src/process/services/ConversationRuntimeService');

    expect(
      getConversationRuntimeTask('session-1', {
        touchLegacyTask: false,
      })
    ).toEqual(
      expect.objectContaining({
        task: workerTask,
        source: 'workerTaskManager',
        workerTask,
      })
    );
  });

  it('lists runtime task ids from workerTaskManager only', async () => {
    workerTaskManagerListTasks.mockReturnValue([
      { id: 'conv-worker', type: 'gemini' },
      { id: 'conv-shared', type: 'acp' },
    ]);
    workerManageListTasks.mockReturnValue([
      { id: 'conv-shared', type: 'acp' },
      { id: 'conv-legacy', type: 'codex' },
    ]);

    const { listConversationRuntimeTaskIds } = await import('../../src/process/services/ConversationRuntimeService');

    expect(listConversationRuntimeTaskIds()).toEqual(['conv-worker', 'conv-shared']);
  });

  it('drains worker-only runtime state and cleans runtime artifacts', async () => {
    const workerTask = {
      status: 'running',
      getConfirmations: () => [],
    };

    workerTaskManagerGetTask.mockReturnValue(workerTask);

    const { drainConversationRuntime } = await import('../../src/process/services/ConversationRuntimeService');

    await drainConversationRuntime('session-1');

    expect(workerTaskManagerRemoveTask).toHaveBeenCalledWith('session-1');
    expect(workerTaskManagerKill).not.toHaveBeenCalled();
    expect(workerManageKillAndDrain).not.toHaveBeenCalled();
    expect(cronBusyGuardRemove).toHaveBeenCalledWith('session-1');
    expect(forgetSession).toHaveBeenCalledWith('session-1');
    expect(forgetLiveSession).toHaveBeenCalledWith('session-1');
    expect(releaseConversationMessageCache).toHaveBeenCalledWith('session-1', {
      persistPending: true,
    });
  });
});
