import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let responseHandler: ((message: Record<string, unknown>) => void) | null = null;
let turnCompletedHandler: ((event: Record<string, unknown>) => void) | null = null;

const mockConversationGetInvoke = vi.fn();
const mockAddOrUpdateMessage = vi.fn();
const mockEmitterEmit = vi.fn();
const mockResponseUnsubscribe = vi.fn();
const mockTurnCompletedUnsubscribe = vi.fn();

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

import { useCodexMessage } from '@/renderer/pages/conversation/platforms/codex/useCodexMessage';

describe('useCodexMessage', () => {
  beforeEach(() => {
    responseHandler = null;
    turnCompletedHandler = null;
    mockConversationGetInvoke.mockReset();
    mockConversationGetInvoke.mockResolvedValue({
      status: 'finished',
      type: 'codex',
      extra: {
        lastTokenUsage: { totalTokens: 128 },
        lastContextLimit: 4096,
      },
    });
    mockAddOrUpdateMessage.mockReset();
    mockEmitterEmit.mockReset();
    mockResponseUnsubscribe.mockReset();
    mockTurnCompletedUnsubscribe.mockReset();
  });

  it('tracks native Codex running state and streams transformed content for the active conversation only', async () => {
    const { result, unmount } = renderHook(() => useCodexMessage('conv-1'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.running).toBe(false);
    expect(result.current.tokenUsage).toEqual({ totalTokens: 128 });
    expect(result.current.contextLimit).toBe(4096);

    act(() => {
      responseHandler?.({
        conversation_id: 'other-conv',
        type: 'start',
        msg_id: 'ignored',
        data: null,
      });
    });

    expect(result.current.running).toBe(false);

    act(() => {
      responseHandler?.({
        conversation_id: 'conv-1',
        type: 'start',
        msg_id: 'start-1',
        data: null,
      });
    });

    expect(result.current.running).toBe(true);
    expect(result.current.activity).toEqual({ phase: 'waiting' });

    act(() => {
      responseHandler?.({
        conversation_id: 'conv-1',
        type: 'content',
        msg_id: 'content-1',
        data: 'partial answer',
      });
    });

    expect(result.current.running).toBe(true);
    expect(result.current.hasStreamingContent).toBe(true);
    expect(result.current.activity).toEqual({ phase: 'streaming' });
    expect(mockAddOrUpdateMessage).toHaveBeenCalledTimes(1);
    expect(mockEmitterEmit).toHaveBeenCalledWith('conversation.streaming', {
      conversationId: 'conv-1',
      isStreaming: true,
    });

    act(() => {
      responseHandler?.({
        conversation_id: 'conv-1',
        type: 'finish',
        msg_id: 'finish-1',
        data: null,
      });
    });

    expect(result.current.running).toBe(false);
    expect(result.current.hasStreamingContent).toBe(false);

    unmount();
    expect(mockResponseUnsubscribe).toHaveBeenCalled();
    expect(mockEmitterEmit).toHaveBeenCalledWith('conversation.streaming', {
      conversationId: 'conv-1',
      isStreaming: false,
    });
  });

  it('updates context usage from acp_context_usage and clears running on turnCompleted', async () => {
    const { result } = renderHook(() => useCodexMessage('conv-1'));

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      responseHandler?.({
        conversation_id: 'conv-1',
        type: 'codex_tool_call',
        msg_id: 'tool-1',
        data: {
          update: {
            title: 'Read file',
            status: 'in_progress',
          },
        },
      });
      responseHandler?.({
        conversation_id: 'conv-1',
        type: 'acp_context_usage',
        msg_id: 'usage-1',
        data: {
          used: 512,
          size: 8192,
        },
      });
    });

    expect(result.current.running).toBe(true);
    expect(result.current.activity).toEqual({
      phase: 'tool',
      title: 'Read file',
      status: 'in_progress',
    });
    expect(result.current.tokenUsage).toEqual({ totalTokens: 512 });
    expect(result.current.contextLimit).toBe(8192);

    act(() => {
      turnCompletedHandler?.({
        sessionId: 'conv-1',
        turnPhase: 'delivered',
      });
    });

    expect(result.current.running).toBe(false);
    expect(result.current.activity).toBe(null);
  });
});
