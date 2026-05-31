/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { RemoteAgentConfig } from '@/common/types/agent/remoteAgentTypes';
import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';

export type RemoteAgentHealthEntry = {
  healthy: boolean;
  latency_ms: number;
  error?: string;
  checked_at: number;
};

export type RemoteAgentHealthMap = Record<string, RemoteAgentHealthEntry | 'loading'>;

const POLL_INTERVAL_MS = 60_000;

export const useRemoteAgentHealth = (): {
  agents: RemoteAgentConfig[];
  health: RemoteAgentHealthMap;
  refresh: () => Promise<void>;
} => {
  const { data: agents, mutate: mutateAgents } = useSWR('remote-agents.list', () =>
    ipcBridge.remoteAgent.list.invoke()
  );
  const [health, setHealth] = useState<RemoteAgentHealthMap>({});
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

  return { agents: agents ?? [], health, refresh: async () => refresh() };
};
