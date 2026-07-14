/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { Message } from '@arco-design/web-react';
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
});
