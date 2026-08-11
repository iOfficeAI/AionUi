/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const emitSpy = vi.fn();
const responseStreamOn = vi.fn();
const turnCompletedOn = vi.fn();
const listChangedOn = vi.fn();
let flushed = false;
const getTask = vi.fn(() => undefined);
const getConversationRuntimeTask = vi.fn(() => ({ task: undefined }));
const isProcessing = vi.fn(() => false);
const getLastActiveAt = vi.fn(() => undefined);
const showNotification = vi.fn(async () => {});
const i18nT = vi.fn((key: string) => {
  if (key === 'cron.notification.taskComplete') return 'Task Complete';
  if (key === 'cron.notification.taskDone') return 'Task done';
  return key;
});
const buildDatabaseMock = () => ({
  getConversation: vi.fn(() => ({
    success: true,
    data: {
      id: 'session-1',
      type: 'gemini',
      status: 'finished',
      extra: {
        workspace: 'E:/workspace',
      },
      model: {
        platform: 'openai',
        name: 'OpenAI',
        useModel: 'gpt-4o-mini',
      },
    },
  })),
  getConversationMessages: vi.fn(() => ({
    data: [
      flushed
        ? {
            id: 'assistant-1',
            type: 'text',
            position: 'left',
            content: { content: 'done' },
            createdAt: 1,
          }
        : {
            id: 'user-1',
            type: 'text',
            position: 'right',
            content: { content: 'hello' },
            createdAt: 0,
          },
    ],
  })),
});

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      responseStream: {
        on: responseStreamOn,
      },
      turnCompleted: {
        on: turnCompletedOn,
        emit: emitSpy,
      },
      listChanged: {
        on: listChangedOn,
      },
    },
  },
}));

vi.mock('@process/utils/message', () => ({
  flushConversationMessages: vi.fn(async () => {
    flushed = true;
  }),
}));

vi.mock('@process/task/workerTaskManagerSingleton', () => ({
  workerTaskManager: {
    getTask,
  },
}));

vi.mock('@process/services/ConversationRuntimeService', () => ({
  getConversationRuntimeTask,
}));

vi.mock('@process/services/cron/CronBusyGuard', () => ({
  cronBusyGuard: {
    isProcessing,
    getLastActiveAt,
  },
}));

vi.mock('@process/bridge/notificationBridge', () => ({
  showNotification,
}));

vi.mock('@process/services/i18n', () => ({
  default: {
    t: i18nT,
  },
  i18nReady: Promise.resolve(),
}));

vi.mock('@process/services/database', () => ({
  getDatabase: async () => buildDatabaseMock(),
  getDatabaseSync: () => buildDatabaseMock(),
}));

describe('ConversationTurnCompletionService', () => {
  beforeEach(() => {
    flushed = false;
    emitSpy.mockReset();
    responseStreamOn.mockReset();
    responseStreamOn.mockReturnValue(() => {});
    turnCompletedOn.mockReset();
    turnCompletedOn.mockReturnValue(() => {});
    listChangedOn.mockReset();
    listChangedOn.mockReturnValue(() => {});
    getTask.mockReset();
    getTask.mockReturnValue(undefined);
    getConversationRuntimeTask.mockReset();
    getConversationRuntimeTask.mockImplementation((sessionId: string) => ({
      task: getTask(sessionId),
    }));
    isProcessing.mockReset();
    isProcessing.mockReturnValue(false);
    getLastActiveAt.mockReset();
    getLastActiveAt.mockReturnValue(undefined);
    showNotification.mockClear();
    i18nT.mockClear();
    i18nT.mockImplementation((key: string) => {
      if (key === 'cron.notification.taskComplete') return 'Task Complete';
      if (key === 'cron.notification.taskDone') return 'Task done';
      return key;
    });
    vi.resetModules();
  });

  it('flushes pending messages before emitting turn completion', async () => {
    const { ConversationTurnCompletionService } =
      await import('../../src/process/services/ConversationTurnCompletionService');

    await ConversationTurnCompletionService.getInstance().notifyPotentialCompletion('session-1');

    expect(flushed).toBe(true);
    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        state: 'stopped',
        lastMessage: expect.objectContaining({
          id: 'assistant-1',
        }),
      })
    );
  });

  it('supports read-only status snapshots without touching task liveness', async () => {
    const task = {
      status: 'finished',
      getConfirmations: () => [],
    };
    getTask.mockReturnValue(task);

    const { getConversationStatusSnapshot } =
      await import('../../src/process/services/ConversationTurnCompletionService');

    const snapshot = getConversationStatusSnapshot('session-1', {
      touchTask: false,
    });

    expect(snapshot).toEqual(
      expect.objectContaining({
        sessionId: 'session-1',
        status: 'finished',
        state: 'ai_waiting_input',
      })
    );
    expect(getTask).toHaveBeenCalledWith('session-1');
  });

  it('prefers the AionUI live generating state while stream activity is still in progress', async () => {
    const task = {
      status: 'finished',
      getConfirmations: () => [],
    };
    getTask.mockReturnValue(task);

    const { getConversationStatusSnapshot } =
      await import('../../src/process/services/ConversationTurnCompletionService');

    const handleResponseStream = responseStreamOn.mock.calls[0]?.[0] as
      | ((message: { conversation_id: string; type: string; data: unknown; msg_id: string }) => void)
      | undefined;

    handleResponseStream?.({
      conversation_id: 'session-1',
      type: 'content',
      data: 'partial',
      msg_id: 'assistant-1',
    });

    const snapshot = getConversationStatusSnapshot('session-1', {
      touchTask: false,
    });

    expect(snapshot).toEqual(
      expect.objectContaining({
        status: 'running',
        state: 'ai_generating',
        canSendMessage: false,
      })
    );
  });

  it('keeps generating state while processing activity is still fresh', async () => {
    const task = {
      status: 'finished',
      getConfirmations: () => [],
    };
    flushed = true;
    getTask.mockReturnValue(task);
    isProcessing.mockReturnValue(true);
    getLastActiveAt.mockReturnValue(Date.now());

    const { getConversationStatusSnapshot } =
      await import('../../src/process/services/ConversationTurnCompletionService');

    const snapshot = getConversationStatusSnapshot('session-1', {
      touchTask: false,
    });

    expect(snapshot).toEqual(
      expect.objectContaining({
        status: 'running',
        state: 'ai_generating',
        runtime: expect.objectContaining({
          isProcessing: true,
          processingStale: false,
        }),
      })
    );
  });

  it('ignores stale processing flags after finished output stops updating', async () => {
    const task = {
      status: 'finished',
      getConfirmations: () => [],
    };
    flushed = true;
    getTask.mockReturnValue(task);
    isProcessing.mockReturnValue(true);
    getLastActiveAt.mockReturnValue(Date.now() - 3 * 60 * 1000);

    const { getConversationStatusSnapshot } =
      await import('../../src/process/services/ConversationTurnCompletionService');

    const snapshot = getConversationStatusSnapshot('session-1', {
      touchTask: false,
    });

    expect(snapshot).toEqual(
      expect.objectContaining({
        status: 'finished',
        state: 'ai_waiting_input',
        runtime: expect.objectContaining({
          isProcessing: false,
          processingStale: true,
        }),
      })
    );
  });
});
