import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let responseHandler: ((message: Record<string, unknown>) => void) | null = null;
let turnCompletedHandler: ((event: Record<string, unknown>) => void) | null = null;

const mockConversationGetInvoke = vi.fn();
const mockConversationUpdateInvoke = vi.fn();
const mockAddOrUpdateMessage = vi.fn();
const mockEmitterEmit = vi.fn();
const mockResponseUnsubscribe = vi.fn();
const mockTurnCompletedUnsubscribe = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      key === 'conversation.aionrs.retryingDescription'
        ? `retry ${params?.attempt}/${params?.maxRetries} in ${params?.delaySeconds}s`
        : key,
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      responseStream: {
        on: (handler: (message: Record<string, unknown>) => void) => {
          responseHandler = handler;
          return mockResponseUnsubscribe;
        },
      },
      get: {
        invoke: (...args: unknown[]) => mockConversationGetInvoke(...args),
      },
      update: {
        invoke: (...args: unknown[]) => mockConversationUpdateInvoke(...args),
      },
      turnCompleted: {
        on: (handler: (event: Record<string, unknown>) => void) => {
          turnCompletedHandler = handler;
          return mockTurnCompletedUnsubscribe;
        },
      },
    },
  },
}));

vi.mock('@/common/chat/chatLib', () => ({
  transformMessage: vi.fn((message: { type: string; msg_id: string; conversation_id: string; data: unknown }) => {
    if (message.type !== 'content') {
      return null;
    }

    return {
      id: 'assistant-1',
      type: 'text',
      msg_id: message.msg_id,
      position: 'left',
      conversation_id: message.conversation_id,
      content: {
        content: String(message.data),
      },
    };
  }),
}));

vi.mock('@/renderer/pages/conversation/Messages/hooks', () => ({
  useAddOrUpdateMessage: () => mockAddOrUpdateMessage,
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    emit: (...args: unknown[]) => mockEmitterEmit(...args),
  },
}));

import { useAionrsMessage } from '@/renderer/pages/conversation/platforms/aionrs/useAionrsMessage';

describe('useAionrsMessage', () => {
  beforeEach(() => {
    responseHandler = null;
    turnCompletedHandler = null;
    mockConversationGetInvoke.mockReset();
    mockConversationGetInvoke.mockResolvedValue({
      status: 'finished',
      type: 'aionrs',
      extra: {},
    });
    mockConversationUpdateInvoke.mockReset();
    mockAddOrUpdateMessage.mockReset();
    mockEmitterEmit.mockReset();
    mockResponseUnsubscribe.mockReset();
    mockTurnCompletedUnsubscribe.mockReset();

    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      writable: true,
      value: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    });
    Object.defineProperty(window, 'cancelAnimationFrame', {
      configurable: true,
      writable: true,
      value: vi.fn(),
    });
  });

  it('surfaces provider retry events as transient thought status without adding a chat message', async () => {
    const { result } = renderHook(() => useAionrsMessage('conv-1'));

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      responseHandler?.({
        conversation_id: 'conv-1',
        type: 'provider_retry',
        msg_id: 'msg-1',
        data: {
          attempt: 1,
          maxRetries: 2,
          delayMs: 5000,
          error: 'Rate limited, retry after 5000ms',
        },
      });
    });

    expect(result.current.running).toBe(true);
    expect(result.current.thought).toEqual({
      subject: 'conversation.aionrs.retrying',
      description: 'retry 1/2 in 5s',
    });
    expect(mockAddOrUpdateMessage).not.toHaveBeenCalled();
  });

  it('clears active tool running state when the turn finishes', async () => {
    const { result } = renderHook(() => useAionrsMessage('conv-1'));

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      responseHandler?.({
        conversation_id: 'conv-1',
        type: 'start',
        msg_id: 'msg-1',
        data: '',
      });
      responseHandler?.({
        conversation_id: 'conv-1',
        type: 'tool_group',
        msg_id: 'msg-1',
        data: [{ status: 'Executing', name: 'Bash' }],
      });
    });

    expect(result.current.running).toBe(true);

    act(() => {
      responseHandler?.({
        conversation_id: 'conv-1',
        type: 'finish',
        msg_id: 'msg-1',
        data: '',
      });
    });

    expect(result.current.running).toBe(false);
  });

  it('clears running state when an error is received during tool execution', async () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useAionrsMessage('conv-1', { onError }));

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      responseHandler?.({
        conversation_id: 'conv-1',
        type: 'start',
        msg_id: 'msg-1',
        data: '',
      });
      responseHandler?.({
        conversation_id: 'conv-1',
        type: 'tool_group',
        msg_id: 'msg-1',
        data: [{ status: 'Executing', name: 'Bash' }],
      });
      responseHandler?.({
        conversation_id: 'conv-1',
        type: 'error',
        msg_id: 'msg-1',
        data: 'aionrs exited unexpectedly',
      });
    });

    expect(result.current.running).toBe(false);
    expect(onError).toHaveBeenCalled();
  });

  it('keeps running after a finalizing finish until turnCompleted arrives', async () => {
    const { result } = renderHook(() => useAionrsMessage('conv-1'));

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      responseHandler?.({
        conversation_id: 'conv-1',
        type: 'start',
        msg_id: 'msg-1',
        data: '',
      });
      responseHandler?.({
        conversation_id: 'conv-1',
        type: 'content',
        msg_id: 'msg-1',
        data: 'partial answer',
      });
      responseHandler?.({
        conversation_id: 'conv-1',
        type: 'finish',
        msg_id: 'msg-1',
        data: '',
        turnPhase: 'finalizing',
        completionSource: 'finish_signal',
      });
    });

    expect(result.current.running).toBe(true);
    expect(result.current.hasStreamingContent).toBe(false);

    act(() => {
      turnCompletedHandler?.({
        sessionId: 'conv-1',
        turnPhase: 'delivered',
      });
    });

    expect(result.current.running).toBe(false);
  });
});
