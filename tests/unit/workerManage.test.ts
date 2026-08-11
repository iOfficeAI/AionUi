/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const releaseConversationMessageCache = vi.fn(() => Promise.resolve());
const getConversation = vi.fn();
const removeBusyState = vi.fn();
const forgetSession = vi.fn();
const workerTaskManagerGetTask = vi.fn();
const workerTaskManagerGetOrBuildTask = vi.fn();

vi.mock('@process/utils/initStorage', () => ({
  ProcessChat: {
    get: vi.fn(async () => []),
  },
}));

vi.mock('@process/services/database', () => ({
  getDatabase: vi.fn(() =>
    Promise.resolve({
      getConversation,
    })
  ),
  getDatabaseSync: vi.fn(() => ({
    getConversation,
  })),
}));

vi.mock('@process/utils/message', () => ({
  releaseConversationMessageCache,
}));

vi.mock('@process/services/cron/CronBusyGuard', () => ({
  cronBusyGuard: {
    isProcessing: vi.fn(() => false),
    remove: removeBusyState,
  },
}));

vi.mock('@process/services/ConversationTurnCompletionService', () => ({
  ConversationTurnCompletionService: {
    getInstance: () => ({
      forgetSession,
    }),
  },
}));

vi.mock('@process/task/workerTaskManagerSingleton', () => ({
  workerTaskManager: {
    getTask: workerTaskManagerGetTask,
    getOrBuildTask: workerTaskManagerGetOrBuildTask,
  },
}));

vi.mock('@process/task/AcpAgentManager', () => ({
  default: class AcpAgentManager {},
}));

vi.mock('@process/task/GeminiAgentManager', () => ({
  GeminiAgentManager: class GeminiAgentManager {},
}));

vi.mock('@process/task/NanoBotAgentManager', () => ({
  default: class NanoBotAgentManager {},
}));

vi.mock('@process/task/OpenClawAgentManager', () => ({
  default: class OpenClawAgentManager {},
}));

vi.mock('@process/task/CodexAgentManager', () => ({
  default: class CodexAgentManager {},
}));

describe('WorkerManage.kill', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-12T00:00:00.000Z'));
    releaseConversationMessageCache.mockReset();
    releaseConversationMessageCache.mockResolvedValue(undefined);
    removeBusyState.mockReset();
    forgetSession.mockReset();
    getConversation.mockReset();
    workerTaskManagerGetTask.mockReset();
    workerTaskManagerGetTask.mockReturnValue(undefined);
    workerTaskManagerGetOrBuildTask.mockReset();
    workerTaskManagerGetOrBuildTask.mockRejectedValue(new Error('task not found'));
    getConversation.mockImplementation((id: string) => {
      if (id === 'finished-1') {
        return {
          success: true,
          data: {
            id,
            source: 'api',
            extra: {},
          },
        };
      }

      if (id === 'running-1') {
        return {
          success: true,
          data: {
            id,
            source: 'api',
            extra: {},
          },
        };
      }

      return {
        success: true,
        data: {
          id,
          source: 'aionui',
          extra: {},
        },
      };
    });
    vi.resetModules();
  });

  afterEach(async () => {
    const { default: WorkerManage } = await import('../../src/process/WorkerManage');
    WorkerManage.clear();
    vi.useRealTimers();
  });

  it('destroys runtime state and clears related caches explicitly on kill', async () => {
    const { default: WorkerManage } = await import('../../src/process/WorkerManage');

    const finishedTask = {
      type: 'gemini',
      status: 'finished',
      getConfirmations: () => [],
      kill: vi.fn(),
    } as unknown as {
      type: 'gemini';
      status: 'finished';
      getConfirmations: () => [];
      kill: () => void;
    };
    WorkerManage.addTask('finished-1', finishedTask);
    WorkerManage.kill('finished-1');

    expect(finishedTask.kill).toHaveBeenCalledTimes(1);
    expect(WorkerManage.getTaskById('finished-1')).toBeUndefined();
    expect(releaseConversationMessageCache).toHaveBeenCalledWith('finished-1', {
      persistPending: true,
    });
    expect(removeBusyState).toHaveBeenCalledWith('finished-1');
    expect(forgetSession).toHaveBeenCalledWith('finished-1');
  });

  it('reuses existing workerTaskManager task when sending messages', async () => {
    const { default: WorkerManage } = await import('../../src/process/WorkerManage');

    const sendMessage = vi.fn().mockResolvedValue(undefined);
    workerTaskManagerGetTask.mockReturnValue({
      type: 'gemini',
      status: 'running',
      sendMessage,
    });

    const result = await WorkerManage.sendMessage('session-1', 'hello', 'msg-1');

    expect(result).toEqual({ success: true });
    expect(sendMessage).toHaveBeenCalledWith({
      input: 'hello',
      msg_id: 'msg-1',
      files: undefined,
    });
    expect(workerTaskManagerGetOrBuildTask).not.toHaveBeenCalled();
    expect(getConversation).not.toHaveBeenCalled();
  });
});
