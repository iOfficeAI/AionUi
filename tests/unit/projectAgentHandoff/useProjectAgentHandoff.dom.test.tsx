/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetProjectExecutorStateInvoke = vi.fn();
const mockGetProjectExecutorCandidatesInvoke = vi.fn();
const mockGetProjectExecutorHistoryInvoke = vi.fn();
const mockQueueProjectExecutorSwitchInvoke = vi.fn();
const mockCancelPendingProjectExecutorSwitchInvoke = vi.fn();

let projectExecutorChangedHandler: ((event: { conversationId: string }) => void) | undefined;

const mockProjectExecutorChangedOn = vi.fn((handler: (event: { conversationId: string }) => void): (() => void) => {
  projectExecutorChangedHandler = handler;
  return () => {
    if (projectExecutorChangedHandler === handler) {
      projectExecutorChangedHandler = undefined;
    }
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      getProjectExecutorState: {
        invoke: (...args: unknown[]) => mockGetProjectExecutorStateInvoke(...args),
      },
      getProjectExecutorCandidates: {
        invoke: (...args: unknown[]) => mockGetProjectExecutorCandidatesInvoke(...args),
      },
      getProjectExecutorHistory: {
        invoke: (...args: unknown[]) => mockGetProjectExecutorHistoryInvoke(...args),
      },
      queueProjectExecutorSwitch: {
        invoke: (...args: unknown[]) => mockQueueProjectExecutorSwitchInvoke(...args),
      },
      cancelPendingProjectExecutorSwitch: {
        invoke: (...args: unknown[]) => mockCancelPendingProjectExecutorSwitchInvoke(...args),
      },
      projectExecutorChanged: {
        on: (...args: unknown[]) => mockProjectExecutorChangedOn(...args),
      },
    },
  },
}));

import { useProjectAgentHandoff } from '../../../src/renderer/pages/conversation/hooks/useProjectAgentHandoff';

const swrWrapper = ({ children }: { children: React.ReactNode }) => (
  <SWRConfig
    value={{
      provider: () => new Map(),
      dedupingInterval: 0,
      revalidateOnFocus: false,
      errorRetryCount: 0,
    }}
  >
    {children}
  </SWRConfig>
);

describe('useProjectAgentHandoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    projectExecutorChangedHandler = undefined;

    mockGetProjectExecutorStateInvoke.mockResolvedValue({
      success: true,
      data: {
        conversationId: 'conv-1',
        currentExecutorId: 'gemini',
        pendingExecutorId: 'aionrs',
        status: 'pending-switch',
        updatedAt: 123,
      },
    });
    mockGetProjectExecutorCandidatesInvoke.mockResolvedValue({
      success: true,
      data: [
        { id: 'gemini', label: 'Gemini', agentType: 'gemini', source: 'aionui', available: false },
        { id: 'aionrs', label: 'Aion CLI', agentType: 'aionrs', source: 'aionui', available: true },
      ],
    });
    mockGetProjectExecutorHistoryInvoke.mockResolvedValue({
      success: true,
      data: [
        {
          conversationId: 'conv-1',
          fromExecutorId: 'gemini',
          toExecutorId: 'aionrs',
          reason: 'manual',
          queuedAt: 100,
          status: 'queued',
        },
      ],
    });
    mockQueueProjectExecutorSwitchInvoke.mockResolvedValue({
      success: true,
      data: {
        applied: true,
        state: {
          conversationId: 'conv-1',
          currentExecutorId: 'aionrs',
          status: 'idle',
          updatedAt: 200,
        },
        record: {
          conversationId: 'conv-1',
          fromExecutorId: 'gemini',
          toExecutorId: 'aionrs',
          reason: 'manual',
          queuedAt: 100,
          switchedAt: 200,
          status: 'applied',
        },
      },
    });
    mockCancelPendingProjectExecutorSwitchInvoke.mockResolvedValue({
      success: true,
      data: {
        conversationId: 'conv-1',
        currentExecutorId: 'gemini',
        status: 'idle',
        updatedAt: 150,
      },
    });
  });

  it('loads state/candidates/history and derives available + pending candidate', async () => {
    const { result } = renderHook(() => useProjectAgentHandoff('conv-1'), { wrapper: swrWrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.state?.conversationId).toBe('conv-1');
    expect(result.current.candidates).toHaveLength(2);
    expect(result.current.availableCandidates).toHaveLength(1);
    expect(result.current.availableCandidates[0]?.id).toBe('aionrs');
    expect(result.current.pendingCandidate?.id).toBe('aionrs');
    expect(result.current.history).toHaveLength(1);
  });

  it('queueSwitch invokes IPC and refreshes data', async () => {
    const { result } = renderHook(() => useProjectAgentHandoff('conv-1'), { wrapper: swrWrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const initialStateCalls = mockGetProjectExecutorStateInvoke.mock.calls.length;
    const initialCandidateCalls = mockGetProjectExecutorCandidatesInvoke.mock.calls.length;
    const initialHistoryCalls = mockGetProjectExecutorHistoryInvoke.mock.calls.length;

    await act(async () => {
      const queueResult = await result.current.queueSwitch('aionrs');
      expect(queueResult.applied).toBe(true);
    });

    expect(mockQueueProjectExecutorSwitchInvoke).toHaveBeenCalledWith({
      conversation_id: 'conv-1',
      targetExecutorId: 'aionrs',
    });
    await waitFor(() => expect(mockGetProjectExecutorStateInvoke.mock.calls.length).toBeGreaterThan(initialStateCalls));
    expect(mockGetProjectExecutorCandidatesInvoke.mock.calls.length).toBeGreaterThan(initialCandidateCalls);
    expect(mockGetProjectExecutorHistoryInvoke.mock.calls.length).toBeGreaterThan(initialHistoryCalls);
  });

  it('cancelPendingSwitch invokes IPC and refreshes data', async () => {
    const { result } = renderHook(() => useProjectAgentHandoff('conv-1'), { wrapper: swrWrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      const nextState = await result.current.cancelPendingSwitch();
      expect(nextState.status).toBe('idle');
    });

    expect(mockCancelPendingProjectExecutorSwitchInvoke).toHaveBeenCalledWith({
      conversation_id: 'conv-1',
    });
  });

  it('refreshes when projectExecutorChanged event matches current conversation', async () => {
    const { result } = renderHook(() => useProjectAgentHandoff('conv-1'), { wrapper: swrWrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const stateCallsBefore = mockGetProjectExecutorStateInvoke.mock.calls.length;
    const candidateCallsBefore = mockGetProjectExecutorCandidatesInvoke.mock.calls.length;
    const historyCallsBefore = mockGetProjectExecutorHistoryInvoke.mock.calls.length;

    act(() => {
      projectExecutorChangedHandler?.({ conversationId: 'conv-other' });
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockGetProjectExecutorStateInvoke.mock.calls.length).toBe(stateCallsBefore);

    act(() => {
      projectExecutorChangedHandler?.({ conversationId: 'conv-1' });
    });
    await waitFor(() => expect(mockGetProjectExecutorStateInvoke.mock.calls.length).toBeGreaterThan(stateCallsBefore));
    expect(mockGetProjectExecutorCandidatesInvoke.mock.calls.length).toBeGreaterThan(candidateCallsBefore);
    expect(mockGetProjectExecutorHistoryInvoke.mock.calls.length).toBeGreaterThan(historyCallsBefore);
  });
});
