/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const chunkHandlers = new Set<(p: unknown) => void>();
  const endHandlers = new Set<(p: unknown) => void>();
  const errorHandlers = new Set<(p: unknown) => void>();
  return {
    chunkHandlers,
    endHandlers,
    errorHandlers,
    sendInvoke: vi.fn(),
    abortInvoke: vi.fn(),
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    kbChat: {
      send: { invoke: (params: unknown) => mocks.sendInvoke(params) },
      abort: { invoke: (params: unknown) => mocks.abortInvoke(params) },
      streamChunk: {
        on: (cb: (p: unknown) => void) => {
          mocks.chunkHandlers.add(cb);
          return () => mocks.chunkHandlers.delete(cb);
        },
      },
      streamEnd: {
        on: (cb: (p: unknown) => void) => {
          mocks.endHandlers.add(cb);
          return () => mocks.endHandlers.delete(cb);
        },
      },
      streamError: {
        on: (cb: (p: unknown) => void) => {
          mocks.errorHandlers.add(cb);
          return () => mocks.errorHandlers.delete(cb);
        },
      },
    },
  },
}));

const emit = (set: Set<(p: unknown) => void>, payload: unknown): void => {
  for (const cb of set) cb(payload);
};

const importHook = async () => {
  const mod = await import('@/renderer/hooks/kb-chat/useKbChat');
  return mod.useKbChat;
};

describe('useKbChat', () => {
  beforeEach(() => {
    mocks.chunkHandlers.clear();
    mocks.endHandlers.clear();
    mocks.errorHandlers.clear();
    mocks.sendInvoke.mockReset();
    mocks.abortInvoke.mockReset();
    mocks.sendInvoke.mockResolvedValue({ requestId: 'r', ok: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sends via ipcBridge on send() and renders streamed chunks', async () => {
    const useKbChat = await importHook();
    const { result } = renderHook(() => useKbChat({ kbId: 'k1', token: 'tok' }));

    await act(async () => {
      await result.current.send('what?');
    });

    expect(mocks.sendInvoke).toHaveBeenCalledWith({
      requestId: expect.any(String),
      kbId: 'k1',
      question: 'what?',
      token: 'tok',
    });

    expect(result.current.messages[0]).toEqual({ role: 'user', content: 'what?' });

    const requestId = (mocks.sendInvoke.mock.calls[0][0] as { requestId: string }).requestId;

    act(() => emit(mocks.chunkHandlers, { requestId, content: 'hello ' }));
    act(() => emit(mocks.chunkHandlers, { requestId, content: 'world' }));

    await waitFor(() => {
      expect(result.current.messages.at(-1)?.content).toBe('hello world');
    });

    expect(result.current.status).toBe('streaming');

    act(() => emit(mocks.endHandlers, { requestId, reason: 'done' }));

    await waitFor(() => {
      expect(result.current.status).toBe('done');
    });
  });

  it('aborts the in-flight request via ipcBridge.kbChat.abort', async () => {
    const useKbChat = await importHook();
    const { result } = renderHook(() => useKbChat({ kbId: 'k1', token: 'tok' }));

    await act(async () => {
      await result.current.send('q');
    });

    const requestId = (mocks.sendInvoke.mock.calls[0][0] as { requestId: string }).requestId;

    act(() => result.current.abort());

    expect(mocks.abortInvoke).toHaveBeenCalledWith({ requestId });

    act(() => emit(mocks.endHandlers, { requestId, reason: 'aborted' }));

    await waitFor(() => {
      expect(result.current.status).toBe('aborted');
    });
  });

  it('marks error and surfaces lastError on streamError', async () => {
    const useKbChat = await importHook();
    const { result } = renderHook(() => useKbChat({ kbId: 'k1', token: 'tok' }));

    await act(async () => {
      await result.current.send('q');
    });

    const requestId = (mocks.sendInvoke.mock.calls[0][0] as { requestId: string }).requestId;

    act(() => emit(mocks.errorHandlers, { requestId, code: 'network', message: 'lost' }));
    act(() => emit(mocks.endHandlers, { requestId, reason: 'error' }));

    await waitFor(() => {
      expect(result.current.status).toBe('error');
      expect(result.current.lastError).toEqual({ code: 'network', message: 'lost' });
    });
  });

  it('ignores events from a stale requestId', async () => {
    const useKbChat = await importHook();
    const { result } = renderHook(() => useKbChat({ kbId: 'k1', token: 'tok' }));

    await act(async () => {
      await result.current.send('first');
    });

    const staleRequestId = (mocks.sendInvoke.mock.calls[0][0] as { requestId: string }).requestId;

    await act(async () => {
      await result.current.send('second');
    });

    const currentRequestId = (mocks.sendInvoke.mock.calls[1][0] as { requestId: string }).requestId;
    expect(currentRequestId).not.toBe(staleRequestId);

    act(() => emit(mocks.chunkHandlers, { requestId: staleRequestId, content: 'STALE' }));
    act(() => emit(mocks.chunkHandlers, { requestId: currentRequestId, content: 'FRESH' }));

    await waitFor(() => {
      const assistant = result.current.messages.find((m) => m.role === 'assistant');
      expect(assistant?.content).toBe('FRESH');
      expect(assistant?.content).not.toContain('STALE');
    });
  });

  it('rejects send() with empty question', async () => {
    const useKbChat = await importHook();
    const { result } = renderHook(() => useKbChat({ kbId: 'k1', token: 'tok' }));

    await act(async () => {
      await result.current.send('   ');
    });

    expect(mocks.sendInvoke).not.toHaveBeenCalled();
    expect(result.current.messages).toHaveLength(0);
  });
});
