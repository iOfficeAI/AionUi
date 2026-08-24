/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Reopening a conversation MID-TURN must restore the running turn's plan. The
 * paginated message load alone cannot: `upsert_message` does not refresh
 * `created_at`, so a plan row stays anchored at the START of its turn and a turn
 * with many tool calls buries it outside the default page.
 */

import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TMessage } from '@/common/chat/chatLib';

const invoke = vi.fn();
const updateMessageList = vi.fn();
const runtimeView = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    database: {
      getLatestConversationMessageOfType: { invoke: (...args: unknown[]) => invoke(...args) },
    },
  },
}));

vi.mock('@renderer/pages/conversation/Messages/hooks', () => ({
  __esModule: true,
  useUpdateMessageList: () => updateMessageList,
  normalizeDbMessage: (m: TMessage) => m,
}));

vi.mock('@renderer/pages/conversation/runtime/useConversationRuntimeView', () => ({
  __esModule: true,
  useConversationRuntimeView: () => runtimeView(),
}));

import { usePlanRecovery } from '@renderer/pages/conversation/PlanBar/usePlanRecovery';

const PLAN_ROW = {
  id: 'plan:turn-a',
  msg_id: 'turn-a',
  conversation_id: 'conv-1',
  type: 'plan',
  position: 'left',
  created_at: 1,
  content: { entries: [{ content: 'step', status: 'pending' }], turn_id: 'turn-id-1' },
} as unknown as TMessage;

beforeEach(() => {
  invoke.mockResolvedValue(PLAN_ROW);
  runtimeView.mockReturnValue({ hydrated: true, isProcessing: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('usePlanRecovery', () => {
  it('does not fetch before the runtime view has hydrated', () => {
    // The runtime view resolves isProcessing asynchronously. Firing on the first
    // snapshot reads a false `false` and the bar silently stays empty — exactly
    // the case this hook exists for.
    runtimeView.mockReturnValue({ hydrated: false, isProcessing: true });
    renderHook(() => usePlanRecovery('conv-1'));
    expect(invoke).not.toHaveBeenCalled();
  });

  it('does not fetch when no turn is running', () => {
    runtimeView.mockReturnValue({ hydrated: true, isProcessing: false });
    renderHook(() => usePlanRecovery('conv-1'));
    expect(invoke).not.toHaveBeenCalled();
  });

  it('fetches the latest plan while a turn is running', async () => {
    renderHook(() => usePlanRecovery('conv-1'));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith({ conversation_id: 'conv-1', type: 'plan' }));
  });

  it('injects the fetched plan when the list does not already hold it', async () => {
    renderHook(() => usePlanRecovery('conv-1'));
    await waitFor(() => expect(updateMessageList).toHaveBeenCalled());

    const updater = updateMessageList.mock.calls[0][0] as (list: TMessage[]) => TMessage[];
    expect(updater([])).toHaveLength(1);
  });

  it('does not duplicate a plan the list already holds', async () => {
    renderHook(() => usePlanRecovery('conv-1'));
    await waitFor(() => expect(updateMessageList).toHaveBeenCalled());

    const updater = updateMessageList.mock.calls[0][0] as (list: TMessage[]) => TMessage[];
    const existing = [PLAN_ROW];
    expect(updater(existing)).toBe(existing);
  });

  it('stays quiet when the backend has no plan row', async () => {
    invoke.mockResolvedValue(null);
    renderHook(() => usePlanRecovery('conv-1'));
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(updateMessageList).not.toHaveBeenCalled();
  });
});
