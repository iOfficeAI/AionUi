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
    acpConversation: {
      responseStream: {
        on: (handler: (message: Record<string, unknown>) => void) => {
          responseHandler = handler;
          return mockResponseUnsubscribe;
        },
      },
    },
    conversation: {
      turnCompleted: {
        on: (handler: (event: Record<string, unknown>) => void) => {
          turnCompletedHandler = handler;
          return mockTurnCompletedUnsubscribe;
        },
      },
      get: {
        invoke: (...args: unknown[]) => mockConversationGetInvoke(...args),
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

import { useAcpMessage } from '@/renderer/pages/conversation/platforms/acp/useAcpMessage';

describe('useAcpMessage', () => {
  beforeEach(() => {
    responseHandler = null;
    turnCompletedHandler = null;
    mockConversationGetInvoke.mockReset();
    mockConversationGetInvoke.mockResolvedValue({
      status: 'finished',
      type: 'acp',
      extra: {},
    });
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

  it('keeps ACP busy through finalizing finish messages until turnCompleted arrives', async () => {
    const { result } = renderHook(() => useAcpMessage('conv-1'));

    await act(async () => {
      await Promise.resolve();
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

    act(() => {
      responseHandler?.({
        conversation_id: 'conv-1',
        type: 'content',
        msg_id: 'content-1',
        data: 'partial answer',
      });
    });
    expect(mockAddOrUpdateMessage).toHaveBeenCalledTimes(1);

    act(() => {
      responseHandler?.({
        conversation_id: 'conv-1',
        type: 'finish',
        msg_id: 'finish-1',
        data: null,
        turnPhase: 'finalizing',
        completionSource: 'end_turn',
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

  it('keeps ACP busy when session_active arrives during an active streamed turn', async () => {
    const { result } = renderHook(() => useAcpMessage('conv-1'));

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      responseHandler?.({
        conversation_id: 'conv-1',
        type: 'start',
        msg_id: 'start-1',
        data: null,
      });
    });
    expect(result.current.running).toBe(true);

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

    act(() => {
      responseHandler?.({
        conversation_id: 'conv-1',
        type: 'agent_status',
        msg_id: 'status-1',
        data: { status: 'session_active', backend: 'codex' },
      });
    });

    expect(result.current.running).toBe(true);
    expect(result.current.hasStreamingContent).toBe(true);
  });

  it('reports active ACP tool activity while a tool call is running', async () => {
    const { result } = renderHook(() => useAcpMessage('conv-1'));

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      responseHandler?.({
        conversation_id: 'conv-1',
        type: 'acp_tool_call',
        msg_id: 'tool-1',
        data: {
          update: {
            title: 'Run npm test',
            status: 'in_progress',
          },
        },
      });
    });

    expect(result.current.running).toBe(true);
    expect(result.current.activity).toEqual({
      phase: 'tool',
      title: 'Run npm test',
      status: 'in_progress',
    });
  });

  it('does not turn an idle session_active status into a running turn', async () => {
    const { result } = renderHook(() => useAcpMessage('conv-1'));

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      responseHandler?.({
        conversation_id: 'conv-1',
        type: 'agent_status',
        msg_id: 'status-1',
        data: { status: 'session_active', backend: 'codex' },
      });
    });

    expect(result.current.running).toBe(false);
    expect(result.current.aiProcessing).toBe(false);
  });
});
