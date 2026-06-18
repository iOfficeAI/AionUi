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
    // Option `id` must be the backend slug (what `preset_agent_type` stores),
    // not the AgentMetadata row id — otherwise the assistant editor saves a row
    // id (e.g. "2d23ff1c") as `preset_agent_type`, which later resolves to no
    // agent.
    const mockAgents: AgentMetadata[] = [
      { id: 'a1', name: 'ClaudeCode', agent_type: 'acp', agent_source: 'builtin', backend: 'claude' },
      { id: 'a2', name: 'ExtAgent', agent_type: 'local', agent_source: 'extension' },
      { id: 'a3', name: 'RemoteAgent', agent_type: 'remote', agent_source: 'builtin' },
    ];
    (useSWR as any).mockReturnValue({ data: mockAgents, error: null });

    const { result } = renderHook(() => useDetectedAgents());

    expect(result.current.availableBackends).toHaveLength(2); // 'remote' excluded
    // backend slug wins when present
    expect(result.current.availableBackends[0]).toEqual({
      id: 'claude',
      name: 'ClaudeCode',
      isExtension: false,
      modelOptions: [],
    });
    // falls back to agent_type when backend is absent (e.g. internal engines)
    expect(result.current.availableBackends[1]).toEqual({
      id: 'local',
      name: 'ExtAgent',
      isExtension: true,
      modelOptions: [],
    });
  });

  it('derives backend-scoped model options from handshake available_models', () => {
    const mockAgents: AgentMetadata[] = [
      {
        id: 'a1',
        name: 'ClaudeCode',
        agent_type: 'acp',
        agent_source: 'builtin',
        backend: 'claude',
        handshake: {
          available_models: {
            current_model_id: 'claude-sonnet-4',
            current_model_label: 'Claude Sonnet 4',
            available_models: [
              { id: 'claude-sonnet-4', label: 'Claude Sonnet 4' },
              { id: 'claude-opus-4', label: 'Claude Opus 4' },
            ],
          },
        },
      },
    ];
    (useSWR as any).mockReturnValue({ data: mockAgents, error: null });

    const { result } = renderHook(() => useDetectedAgents());

    expect(result.current.availableBackends[0]?.modelOptions).toEqual([
      { value: 'claude-sonnet-4', label: 'Claude Sonnet 4' },
      { value: 'claude-opus-4', label: 'Claude Opus 4' },
    ]);
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
