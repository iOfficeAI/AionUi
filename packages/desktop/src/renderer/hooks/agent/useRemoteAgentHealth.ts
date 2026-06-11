/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { RemoteAgentConfig } from '@/common/types/agent/remoteAgentTypes';
import { useRemoteSessionHealth } from '@/renderer/hooks/agent/useRemoteWorkspaceEvents';
import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';

export type RemoteAgentHealthEntry = {
  healthy: boolean;
  latency_ms: number;
  error?: string;
  checked_at: number;
};

export type RemoteAgentHealthMap = Record<string, RemoteAgentHealthEntry | 'loading'>;

/**
 * Per-agent last-known session error. Set when a `session.error` push
 * arrives via `remote.sessionHealth`; cleared by the next successful
 * reconcile (e.g. an `idle` event or a healthy ping). Distinct from the
 * generic `RemoteAgentHealthEntry.error` field (which is set by
 * `pingHealth` failures) so consumers can render a dedicated UI state
 * for the "remote session blew up" case.
 */
export type RemoteSessionErrorMap = Record<string, { message: string; at: number } | undefined>;

const POLL_INTERVAL_MS = 60_000;

// Server caps session.error messages to keep WS payloads bounded; mirror
// the cap on the renderer side so a misbehaving backend can't blow up
// React state with an unbounded string.
const MAX_ERROR_MESSAGE_LENGTH = 500;

const capErrorMessage = (msg: string | undefined): string | undefined => {
  if (!msg) return msg;
  return msg.length > MAX_ERROR_MESSAGE_LENGTH ? `${msg.slice(0, MAX_ERROR_MESSAGE_LENGTH)}…` : msg;
};

export const useRemoteAgentHealth = (): {
  agents: RemoteAgentConfig[];
  health: RemoteAgentHealthMap;
  sessionErrors: RemoteSessionErrorMap;
  refresh: () => Promise<void>;
} => {
  const { data: agents, mutate: mutateAgents } = useSWR('remote-agents.list', () =>
    ipcBridge.remoteAgent.list.invoke()
  );
  const [health, setHealth] = useState<RemoteAgentHealthMap>({});
  const [sessionErrors, setSessionErrors] = useState<RemoteSessionErrorMap>({});
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!agents?.length) {
      setHealth({});
      return;
    }
    const pending: Record<string, RemoteAgentHealthEntry | 'loading'> = {};
    for (const agent of agents) {
      pending[agent.id] = 'loading';
    }
    if (mountedRef.current) setHealth(pending);

    const results = await Promise.all(
      agents.map(async (agent): Promise<[string, RemoteAgentHealthEntry]> => {
        try {
          const resp = await ipcBridge.remoteAgent.pingHealth.invoke({ id: agent.id });
          return [
            agent.id,
            {
              healthy: resp.healthy,
              latency_ms: resp.latency_ms,
              error: resp.error,
              checked_at: Date.now(),
            },
          ];
        } catch (err) {
          return [
            agent.id,
            {
              healthy: false,
              latency_ms: 0,
              error: String(err),
              checked_at: Date.now(),
            },
          ];
        }
      })
    );
    if (!mountedRef.current) return;
    const next: RemoteAgentHealthMap = {};
    for (const [id, entry] of results) {
      next[id] = entry;
    }
    setHealth(next);
    // A successful reconcile means the row is back in a known state; if
    // the latest ping is healthy we also clear any lingering session
    // error from an earlier event.
    setSessionErrors((prev) => {
      const out: RemoteSessionErrorMap = { ...prev };
      let changed = false;
      for (const [id, entry] of results) {
        if (entry.healthy && out[id]) {
          delete out[id];
          changed = true;
        }
      }
      return changed ? out : prev;
    });
  }, [agents]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    intervalRef.current = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh]);

  // Push-driven health updates: AionCore broadcasts `session.error` /
  // `session.idle` over the shared WS. `error` immediately marks the
  // agent's row as degraded (so the badge turns red and the tooltip can
  // surface the message) and triggers a single reconcile. `idle` is
  // treated as a cheap reconcile signal — it usually means a turn just
  // finished, so we re-poll to refresh the `checked_at` timestamp.
  //
  // The hook tracks ALL configured agents, so we subscribe with a null
  // agentId and dispatch by `event.agent_id` locally.
  useRemoteSessionHealth(null, (event) => {
    if (!event || !event.agent_id) return;
    // Ignore events for agents we don't know about.
    if (!mountedRef.current || !agents?.some((a) => a.id === event.agent_id)) return;

    if (event.kind === 'error') {
      const message = capErrorMessage(event.message);
      setHealth((prev) => ({
        ...prev,
        [event.agent_id]: {
          healthy: false,
          latency_ms: 0,
          error: message,
          checked_at: Date.now(),
        },
      }));
      setSessionErrors((prev) => ({
        ...prev,
        [event.agent_id]: { message: message ?? '', at: Date.now() },
      }));
      // Reconcile the rest of the agents' health after a single hard
      // refresh — a real recovery will flip the row back to healthy.
      void refresh();
    } else if (event.kind === 'idle') {
      void refresh();
    }
  });

  return {
    agents: agents ?? [],
    health,
    sessionErrors,
    refresh: async () => refresh(),
  };
};
