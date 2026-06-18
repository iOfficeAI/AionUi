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
import { emitter } from '@/renderer/utils/emitter';

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
  teamUpgradeHandoffReady = true,
  onExecute = vi.fn().mockResolvedValue(undefined),
}: {
  conversation_id: string;
  runtimeGate: ConversationCommandQueueRuntimeGate;
  isBusy?: boolean;
  teamUpgradeHandoffReady?: boolean;
  onExecute?: (item: Parameters<Parameters<typeof useConversationCommandQueue>[0]['onExecute']>[0]) => Promise<void>;
}) =>
  renderHook(
    ({ gate, busy, handoffReady }) =>
      useConversationCommandQueue({
        conversation_id,
        enabled: true,
        isBusy: busy,
        runtimeGate: gate,
        teamUpgradeHandoffReady: handoffReady,
        onExecute,
      }),
    {
      initialProps: { gate: runtimeGate, busy: isBusy, handoffReady: teamUpgradeHandoffReady },
      wrapper: createSwrWrapper(),
    }
  );

describe('useConversationCommandQueue team-upgrade handoff', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('waits through Team-upgrade handoff and executes automatically when runtime becomes idle', async () => {
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

    act(() => {
      emitter.emit('conversation.commandQueue.deferAfterTeamUpgrade', {
        conversation_id: 'conv-1',
        team_id: 'team-1',
      });
    });

    expect(result.current.isPaused).toBe(false);
    expect(onExecute).not.toHaveBeenCalled();

    rerender({ gate: idleGate });

    await waitFor(() => expect(onExecute).toHaveBeenCalledTimes(1));
    expect(onExecute).toHaveBeenCalledWith(expect.objectContaining({ input: 'queued follow-up' }));
  });

  it('waits for the original conversation turn to finish before draining the Team-upgrade handoff queue', async () => {
    const onExecute = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderQueue({
      conversation_id: 'conv-original-busy',
      runtimeGate: processingGate,
      isBusy: true,
      onExecute,
    });

    act(() => {
      result.current.enqueue({ input: 'queued follow-up', files: [] });
    });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    act(() => {
      emitter.emit('conversation.commandQueue.deferAfterTeamUpgrade', {
        conversation_id: 'conv-original-busy',
        team_id: 'team-1',
      });
    });

    rerender({ gate: idleGate, busy: true, handoffReady: true });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(onExecute).not.toHaveBeenCalled();
    expect(result.current.items).toHaveLength(1);

    rerender({ gate: idleGate, busy: false, handoffReady: true });

    await waitFor(() => expect(onExecute).toHaveBeenCalledTimes(1));
    expect(onExecute).toHaveBeenCalledWith(expect.objectContaining({ input: 'queued follow-up' }));
  });

  it('does not pause or block another conversation', async () => {
    const onExecute = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderQueue({
      conversation_id: 'conv-other-target',
      runtimeGate: processingGate,
      onExecute,
    });

    act(() => {
      result.current.enqueue({ input: 'queued follow-up', files: [] });
    });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    act(() => {
      emitter.emit('conversation.commandQueue.deferAfterTeamUpgrade', {
        conversation_id: 'conv-other',
        team_id: 'team-1',
      });
    });

    rerender({ gate: idleGate, busy: false, handoffReady: true });

    await waitFor(() => expect(onExecute).toHaveBeenCalledTimes(1));
    expect(result.current.isPaused).toBe(false);
  });

  it('does not persist paused state under the conversation command queue storage key', async () => {
    const { result } = renderQueue({
      conversation_id: 'conv-persist',
      runtimeGate: processingGate,
    });

    act(() => {
      result.current.enqueue({ input: 'queued follow-up', files: [] });
    });
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    act(() => {
      emitter.emit('conversation.commandQueue.deferAfterTeamUpgrade', {
        conversation_id: 'conv-persist',
        team_id: 'team-1',
      });
    });

    await waitFor(() => {
      const stored = JSON.parse(sessionStorage.getItem(storageKey('conv-persist')) ?? '{}') as { isPaused?: boolean };
      expect(stored.isPaused).toBe(false);
    });
  });

  it('keeps Team-upgrade handoff across hook remount until the handoff target is ready', async () => {
    const onExecute = vi.fn().mockResolvedValue(undefined);
    const firstRender = renderQueue({
      conversation_id: 'conv-remount',
      runtimeGate: processingGate,
      teamUpgradeHandoffReady: false,
      onExecute,
    });

    act(() => {
      firstRender.result.current.enqueue({ input: 'queued follow-up', files: [] });
    });
    await waitFor(() => expect(firstRender.result.current.items).toHaveLength(1));

    act(() => {
      emitter.emit('conversation.commandQueue.deferAfterTeamUpgrade', {
        conversation_id: 'conv-remount',
        team_id: 'team-1',
      });
    });
    firstRender.unmount();

    const secondRender = renderQueue({
      conversation_id: 'conv-remount',
      runtimeGate: idleGate,
      teamUpgradeHandoffReady: false,
      onExecute,
    });
    await waitFor(() => expect(secondRender.result.current.items).toHaveLength(1));
    expect(secondRender.result.current.isPaused).toBe(false);
    expect(onExecute).not.toHaveBeenCalled();

    secondRender.rerender({ gate: idleGate, busy: false, handoffReady: true });

    await waitFor(() => expect(onExecute).toHaveBeenCalledTimes(1));
    expect(onExecute).toHaveBeenCalledWith(expect.objectContaining({ input: 'queued follow-up' }));
  });

  it('does not include queued input content in command queue logs', async () => {
    const { result } = renderQueue({
      conversation_id: 'conv-log',
      runtimeGate: processingGate,
    });

    act(() => {
      result.current.enqueue({ input: 'sensitive queued instruction body', files: [] });
    });

    await waitFor(() => expect(result.current.items).toHaveLength(1));

    const serializedLogCalls = JSON.stringify(vi.mocked(console.info).mock.calls);
    expect(serializedLogCalls).not.toContain('sensitive queued instruction body');
  });
});
