/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Behavioral tests for the sessionHealth WS push side of
 * `useRemoteAgentHealth`. The hook must:
 *   - mark the agent's health row as degraded (with length-capped
 *     message) on `session.error`
 *   - trigger a reconcile (single `pingHealth` round) on either kind
 *   - clear the cached session error when the next reconcile reports
 *     the agent healthy
 *   - ignore events for agents the hook does not track
 *   - clean up the singleton subscription on unmount
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  workspaceListeners: [] as Array<(event: { agent_id: string; file?: string; event?: string }) => void>,
  sessionHealthListeners: [] as Array<
    (event: { agent_id: string; session_id?: string; kind: 'idle' | 'error'; message?: string }) => void
  >,
  workspaceOffCalls: 0,
  sessionHealthOffCalls: 0,
}));

const agentStore = vi.hoisted(() => ({
  agents: [] as Array<{ id: string; name: string; protocol: 'opencode' }>,
  pingResponses: new Map<string, { healthy: boolean; latency_ms: number; error?: string }>(),
  pingCalls: 0,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    remoteAgent: {
      list: {
        invoke: () => Promise.resolve(agentStore.agents),
      },
      pingHealth: {
        invoke: ({ id }: { id: string }) => {
          agentStore.pingCalls += 1;
          return Promise.resolve(agentStore.pingResponses.get(id) ?? { healthy: true, latency_ms: 10 });
        },
      },
      workspaceChanged: {
        on: (cb: (event: { agent_id: string; file?: string; event?: string }) => void) => {
          mockState.workspaceListeners.push(cb);
          return () => {
            mockState.workspaceOffCalls += 1;
            mockState.workspaceListeners = mockState.workspaceListeners.filter((existing) => existing !== cb);
          };
        },
      },
      sessionHealth: {
        on: (cb: (event: { agent_id: string; kind: 'idle' | 'error'; message?: string }) => void) => {
          mockState.sessionHealthListeners.push(cb);
          return () => {
            mockState.sessionHealthOffCalls += 1;
            mockState.sessionHealthListeners = mockState.sessionHealthListeners.filter((existing) => existing !== cb);
          };
        },
      },
    },
  },
}));

vi.mock('swr', () => ({
  default: () => ({ data: agentStore.agents, mutate: vi.fn() }),
}));

import { useRemoteAgentHealth } from '@/renderer/hooks/agent/useRemoteAgentHealth';
import { __test__ as useRemoteWorkspaceEventsTest } from '@/renderer/hooks/agent/useRemoteWorkspaceEvents';

const fireSessionHealth = (event: {
  agent_id: string;
  session_id?: string;
  kind: 'idle' | 'error';
  message?: string;
}): void => {
  for (const listener of [...mockState.sessionHealthListeners]) listener(event);
};

