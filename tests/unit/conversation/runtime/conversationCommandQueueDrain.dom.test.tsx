/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { Message } from '@arco-design/web-react';
import { BackendHttpError } from '@/common/adapter/httpBridge';
import type { TConversationRuntimeSummary } from '@/common/config/storage';
import { createElement, type PropsWithChildren } from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type ConversationCommandQueueRuntimeGate,
  resetConversationCommandQueueBackgroundRunnerForTest,
  useConversationCommandQueue,
} from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';
import { resetConversationRuntimeViewStoreForTest } from '@/renderer/pages/conversation/runtime/conversationRuntimeViewStore';

const turnCompletedListeners = vi.hoisted(() => ({
  current: [] as Array<
    (event: { session_id: string; turn_id: string; state: string; runtime: TConversationRuntimeSummary }) => void
  >,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      turnCompleted: {
        on: vi.fn((listener) => {
          turnCompletedListeners.current.push(listener);
          return () => {
            turnCompletedListeners.current = turnCompletedListeners.current.filter((item) => item !== listener);
          };
        }),
      },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Message: {
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

const createSwrWrapper = () => {
  const cache = new Map();

  return function SwrTestWrapper({ children }: PropsWithChildren) {
    return createElement(
      SWRConfig,
      {
        value: {
          provider: () => cache,
          dedupingInterval: 0,
          revalidateOnFocus: false,
          revalidateOnReconnect: false,
        },
      },
      children
    );
  };
};

const processingGate: ConversationCommandQueueRuntimeGate = {
  hydrated: true,
  canSendMessage: true,
  isProcessing: true,
};

const idleGate: ConversationCommandQueueRuntimeGate = {
  hydrated: true,
  canSendMessage: true,
  isProcessing: false,
};

const runtime = (overrides: Partial<TConversationRuntimeSummary> = {}): TConversationRuntimeSummary => ({
  state: 'idle',
  can_send_message: true,
  has_task: false,
  task_status: 'finished',
  is_processing: false,
  pending_confirmations: 0,
  turn_id: null,
  ...overrides,
});

const busyError = () =>
  new BackendHttpError({
    method: 'POST',
    path: '/api/conversations/conv/messages',
    status: 409,
    body: {
      success: false,
      code: 'CONFLICT',
      error: 'conversation conv is already running',
    },
  });

const runtimeUnavailableError = () =>
  new BackendHttpError({
    method: 'POST',
    path: '/api/conversations/conv/messages',
    status: 409,
    body: {
      success: false,
      code: 'CONFLICT',
      error: 'conversation runtime is shutting down',
    },
  });

const storageKey = (conversationId: string) => `conversation-command-queue/${conversationId}`;

const emitTurnCompleted = (conversationId: string): void => {
  act(() => {
    turnCompletedListeners.current.forEach((listener) => {
      listener({
        session_id: conversationId,
        turn_id: 'turn-1',
        state: 'ai_waiting_input',
        runtime: runtime(),
      });
    });
  });
};

const renderQueue = ({
  conversation_id,
  runtimeGate,
  isBusy = false,
  onExecute = vi.fn().mockResolvedValue(undefined),
}: {
  conversation_id: string;
  runtimeGate: ConversationCommandQueueRuntimeGate;
  isBusy?: boolean;
  onExecute?: (item: Parameters<Parameters<typeof useConversationCommandQueue>[0]['onExecute']>[0]) => Promise<void>;
}) =>
  renderHook(
    ({ gate, busy }) =>
      useConversationCommandQueue({
        conversation_id,
        enabled: true,
        isBusy: busy,
        runtimeGate: gate,
        onExecute,
      }),
    {
      initialProps: { gate: runtimeGate, busy: isBusy },
      wrapper: createSwrWrapper(),
    }
  );

describe('useConversationCommandQueue drain', () => {
  beforeEach(() => {
    sessionStorage.clear();
    turnCompletedListeners.current = [];
    resetConversationRuntimeViewStoreForTest();
    resetConversationCommandQueueBackgroundRunnerForTest();
    vi.clearAllMocks();
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    resetConversationRuntimeViewStoreForTest();
    resetConversationCommandQueueBackgroundRunnerForTest();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('drains a queued command when the runtime becomes idle', async () => {
    const onExecute = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderQueue({
      conversation_id: 'conv-1',
      runtimeGate: processingGate,
      onExecute,
    });

    act(() => {
      result.current.enqueue({ input: 'queued follow-up', files: [] });
    });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    rerender({ gate: idleGate, busy: false });

    await waitFor(() => expect(onExecute).toHaveBeenCalledTimes(1));
    expect(onExecute).toHaveBeenCalledWith(expect.objectContaining({ input: 'queued follow-up' }));
  });

  it('ignores legacy persisted team-upgrade handoff state and drains normally', async () => {
    const onExecute = vi.fn().mockResolvedValue(undefined);
    const legacyHandoffKey = ['deferred', 'AfterTeamUpgrade'].join('');
    sessionStorage.setItem(
      storageKey('conv-legacy'),
      JSON.stringify({
        items: [
          {
            id: 'queued-1',
            input: 'legacy persisted follow-up',
            files: [],
            created_at: 1,
          },
        ],
        isPaused: false,
        [legacyHandoffKey]: true,
      })
    );

    renderQueue({
      conversation_id: 'conv-legacy',
      runtimeGate: idleGate,
      onExecute,
    });

    await waitFor(() => expect(onExecute).toHaveBeenCalledTimes(1));
    expect(onExecute).toHaveBeenCalledWith(expect.objectContaining({ input: 'legacy persisted follow-up' }));
    await waitFor(() => expect(sessionStorage.getItem(storageKey('conv-legacy'))).toBeNull());
  });

  it('continues draining queued commands after the active conversation hook unmounts', async () => {
    const onExecute = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderQueue({
      conversation_id: 'conv-background',
      runtimeGate: processingGate,
      onExecute,
    });

    act(() => {
      result.current.enqueue({ input: 'queued after switch', files: [] });
    });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    unmount();

    expect(onExecute).not.toHaveBeenCalled();

    emitTurnCompleted('conv-background');

    await waitFor(() => expect(onExecute).toHaveBeenCalledTimes(1));
    expect(onExecute).toHaveBeenCalledWith(expect.objectContaining({ input: 'queued after switch' }));
  });

  it('keeps manual-mode commands queued after the active conversation hook unmounts', async () => {
    const onExecute = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderQueue({
      conversation_id: 'conv-background-manual',
      runtimeGate: processingGate,
      onExecute,
    });

    act(() => {
      result.current.toggleMode();
      result.current.enqueue({ input: 'send only when requested', files: [] });
    });
    await waitFor(() => expect(result.current.mode).toBe('manual'));
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    unmount();
    emitTurnCompleted('conv-background-manual');

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onExecute).not.toHaveBeenCalled();
    expect(JSON.parse(sessionStorage.getItem(storageKey('conv-background-manual')) ?? '{}')).toMatchObject({
      mode: 'manual',
      items: [expect.objectContaining({ input: 'send only when requested' })],
    });
  });

  it('shares the background listener across active queues and releases it after the last runner unmounts', () => {
    const firstExecute = vi.fn().mockResolvedValue(undefined);
    const secondExecute = vi.fn().mockResolvedValue(undefined);
    const firstQueue = renderQueue({
      conversation_id: 'conv-active-one',
      runtimeGate: idleGate,
      onExecute: firstExecute,
    });
    const secondQueue = renderQueue({
      conversation_id: 'conv-active-two',
      runtimeGate: idleGate,
      onExecute: secondExecute,
    });

    expect(turnCompletedListeners.current).toHaveLength(1);

    emitTurnCompleted('conv-active-two');

    expect(firstExecute).not.toHaveBeenCalled();
    expect(secondExecute).not.toHaveBeenCalled();

    firstQueue.unmount();
    expect(turnCompletedListeners.current).toHaveLength(1);

    secondQueue.unmount();
    expect(turnCompletedListeners.current).toHaveLength(0);
  });

  it('continues draining remaining background commands after each successful send', async () => {
    const onExecute = vi.fn().mockResolvedValue(undefined);
    const { result, unmount } = renderQueue({
      conversation_id: 'conv-background-many',
      runtimeGate: processingGate,
      onExecute,
    });

    act(() => {
      result.current.enqueue({ input: 'first queued command', files: [] });
      result.current.enqueue({ input: 'second queued command', files: [] });
    });
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    unmount();
    emitTurnCompleted('conv-background-many');

    await waitFor(() => expect(onExecute).toHaveBeenCalledTimes(2));
    expect(onExecute).toHaveBeenNthCalledWith(1, expect.objectContaining({ input: 'first queued command' }));
    expect(onExecute).toHaveBeenNthCalledWith(2, expect.objectContaining({ input: 'second queued command' }));
    await waitFor(() => expect(sessionStorage.getItem(storageKey('conv-background-many'))).toBeNull());
  });

  it('pauses and restores the background command when execution fails', async () => {
    const onExecute = vi.fn().mockRejectedValue(new Error('send failed'));
    const { result, unmount } = renderQueue({
      conversation_id: 'conv-background-failure',
      runtimeGate: processingGate,
      onExecute,
    });

    act(() => {
      result.current.enqueue({ input: 'retry me later', files: [] });
    });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    unmount();
    emitTurnCompleted('conv-background-failure');

    await waitFor(() => expect(Message.warning).toHaveBeenCalledTimes(1));
    const persistedState = JSON.parse(sessionStorage.getItem(storageKey('conv-background-failure')) ?? '{}');
    expect(persistedState).toMatchObject({
      isPaused: true,
      items: [expect.objectContaining({ input: 'retry me later' })],
    });
  });

  it('restores a foreground busy command and waits for gate release without warning', async () => {
    const onExecute = vi.fn().mockRejectedValueOnce(busyError()).mockResolvedValueOnce(undefined);
    const { result, rerender } = renderQueue({
      conversation_id: 'conv-busy-foreground',
      runtimeGate: idleGate,
      onExecute,
    });

    act(() => {
      result.current.enqueue({ input: 'queued while busy', files: [] });
    });

    await waitFor(() => expect(onExecute).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(Message.warning).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onExecute).toHaveBeenCalledTimes(1);

    rerender({ gate: processingGate, busy: true });
    rerender({ gate: idleGate, busy: false });

    await waitFor(() => expect(onExecute).toHaveBeenCalledTimes(2));
  });

  it('retries after release when the blocked gate was observed before the busy catch', async () => {
    let rerenderQueue: ReturnType<typeof renderQueue>['rerender'] = () => undefined;
    let attempts = 0;
    const onExecute = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) {
        rerenderQueue({ gate: processingGate, busy: true });
        await new Promise((resolve) => setTimeout(resolve, 0));
        throw busyError();
      }
    });
    const { result, rerender } = renderQueue({
      conversation_id: 'conv-busy-preobserved-gate',
      runtimeGate: idleGate,
      onExecute,
    });
    rerenderQueue = rerender;

    act(() => {
      result.current.enqueue({ input: 'retry after already observed blocked gate', files: [] });
    });

    await waitFor(() => expect(onExecute).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(Message.warning).not.toHaveBeenCalled();

    rerender({ gate: idleGate, busy: false });

    await waitFor(() => expect(onExecute).toHaveBeenCalledTimes(2));
  });

  it('does not detach into a background drain when onExecute identity changes while mounted', async () => {
    const firstExecute = vi.fn().mockResolvedValue(undefined);
    const secondExecute = vi.fn().mockResolvedValue(undefined);
    const wrapper = createSwrWrapper();
    const { result, rerender } = renderHook(
      ({ gate, execute }) =>
        useConversationCommandQueue({
          conversation_id: 'conv-stable-runner',
          enabled: true,
          isBusy: gate.isProcessing || !gate.canSendMessage,
          runtimeGate: gate,
          onExecute: execute,
        }),
      { initialProps: { gate: processingGate, execute: firstExecute }, wrapper }
    );

    act(() => {
      result.current.enqueue({ input: 'send once', files: [] });
    });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    rerender({ gate: processingGate, execute: secondExecute });
    emitTurnCompleted('conv-stable-runner');
    expect(firstExecute).not.toHaveBeenCalled();
    expect(secondExecute).not.toHaveBeenCalled();

    rerender({ gate: idleGate, execute: secondExecute });
    await waitFor(() => expect(secondExecute).toHaveBeenCalledTimes(1));
    expect(firstExecute).not.toHaveBeenCalled();
  });

  it('restores a runtime-unavailable busy command without warning or rapid retry', async () => {
    const onExecute = vi.fn().mockRejectedValueOnce(runtimeUnavailableError()).mockResolvedValueOnce(undefined);
    const { result, rerender } = renderQueue({
      conversation_id: 'conv-runtime-unavailable',
      runtimeGate: idleGate,
      onExecute,
    });

    act(() => {
      result.current.enqueue({ input: 'queued while runtime closes', files: [] });
    });

    await waitFor(() => expect(onExecute).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(Message.warning).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onExecute).toHaveBeenCalledTimes(1);

    rerender({ gate: processingGate, busy: true });
    rerender({ gate: idleGate, busy: false });

    await waitFor(() => expect(onExecute).toHaveBeenCalledTimes(2));
  });

  it('restores a background busy command and waits for turn completion before retrying', async () => {
    const onExecute = vi.fn().mockRejectedValueOnce(busyError()).mockResolvedValueOnce(undefined);
    const { result, unmount } = renderQueue({
      conversation_id: 'conv-background-busy',
      runtimeGate: processingGate,
      onExecute,
    });

    act(() => {
      result.current.enqueue({ input: 'retry after turn completion', files: [] });
    });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    unmount();
    emitTurnCompleted('conv-background-busy');

    await waitFor(() => expect(onExecute).toHaveBeenCalledTimes(1));
    expect(Message.warning).not.toHaveBeenCalled();
    expect(JSON.parse(sessionStorage.getItem(storageKey('conv-background-busy')) ?? '{}')).toMatchObject({
      isPaused: false,
      items: [expect.objectContaining({ input: 'retry after turn completion' })],
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onExecute).toHaveBeenCalledTimes(1);

    emitTurnCompleted('conv-background-busy');

    await waitFor(() => expect(onExecute).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(sessionStorage.getItem(storageKey('conv-background-busy'))).toBeNull());
  });
});
