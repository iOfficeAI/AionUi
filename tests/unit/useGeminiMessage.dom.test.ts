import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let capturedResponseListener: ((message: Record<string, unknown>) => void) | null = null;
const mockGetInvoke = vi.fn().mockResolvedValue(null);
const mockAddOrUpdateMessage = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    geminiConversation: {
      responseStream: {
        on: vi.fn((listener: (message: Record<string, unknown>) => void) => {
          capturedResponseListener = listener;
          return () => {
            capturedResponseListener = null;
          };
        }),
      },
    },
    conversation: {
      get: { invoke: (...args: unknown[]) => mockGetInvoke(...args) },
      update: { invoke: vi.fn().mockResolvedValue(null) },
    },
  },
}));

vi.mock('@/common/chat/chatLib', () => ({
  transformMessage: vi.fn((message: unknown) => message),
}));

vi.mock('@/renderer/pages/conversation/Messages/hooks', () => ({
  useAddOrUpdateMessage: vi.fn(() => mockAddOrUpdateMessage),
}));

import { useGeminiMessage } from '@/renderer/pages/conversation/platforms/gemini/useGeminiMessage';

const CONVERSATION_ID = 'test-conversation';

const flushEffects = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

const emitResponse = (message: Record<string, unknown>) => {
  act(() => {
    capturedResponseListener?.(message);
    vi.runAllTimers();
  });
};

describe('useGeminiMessage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    capturedResponseListener = null;
    mockGetInvoke.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resetState() clears the running flag immediately', async () => {
    const { result } = renderHook(() => useGeminiMessage(CONVERSATION_ID));

    await flushEffects();

    act(() => {
      result.current.setWaitingResponse(true);
    });

    expect(result.current.running).toBe(true);

    act(() => {
      result.current.resetState();
    });

    expect(result.current.running).toBe(false);
  });

  it('resetState() clears activeMsgIdRef so a new request can receive thought events', async () => {
    const { result } = renderHook(() => useGeminiMessage(CONVERSATION_ID));

    await flushEffects();

    act(() => {
      result.current.setActiveMsgId('msg-A');
    });

    emitResponse({
      type: 'thought',
      conversation_id: CONVERSATION_ID,
      msg_id: 'msg-B',
      data: { subject: 'filtered', description: 'should not appear' },
    });

    expect(result.current.thought.subject).toBe('');

    act(() => {
      result.current.resetState();
    });

    emitResponse({
      type: 'thought',
      conversation_id: CONVERSATION_ID,
      msg_id: 'msg-B',
      data: { subject: 'visible', description: 'should appear' },
    });

    expect(result.current.thought.subject).toBe('visible');
  });

  it('filters stale thought events after a new request begins', async () => {
    const { result } = renderHook(() => useGeminiMessage(CONVERSATION_ID));

    await flushEffects();

    act(() => {
      result.current.setActiveMsgId('msg-old');
    });

    act(() => {
      result.current.resetState();
    });

    act(() => {
      result.current.setActiveMsgId('msg-new');
    });

    emitResponse({
      type: 'thought',
      conversation_id: CONVERSATION_ID,
      msg_id: 'msg-new',
      data: { subject: 'new-thought', description: 'new request' },
    });

    expect(result.current.thought.subject).toBe('new-thought');

    act(() => {
      result.current.setThought({ subject: '', description: '' });
    });

    emitResponse({
      type: 'thought',
      conversation_id: CONVERSATION_ID,
      msg_id: 'msg-stale',
      data: { subject: 'stale-thought', description: 'should be filtered' },
    });

    expect(result.current.thought.subject).toBe('');
  });

  it('marks assistant content as streaming only after content arrives and clears it on finish', async () => {
    const { result } = renderHook(() => useGeminiMessage(CONVERSATION_ID));

    await flushEffects();

    emitResponse({
      type: 'start',
      conversation_id: CONVERSATION_ID,
      msg_id: 'msg-stream',
      data: {},
    });

    expect(result.current.hasStreamingContent).toBe(false);

    emitResponse({
      type: 'content',
      conversation_id: CONVERSATION_ID,
      msg_id: 'msg-stream',
      data: { content: 'partial answer' },
    });

    expect(result.current.hasStreamingContent).toBe(true);

    emitResponse({
      type: 'finish',
      conversation_id: CONVERSATION_ID,
      msg_id: 'msg-stream',
      data: {},
    });

    expect(result.current.hasStreamingContent).toBe(false);
  });
});
