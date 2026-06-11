/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * useBgProcesses — list/subscribe/poll/optimistic-stop for the Phase 3
 * background-process REST surface (`/api/remote-agents/{id}/bg-processes*`).
 *
 * Why a custom hook instead of plain SWR:
 *  - The list is augmented by `remote.bgProcessChanged` WS pushes; SWR's
 *    `mutate` would race with our own reducer, so we keep a single
 *    process-snapshot map and merge by `process.id`.
 *  - We need a 5 s *fallback* poll that's only active while something is
 *    running OR the panel is open (never spin a timer for an empty list).
 *  - `stop()` must be optimistic — flip the row to `killed` immediately
 *    and re-sync when the server returns the final snapshot.
 *
 * The hook is pure: it knows nothing about the panel UI. The consumer
 * passes `remoteAgentId` (nullable to suspend), and an optional
 * `pollWhileOpen` flag for "open the panel → start polling even if no
 * process is running" (the user is reading old output).
 */

import { ipcBridge } from '@/common';
import type { BgProcessChangedEvent, BgProcessUiInfo } from '@/common/types/agent/bgProcessTypes';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type UseBgProcessesOptions = {
  /**
   * When true the polling interval runs whenever the list is non-empty OR
   * the consumer has the panel open. When false (default) the poll runs
   * only while at least one process is in `running` status. Set this from
   * the panel's `visible` prop so opening a panel always refreshes.
   */
  pollWhileOpen?: boolean;
  /** Override the 5 s poll cadence (tests use 50 ms). */
  pollIntervalMs?: number;
};

export type UseBgProcessesResult = {
  /** All known processes, running first then most-recently-started. */
  processes: BgProcessUiInfo[];
  /** Subset currently in `running` status. */
  running: BgProcessUiInfo[];
  /** True until the first `listBgProcesses` response resolves. */
  loading: boolean;
  /** Last error message (if any). Cleared on the next successful fetch. */
  error: string | null;
  /** True while the fallback poll is active — exposed for tests. */
  isPolling: boolean;
  /**
   * Stop a single process. Optimistically flips the row to `killed`
   * locally; the server's final snapshot (returned by `stopBgProcess`)
   * wins on resolve.
   */
  stop: (pid: string) => Promise<BgProcessUiInfo | null>;
  /** Force an immediate re-list (e.g. when the panel opens). */
  refresh: () => Promise<void>;
};

const DEFAULT_POLL_MS = 5_000;

const sortByStatusAndRecency = (a: BgProcessUiInfo, b: BgProcessUiInfo): number => {
  // Running always floats to the top so the user sees live activity.
  if (a.status === 'running' && b.status !== 'running') return -1;
  if (b.status === 'running' && a.status !== 'running') return 1;
  // Tie-break by started_at descending (newest first).
  return b.started_at_ms - a.started_at_ms;
};

/**
 * Replace or insert `process` into `current`. Returns a NEW array (no
 * in-place mutation) so React can bail on shallow-equal re-renders.
 */
const mergeProcess = (current: BgProcessUiInfo[], process: BgProcessUiInfo): BgProcessUiInfo[] => {
  const idx = current.findIndex((p) => p.id === process.id);
  if (idx === -1) return [...current, process].toSorted(sortByStatusAndRecency);
  const next = current.slice();
  // Status & bytes-only fields change frequently; always overwrite.
  next[idx] = process;
  return next.toSorted(sortByStatusAndRecency);
};

