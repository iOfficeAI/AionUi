import { beforeEach, describe, expect, it, vi } from 'vitest';

const turnCompletedEmit = vi.fn();
const responseStreamOn = vi.fn();
const turnCompletedOn = vi.fn();
const listChangedOn = vi.fn();
const flushConversationMessages = vi.fn(async () => {});
const getConversation = vi.fn();
const getConversationMessages = vi.fn();
const getConversationRuntimeTask = vi.fn();
const cronBusyGuardIsProcessing = vi.fn();
const cronBusyGuardGetLastActiveAt = vi.fn();
const showNotification = vi.fn(async () => {});
const i18nT = vi.fn((key: string) => {
  if (key === 'cron.notification.taskComplete') return 'Task Complete';
  if (key === 'cron.notification.taskDone') return 'Task done';
  return key;
});

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      responseStream: {
        on: responseStreamOn,
      },
      turnCompleted: {
        on: turnCompletedOn,
        emit: turnCompletedEmit,
      },
      listChanged: {
        on: listChangedOn,
      },
    },
  },
}));

vi.mock('@process/utils/message', () => ({
  flushConversationMessages,
}));

vi.mock('@process/services/database', () => ({
  getDatabase: vi.fn(async () => ({
    getConversation,
  })),
  getDatabaseSync: vi.fn(() => ({
    getConversation,
    getConversationMessages,
  })),
}));

vi.mock('@process/services/ConversationRuntimeService', () => ({
  getConversationRuntimeTask,
}));

vi.mock('@process/services/cron/CronBusyGuard', () => ({
  cronBusyGuard: {
    isProcessing: cronBusyGuardIsProcessing,
    getLastActiveAt: cronBusyGuardGetLastActiveAt,
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

const buildConversation = () => ({
  id: 'session-1',
  name: 'Hello',
  type: 'acp',
  status: null,
  extra: {
    workspace: 'E:/workspace',
    backend: 'qwen',
    agentName: 'Qwen Code',
    currentModelId: 'glm-5(openai)',
  },
});

const buildAssistantMessage = () => ({
  id: 'assistant-1',
  type: 'text',
  content: {
    content: 'done',
  },
  position: 'left',
  status: null,
  createdAt: 1,
});

describe('ConversationTurnCompletionService', () => {
  beforeEach(() => {
    vi.resetModules();
    turnCompletedEmit.mockReset();
    responseStreamOn.mockReset();
    responseStreamOn.mockReturnValue(() => {});
    turnCompletedOn.mockReset();
    turnCompletedOn.mockReturnValue(() => {});
    listChangedOn.mockReset();
    listChangedOn.mockReturnValue(() => {});
    flushConversationMessages.mockReset();
    flushConversationMessages.mockResolvedValue(undefined);
    getConversation.mockReset();
    getConversation.mockReturnValue({
      success: true,
      data: buildConversation(),
    });
    getConversationMessages.mockReset();
    getConversationMessages.mockReturnValue({
      data: [buildAssistantMessage()],
    });
    getConversationRuntimeTask.mockReset();
    getConversationRuntimeTask.mockReturnValue({
      task: {
        status: 'finished',
        getConfirmations: () => [],
      },
    });
    cronBusyGuardIsProcessing.mockReset();
    cronBusyGuardIsProcessing.mockReturnValue(false);
    cronBusyGuardGetLastActiveAt.mockReset();
    cronBusyGuardGetLastActiveAt.mockReturnValue(undefined);
    showNotification.mockClear();
    i18nT.mockClear();
    i18nT.mockImplementation((key: string) => {
      if (key === 'cron.notification.taskComplete') return 'Task Complete';
      if (key === 'cron.notification.taskDone') return 'Task done';
      return key;
    });
  });

  it('notifies in-process listeners when a turn completes', async () => {
    const { ConversationTurnCompletionService } =
      await import('../../../src/process/services/ConversationTurnCompletionService');
    const service = ConversationTurnCompletionService.getInstance();
    const listener = vi.fn();

    const unsubscribe = service.onTurnCompleted(listener);
    await service.notifyPotentialCompletion('session-1');
    unsubscribe();

    expect(flushConversationMessages).toHaveBeenCalledWith('session-1');
    expect(turnCompletedEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        state: 'ai_waiting_input',
        turnPhase: 'delivered',
        turnTimings: expect.objectContaining({
          deliveredAt: expect.any(Number),
        }),
      })
    );
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        lastMessage: expect.objectContaining({
          id: 'assistant-1',
        }),
      })
    );
  });

  it('shows a notification when a regular turn completes', async () => {
    const { ConversationTurnCompletionService } =
      await import('../../../src/process/services/ConversationTurnCompletionService');

    await ConversationTurnCompletionService.getInstance().notifyPotentialCompletion('session-1');

    expect(showNotification).toHaveBeenCalledWith({
      title: 'Hello',
      body: 'Task done',
      conversationId: 'session-1',
    });
  });

  it('does not send the regular completion notification for scheduled task conversations', async () => {
    getConversation.mockReturnValue({
      success: true,
      data: {
        ...buildConversation(),
        extra: {
          ...buildConversation().extra,
          cronJobId: 'cron-1',
        },
      },
    });
    const { ConversationTurnCompletionService } =
      await import('../../../src/process/services/ConversationTurnCompletionService');

    await ConversationTurnCompletionService.getInstance().notifyPotentialCompletion('session-1');

    expect(showNotification).not.toHaveBeenCalled();
  });

  it('shows a notification when the legacy task completion service emits a regular completion', async () => {
    const { ConversationTurnCompletionService } =
      await import('../../../src/process/task/ConversationTurnCompletionService');

    await ConversationTurnCompletionService.getInstance().notifyPotentialCompletion('session-1');

    expect(showNotification).toHaveBeenCalledWith({
      title: 'Hello',
      body: 'Task done',
      conversationId: 'session-1',
    });
  });

  it('keeps emitting to bridge clients even when a local listener fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      const { ConversationTurnCompletionService } =
        await import('../../../src/process/services/ConversationTurnCompletionService');
      const service = ConversationTurnCompletionService.getInstance();
      const failingListener = vi.fn(() => {
        throw new Error('listener failed');
      });

      const unsubscribe = service.onTurnCompleted(failingListener);
      await service.notifyPotentialCompletion('session-1');
      unsubscribe();

      expect(turnCompletedEmit).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1',
        })
      );
      expect(consoleError).toHaveBeenCalledWith(
        '[ConversationTurnCompletionService] turnCompleted listener failed:',
        expect.any(Error)
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