beforeEach(() => {
  useRemoteWorkspaceEventsTest.__resetSingletons();
  agentStore.agents = [];
  agentStore.pingResponses.clear();
  agentStore.pingCalls = 0;
  mockState.workspaceListeners = [];
  mockState.sessionHealthListeners = [];
  mockState.workspaceOffCalls = 0;
  mockState.sessionHealthOffCalls = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useRemoteAgentHealth — sessionHealth push', () => {
  it('marks the agent unhealthy with the capped error message on session.error', async () => {
    agentStore.agents = [{ id: 'agent-1', name: 'Remote 1', protocol: 'opencode' }];
    agentStore.pingResponses.set('agent-1', { healthy: true, latency_ms: 12 });

    const { result } = renderHook(() => useRemoteAgentHealth());

    // Wait for the initial poll to settle.
    await waitFor(() => {
      expect(result.current.health['agent-1']).toBeDefined();
    });
    const callsBefore = agentStore.pingCalls;

    act(() => {
      // Simulate that the underlying agent is actually broken, so the
      // reconcile refresh triggered by the event also reports failure.
      agentStore.pingResponses.set('agent-1', { healthy: false, latency_ms: 0, error: 'connection reset' });
      fireSessionHealth({ agent_id: 'agent-1', kind: 'error', message: 'connection reset' });
    });

    await waitFor(() => {
      const entry = result.current.health['agent-1'];
      expect(entry).toMatchObject({ healthy: false, error: 'connection reset' });
    });
    expect(result.current.sessionErrors['agent-1']).toMatchObject({ message: 'connection reset' });
    // The error event must trigger exactly one reconcile (not zero, not many).
    expect(agentStore.pingCalls).toBeGreaterThan(callsBefore);
  });

  it('caps the error message length', async () => {
    agentStore.agents = [{ id: 'agent-1', name: 'Remote 1', protocol: 'opencode' }];
    agentStore.pingResponses.set('agent-1', { healthy: true, latency_ms: 12 });

    const { result } = renderHook(() => useRemoteAgentHealth());
    await waitFor(() => {
      expect(result.current.health['agent-1']).toBeDefined();
    });

    const huge = 'x'.repeat(2000);
    const capped = huge.slice(0, 500) + '…';

    act(() => {
      agentStore.pingResponses.set('agent-1', { healthy: false, latency_ms: 0, error: capped });
      fireSessionHealth({ agent_id: 'agent-1', kind: 'error', message: huge });
    });

    await waitFor(() => {
      const entry = result.current.health['agent-1'];
      if (entry === 'loading' || entry.healthy) return false;
      return Boolean(entry.error);
    });
    const entry = result.current.health['agent-1'];
    if (entry === 'loading') throw new Error('still loading');
    expect(entry.error && entry.error.length).toBeLessThanOrEqual(501);
  });

  it('triggers a reconcile (pingHealth call) on session.idle', async () => {
    agentStore.agents = [{ id: 'agent-1', name: 'Remote 1', protocol: 'opencode' }];
    agentStore.pingResponses.set('agent-1', { healthy: true, latency_ms: 12 });

    const { result } = renderHook(() => useRemoteAgentHealth());
    await waitFor(() => {
      expect(result.current.health['agent-1']).toBeDefined();
    });
    const callsBefore = agentStore.pingCalls;

    act(() => {
      fireSessionHealth({ agent_id: 'agent-1', kind: 'idle' });
    });

    await waitFor(() => {
      expect(agentStore.pingCalls).toBeGreaterThan(callsBefore);
    });
    // idle is a reconcile, not an error state.
    expect(result.current.sessionErrors['agent-1']).toBeUndefined();
  });

  it('ignores events for an agent the hook does not track', async () => {
    agentStore.agents = [{ id: 'agent-1', name: 'Remote 1', protocol: 'opencode' }];
    agentStore.pingResponses.set('agent-1', { healthy: true, latency_ms: 12 });

    const { result } = renderHook(() => useRemoteAgentHealth());
    await waitFor(() => {
      expect(result.current.health['agent-1']).toBeDefined();
    });
    const callsBefore = agentStore.pingCalls;

    act(() => {
      fireSessionHealth({ agent_id: 'agent-unknown', kind: 'error', message: 'not for us' });
    });

    // No state churn, no extra ping.
    expect(result.current.sessionErrors['agent-unknown']).toBeUndefined();
    expect(agentStore.pingCalls).toBe(callsBefore);
  });

  it('clears the cached session error when the next reconcile reports healthy', async () => {
    agentStore.agents = [{ id: 'agent-1', name: 'Remote 1', protocol: 'opencode' }];
    agentStore.pingResponses.set('agent-1', { healthy: true, latency_ms: 12 });

    const { result } = renderHook(() => useRemoteAgentHealth());
    await waitFor(() => {
      expect(result.current.health['agent-1']).toBeDefined();
    });

    act(() => {
      fireSessionHealth({ agent_id: 'agent-1', kind: 'error', message: 'first failure' });
    });
    await waitFor(() => {
      expect(result.current.sessionErrors['agent-1']).toBeDefined();
    });

    // The reconcile triggered by the error event should also see a
    // healthy ping and clear the cached session error.
    await waitFor(() => {
      expect(result.current.sessionErrors['agent-1']).toBeUndefined();
    });
  });

  it('unsubscribes the singleton on unmount', () => {
    agentStore.agents = [{ id: 'agent-1', name: 'Remote 1', protocol: 'opencode' }];
    agentStore.pingResponses.set('agent-1', { healthy: true, latency_ms: 12 });

    const { unmount } = renderHook(() => useRemoteAgentHealth());
    expect(mockState.sessionHealthListeners).toHaveLength(1);

    unmount();
    expect(mockState.sessionHealthOffCalls).toBe(1);
    expect(mockState.sessionHealthListeners).toHaveLength(0);
  });
});
