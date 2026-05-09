/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for renderer/hooks/assistant/useDetectedAgents.ts (A4 in N4a).
 * Tests useDetectedAgents hook: agent detection via SWR and refresh trigger.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock SWR
vi.mock('swr', () => ({
  default: vi.fn((key, fetcher) => {
    // Return mock data immediately for simplicity
    return { data: [], error: null, isLoading: false };
  }),
  mutate: vi.fn(),
}));

// Mock @/common
vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      refreshCustomAgents: { invoke: vi.fn() },
    },
  },
}));

// Mock agentTypes module
vi.mock('@/renderer/utils/model/agentTypes', () => ({
  DETECTED_AGENTS_SWR_KEY: 'detected-agents',
  fetchDetectedAgents: vi.fn(),
}));

import { useDetectedAgents } from '@/renderer/hooks/assistant/useDetectedAgents';
import { ipcBridge } from '@/common';
import useSWR, { mutate } from 'swr';
import type { AgentMetadata } from '@/renderer/utils/model/agentTypes';

describe('useDetectedAgents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty availableBackends when no agents detected', () => {
    (useSWR as any).mockReturnValue({ data: [], error: null });

    const { result } = renderHook(() => useDetectedAgents());

    expect(result.current.availableBackends).toEqual([]);
  });

  it('filters and maps detected agents to availableBackends', () => {
    const mockAgents: AgentMetadata[] = [
      { id: 'a1', name: 'LocalAgent', agent_type: 'local', agent_source: 'builtin' },
      { id: 'a2', name: 'ExtAgent', agent_type: 'local', agent_source: 'extension' },
      { id: 'a3', name: 'RemoteAgent', agent_type: 'remote', agent_source: 'builtin' },
    ];
    (useSWR as any).mockReturnValue({ data: mockAgents, error: null });

    const { result } = renderHook(() => useDetectedAgents());

    expect(result.current.availableBackends).toHaveLength(2); // 'remote' excluded
    expect(result.current.availableBackends[0]).toEqual({ id: 'a1', name: 'LocalAgent', isExtension: false });
    expect(result.current.availableBackends[1]).toEqual({ id: 'a2', name: 'ExtAgent', isExtension: true });
  });

  it('calls refreshCustomAgents and mutate on refreshAgentDetection', async () => {
    (useSWR as any).mockReturnValue({ data: [], error: null });
    (ipcBridge.acpConversation.refreshCustomAgents.invoke as any).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDetectedAgents());

    await act(async () => {
      await result.current.refreshAgentDetection();
    });

    expect(ipcBridge.acpConversation.refreshCustomAgents.invoke).toHaveBeenCalled();
    expect(mutate).toHaveBeenCalledWith('detected-agents');
  });

  it('ignores error during refreshAgentDetection', async () => {
    (useSWR as any).mockReturnValue({ data: [], error: null });
    (ipcBridge.acpConversation.refreshCustomAgents.invoke as any).mockRejectedValue(new Error('Refresh failed'));

    const { result } = renderHook(() => useDetectedAgents());

    await act(async () => {
      await result.current.refreshAgentDetection();
    });

    // Should not throw or log error (hook ignores it)
    expect(ipcBridge.acpConversation.refreshCustomAgents.invoke).toHaveBeenCalled();
  });
});
