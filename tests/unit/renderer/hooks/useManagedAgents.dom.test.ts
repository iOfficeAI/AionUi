/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for renderer/hooks/agent/useAgents.ts → useManagedAgents.
 *
 * The Agent settings management surface must read the
 * `include_disabled=true` view (a SEPARATE SWR key from the pickers) and,
 * when an agent is toggled, revalidate BOTH the management key and the
 * shared detected key — otherwise re-enabling an agent in settings would
 * not make it reappear in the pickers.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('swr', () => ({
  default: vi.fn(() => ({ data: [], error: null, isLoading: false })),
  mutate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      refreshCustomAgents: { invoke: vi.fn().mockResolvedValue(undefined) },
    },
  },
}));

vi.mock('@/renderer/utils/model/agentTypes', () => ({
  DETECTED_AGENTS_SWR_KEY: 'agents.detected',
  MANAGED_AGENTS_SWR_KEY: 'agents.managed',
  fetchDetectedAgents: vi.fn(),
  fetchManagedAgents: vi.fn(),
}));

import { useManagedAgents } from '@/renderer/hooks/agent/useAgents';
import { ipcBridge } from '@/common';
import useSWR, { mutate } from 'swr';
import { fetchManagedAgents } from '@/renderer/utils/model/agentTypes';

describe('useManagedAgents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('subscribes to the management SWR key with the managed fetcher', () => {
    (useSWR as any).mockReturnValue({ data: [], error: null, isLoading: false });

    renderHook(() => useManagedAgents());

    expect(useSWR).toHaveBeenCalledWith('agents.managed', fetchManagedAgents);
  });

  it('exposes the agents returned by SWR', () => {
    const agents = [
      { id: 'x', name: 'X', agent_type: 'acp', agent_source: 'custom', enabled: false, available: false },
    ];
    (useSWR as any).mockReturnValue({ data: agents, error: null, isLoading: false });

    const { result } = renderHook(() => useManagedAgents());

    expect(result.current.agents).toEqual(agents);
  });

  it('falls back to an empty list when SWR has no data yet', () => {
    (useSWR as any).mockReturnValue({ data: undefined, error: null, isLoading: true });

    const { result } = renderHook(() => useManagedAgents());

    expect(result.current.agents).toEqual([]);
  });

  it('revalidate refreshes BOTH the management and the shared detected key', async () => {
    (useSWR as any).mockReturnValue({ data: [], error: null, isLoading: false });

    const { result } = renderHook(() => useManagedAgents());

    await act(async () => {
      await result.current.revalidate();
    });

    expect(mutate).toHaveBeenCalledWith('agents.managed');
    expect(mutate).toHaveBeenCalledWith('agents.detected');
  });

  it('refreshCustomAgents triggers a backend rescan then revalidates both keys', async () => {
    (useSWR as any).mockReturnValue({ data: [], error: null, isLoading: false });

    const { result } = renderHook(() => useManagedAgents());

    await act(async () => {
      await result.current.refreshCustomAgents();
    });

    expect(ipcBridge.acpConversation.refreshCustomAgents.invoke).toHaveBeenCalled();
    expect(mutate).toHaveBeenCalledWith('agents.managed');
    expect(mutate).toHaveBeenCalledWith('agents.detected');
  });
});
