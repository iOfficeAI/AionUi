import { beforeEach, describe, expect, it, vi } from 'vitest';

type TurnCompletedListener =
  | ((event: {
      sessionId: string;
      status: 'pending' | 'running' | 'finished';
      state:
        | 'ai_generating'
        | 'ai_waiting_input'
        | 'ai_waiting_confirmation'
        | 'initializing'
        | 'stopped'
        | 'error'
        | 'unknown';
      detail: string;
      canSendMessage: boolean;
      runtime: {
        hasTask: boolean;
        taskStatus?: 'pending' | 'running' | 'finished';
        isProcessing: boolean;
        pendingConfirmations: number;
        dbStatus?: 'pending' | 'running' | 'finished';
      };
      workspace: string;
      model: {
        platform: string;
        name: string;
        useModel: string;
      };
      lastMessage: {
        id?: string;
        type?: string;
        content: unknown;
        status?: string | null;
        createdAt: number;
      };
    }) => Promise<void> | void)
  | null;

const buildTurnCompletedEvent = () => ({
  sessionId: 'session-1',
  status: 'finished' as const,
  state: 'ai_waiting_input' as const,
  detail: 'AI is waiting for input',
  canSendMessage: true,
  runtime: {
    hasTask: true,
    taskStatus: 'finished' as const,
    isProcessing: false,
    pendingConfirmations: 0,
    dbStatus: 'finished' as const,
  },
  workspace: 'E:/workspace',
  model: {
    platform: 'qwen',
    name: 'Qwen',
    useModel: 'qwen-max',
  },
  lastMessage: {
    id: 'assistant-1',
    type: 'text',
    content: { content: 'done' },
    status: 'finish',
    createdAt: 1,
  },
});

describe('ApiCallbackManager', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('sends outbound callbacks even when the local HTTP API toggle is off', async () => {
    let turnCompletedListener: TurnCompletedListener = null;
    const sendCallback = vi.fn(async () => ({ success: true }));
    const getApiConfig = vi.fn(() => ({
      success: true,
      data: {
        id: 1,
        enabled: false,
        callbackEnabled: true,
        callbackUrl: 'https://callback.example.com/webhook',
        callbackMethod: 'POST' as const,
        createdAt: 1,
        updatedAt: 1,
      },
    }));
    const getConversationMessages = vi.fn(() => ({
      data: [
        {
          id: 'assistant-1',
          type: 'text',
          position: 'left',
          content: { content: 'done' },
          createdAt: 1,
        },
      ],
    }));

    vi.doMock('@process/services/ConversationTurnCompletionService', () => ({
      ConversationTurnCompletionService: {
        getInstance: vi.fn(() => ({
          onTurnCompleted: vi.fn((listener: TurnCompletedListener) => {
            turnCompletedListener = listener;
            return vi.fn();
          }),
        })),
      },
    }));
    vi.doMock('@process/services/database', () => ({
      getDatabase: vi.fn(async () => ({
        getApiConfig,
        getConversationMessages,
      })),
    }));
    vi.doMock('@/webserver/services/CallbackService', () => ({
      CallbackService: {
        sendCallback,
      },
    }));

    const { ApiCallbackManager } = await import('../../../src/process/services/ApiCallbackManager');
    ApiCallbackManager.getInstance();

    await turnCompletedListener?.(buildTurnCompletedEvent());

    expect(getApiConfig).toHaveBeenCalledTimes(1);
    expect(getConversationMessages).toHaveBeenCalledWith('session-1', 0, 100);
    expect(sendCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
        callbackEnabled: true,
        callbackUrl: 'https://callback.example.com/webhook',
      }),
      expect.objectContaining({
        sessionId: 'session-1',
        conversationHistory: [
          expect.objectContaining({
            id: 'assistant-1',
          }),
        ],
      })
    );

    ApiCallbackManager.destroyInstance();
  });

  it('skips callbacks when the callback URL is blank even if the API config exists', async () => {
    let turnCompletedListener: TurnCompletedListener = null;
    const sendCallback = vi.fn(async () => ({ success: true }));

    vi.doMock('@process/services/ConversationTurnCompletionService', () => ({
      ConversationTurnCompletionService: {
        getInstance: vi.fn(() => ({
          onTurnCompleted: vi.fn((listener: TurnCompletedListener) => {
            turnCompletedListener = listener;
            return vi.fn();
          }),
        })),
      },
    }));
    vi.doMock('@process/services/database', () => ({
      getDatabase: vi.fn(async () => ({
        getApiConfig: vi.fn(() => ({
          success: true,
          data: {
            id: 1,
            enabled: true,
            callbackEnabled: true,
            callbackUrl: '   ',
            callbackMethod: 'POST' as const,
            createdAt: 1,
            updatedAt: 1,
          },
        })),
        getConversationMessages: vi.fn(() => ({
          data: [],
        })),
      })),
    }));
    vi.doMock('@/webserver/services/CallbackService', () => ({
      CallbackService: {
        sendCallback,
      },
    }));

    const { ApiCallbackManager } = await import('../../../src/process/services/ApiCallbackManager');
    ApiCallbackManager.getInstance();

    await turnCompletedListener?.(buildTurnCompletedEvent());

    expect(sendCallback).not.toHaveBeenCalled();

    ApiCallbackManager.destroyInstance();
  });
});
