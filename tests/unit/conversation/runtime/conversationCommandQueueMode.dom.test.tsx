/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type PropsWithChildren } from 'react';
import { SWRConfig } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type ConversationCommandQueueRuntimeGate,
  useConversationCommandQueue,
} from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';

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

const storageKey = (conversationId: string) => `conversation-command-queue/${conversationId}`;

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

describe('useConversationCommandQueue mode & send-now', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('defaults to auto mode', () => {
    const { result } = renderQueue({ conversation_id: 'conv-auto', runtimeGate: processingGate });
    expect(result.current.mode).toBe('auto');
  });

  it('toggles between auto and manual', async () => {
    const { result } = renderQueue({ conversation_id: 'conv-toggle', runtimeGate: processingGate });

    act(() => {
      result.current.toggleMode();
    });
    await waitFor(() => expect(result.current.mode).toBe('manual'));

    act(() => {
      result.current.toggleMode();
    });
    await waitFor(() => expect(result.current.mode).toBe('auto'));
  });

  it('does NOT auto-send queued commands while in manual mode', async () => {
    const onExecute = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderQueue({
      conversation_id: 'conv-manual',
      runtimeGate: processingGate,
      onExecute,
    });

    act(() => {
      result.current.toggleMode();
    });
    await waitFor(() => expect(result.current.mode).toBe('manual'));

    act(() => {
      result.current.enqueue({ input: 'stay queued', files: [] });
    });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    // Even when the runtime goes idle, manual mode must not drain automatically.
    rerender({ gate: idleGate, busy: false });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onExecute).not.toHaveBeenCalled();
    expect(result.current.items).toHaveLength(1);
  });

  it('auto-sends again after switching manual back to auto', async () => {
    const onExecute = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderQueue({
      conversation_id: 'conv-manual-auto',
      runtimeGate: processingGate,
      onExecute,
    });

    act(() => {
      result.current.toggleMode();
    });
    await waitFor(() => expect(result.current.mode).toBe('manual'));

    act(() => {
      result.current.enqueue({ input: 'queued follow-up', files: [] });
    });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    rerender({ gate: idleGate, busy: false });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(onExecute).not.toHaveBeenCalled();

    act(() => {
      result.current.toggleMode();
    });
    await waitFor(() => expect(onExecute).toHaveBeenCalledTimes(1));
  });

  it('sendNow executes the targeted command and leaves the rest queued', async () => {
    const onExecute = vi.fn().mockResolvedValue(undefined);
    const { result } = renderQueue({
      conversation_id: 'conv-sendnow',
      runtimeGate: processingGate,
      onExecute,
    });

    // Manual mode so nothing drains on its own — isolates sendNow behavior.
    act(() => {
      result.current.toggleMode();
    });
    await waitFor(() => expect(result.current.mode).toBe('manual'));

    act(() => {
      result.current.enqueue({ input: 'first', files: [] });
    });
    act(() => {
      result.current.enqueue({ input: 'second', files: [] });
    });
    await waitFor(() => expect(result.current.items).toHaveLength(2));

    const second = result.current.items[1];
    act(() => {
      result.current.sendNow(second.id);
    });

    await waitFor(() => expect(onExecute).toHaveBeenCalledTimes(1));
    expect(onExecute).toHaveBeenCalledWith(expect.objectContaining({ input: 'second' }));
    // The other command stays queued and manual mode is preserved.
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.items[0].input).toBe('first');
    expect(result.current.mode).toBe('manual');
  });

  it('restores manual mode from persisted storage', async () => {
    sessionStorage.setItem(
      storageKey('conv-persist'),
      JSON.stringify({
        items: [{ id: 'q1', input: 'kept', files: [], created_at: 1 }],
        isPaused: false,
        mode: 'manual',
      })
    );

    const onExecute = vi.fn().mockResolvedValue(undefined);
    const { result } = renderQueue({
      conversation_id: 'conv-persist',
      runtimeGate: idleGate,
      onExecute,
    });

    await waitFor(() => expect(result.current.mode).toBe('manual'));
    // Manual mode restored → must not auto-drain even though runtime is idle.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onExecute).not.toHaveBeenCalled();
    expect(result.current.items).toHaveLength(1);
  });
});