export const useBgProcesses = (
  remoteAgentId: string | null | undefined,
  options: UseBgProcessesOptions = {}
): UseBgProcessesResult => {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_MS;
  const pollWhileOpen = options.pollWhileOpen ?? false;

  const [processes, setProcesses] = useState<BgProcessUiInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(Boolean(remoteAgentId));
  const [error, setError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState<boolean>(false);

  // Refs let the WS subscription + the poll interval always read the
  // latest values without forcing the effects to re-subscribe.
  const processesRef = useRef<BgProcessUiInfo[]>([]);
  const panelOpenRef = useRef<boolean>(false);
  const mountedRef = useRef<boolean>(true);

  useEffect(() => {
    processesRef.current = processes;
  }, [processes]);
  useEffect(() => {
    panelOpenRef.current = pollWhileOpen;
  }, [pollWhileOpen]);

  const setSafe = useCallback(<T>(setter: (value: T) => void, value: T) => {
    if (mountedRef.current) setter(value);
  }, []);

  const fetchList = useCallback(async (): Promise<void> => {
    if (!remoteAgentId) return;
    try {
      const res = await ipcBridge.remoteAgent.listBgProcesses.invoke({ id: remoteAgentId });
      if (!mountedRef.current) return;
      const list = Array.isArray(res?.processes) ? res.processes : [];
      setProcesses(list.slice().toSorted(sortByStatusAndRecency));
      setError(null);
    } catch (e) {
      if (!mountedRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [remoteAgentId]);

  // Initial fetch + reset on agent change.
  useEffect(() => {
    mountedRef.current = true;
    if (!remoteAgentId) {
      setProcesses([]);
      setLoading(false);
      setError(null);
      setIsPolling(false);
      return;
    }
    setLoading(true);
    void fetchList();
    return () => {
      mountedRef.current = false;
    };
  }, [remoteAgentId, fetchList]);

  // WS push subscription. Filter by agent_id because the broadcast is
  // shared across all remote agents.
  useEffect(() => {
    if (!remoteAgentId) return;
    const unsubscribe = ipcBridge.remoteAgent.bgProcessChanged.on((event: BgProcessChangedEvent) => {
      if (!event || event.agent_id !== remoteAgentId) return;
      setSafe(setProcesses, (prev) => mergeProcess(prev, event.process));
    });
    return () => {
      unsubscribe();
    };
  }, [remoteAgentId, setSafe]);

  // Fallback poll — `pollIntervalMs` cadence, fires `fetchList` only
  // while a process is running or the panel is open. The interval is
  // created/destroyed by a single effect that depends on the `gate`
  // boolean (true ↔ "should be polling right now").
  //
  // Gate computation lives in its own effect so a `pollWhileOpen`
  // change can flip the gate *without* re-creating the interval
  // callback (and the fresh `fetchList` it closes over).
  const shouldGate = useMemo<boolean>(() => {
    if (pollWhileOpen) return true;
    return processes.some((p) => p.status === 'running');
  }, [pollWhileOpen, processes]);

  useEffect(() => {
    if (!remoteAgentId) return;
    if (!shouldGate) {
      setIsPolling(false);
      return;
    }
    setIsPolling(true);
    const intervalId = setInterval(() => {
      void fetchList();
    }, pollIntervalMs);
    return () => {
      clearInterval(intervalId);
      setIsPolling(false);
    };
  }, [remoteAgentId, pollIntervalMs, fetchList, shouldGate]);

  const refresh = useCallback(async () => {
    await fetchList();
  }, [fetchList]);

  const stop = useCallback(
    async (pid: string): Promise<BgProcessUiInfo | null> => {
      if (!remoteAgentId) return null;
      // Optimistic flip — the row goes to `killed` immediately so the UI
      // doesn't show a stop button on something we just asked to die.
      setSafe(setProcesses, (prev) => {
        const idx = prev.findIndex((p) => p.id === pid);
        if (idx === -1) return prev;
        const next = prev.slice();
        const target = next[idx];
        next[idx] = { ...target, status: 'killed' };
        return next;
      });
      try {
        const final = await ipcBridge.remoteAgent.stopBgProcess.invoke({ id: remoteAgentId, pid });
        if (mountedRef.current && final) {
          setSafe(setProcesses, (prev) => mergeProcess(prev, final));
        }
        return final ?? null;
      } catch (e) {
        if (mountedRef.current) setError(e instanceof Error ? e.message : String(e));
        // Re-sync on failure — the server is the source of truth.
        void fetchList();
        return null;
      }
    },
    [remoteAgentId, fetchList, setSafe]
  );

  const running = useMemo(() => processes.filter((p) => p.status === 'running'), [processes]);

  return { processes, running, loading, error, isPolling, stop, refresh };
};
