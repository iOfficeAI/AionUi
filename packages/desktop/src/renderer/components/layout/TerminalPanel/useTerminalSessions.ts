/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Session-list state for the terminal panel.
 *
 * Sessions are opened optimistically with a `client_id`; the `session_id`
 * returned from the main process is patched in afterward. The hook exposes a
 * minimal command surface used by `TerminalPanel` and `TerminalTabs`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { ipcBridge } from '@/common';
import type { TerminalExitEvent } from '@/common/types/terminal/terminalTypes';
import type { TerminalSession } from './types';

const clientId = () => `term-${Math.random().toString(36).slice(2, 10)}`;

export type UseTerminalSessionsApi = {
  sessions: readonly TerminalSession[];
  activeId: string | null;
  setActive: (clientId: string) => void;
  openSession: (cwd?: string) => Promise<void>;
  closeSession: (clientId: string) => Promise<void>;
  renameSession: (clientId: string, title: string) => void;
  cycleSession: (direction: 1 | -1) => void;
};

export function useTerminalSessions(): UseTerminalSessionsApi {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Mirror of `sessions` for use inside async callbacks without stale closures.
  const sessionsRef = useRef<TerminalSession[]>([]);
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  // Subscribe once to the global exit emitter — when any PTY dies, mark its
  // tab as exited so the UI can show the exit code and disable input.
  useEffect(() => {
    const unsubscribe = ipcBridge.terminal.exit.on((event: TerminalExitEvent) => {
      setSessions((prev) =>
        prev.map((s) => (s.session_id === event.session_id ? { ...s, exited: true, exit_code: event.exit_code } : s))
      );
    });
    return () => unsubscribe();
  }, []);

  const setActive = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const openSession = useCallback(async (cwd?: string) => {
    const client_id = clientId();
    const optimistic: TerminalSession = {
      client_id,
      session_id: null,
      title: defaultTitle(sessionsRef.current.length + 1),
      cwd: cwd ?? null,
      shell: null,
      exited: false,
      exit_code: null,
    };
    setSessions((prev) => [...prev, optimistic]);
    setActiveId(client_id);

    try {
      const res = await ipcBridge.terminal.spawn.invoke({ cwd });
      if (!res?.success || !res.data) {
        markSpawnFailed(setSessions, client_id, res?.msg ?? 'Failed to spawn shell');
        return;
      }
      const { session_id, shell, cwd: resolvedCwd } = res.data;
      setSessions((prev) =>
        prev.map((s) => (s.client_id === client_id ? { ...s, session_id, shell, cwd: resolvedCwd } : s))
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      markSpawnFailed(setSessions, client_id, message);
    }
  }, []);

  const closeSession = useCallback(async (id: string) => {
    const target = sessionsRef.current.find((s) => s.client_id === id);
    if (!target) return;

    if (target.session_id && !target.exited) {
      try {
        await ipcBridge.terminal.kill.invoke({ session_id: target.session_id });
      } catch (error) {
        // Even if the kill RPC fails, drop the tab — the PTY may already be dead.
        console.error('[TerminalPanel] kill failed:', error);
      }
    }

    setSessions((prev) => {
      const idx = prev.findIndex((s) => s.client_id === id);
      if (idx === -1) return prev;
      const next = prev.filter((s) => s.client_id !== id);
      // Move focus to the neighbor on the left, falling back to the right.
      setActiveId((current) => {
        if (current !== id) return current;
        if (next.length === 0) return null;
        const fallbackIdx = Math.max(0, idx - 1);
        return next[Math.min(fallbackIdx, next.length - 1)].client_id;
      });
      return next;
    });
  }, []);

  const renameSession = useCallback((id: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setSessions((prev) => prev.map((s) => (s.client_id === id ? { ...s, title: trimmed } : s)));
  }, []);

  const cycleSession = useCallback(
    (direction: 1 | -1) => {
      const list = sessionsRef.current;
      if (list.length < 2 || !activeId) return;
      const idx = list.findIndex((s) => s.client_id === activeId);
      if (idx === -1) return;
      const next = (idx + direction + list.length) % list.length;
      setActiveId(list[next].client_id);
    },
    [activeId]
  );

  return { sessions, activeId, setActive, openSession, closeSession, renameSession, cycleSession };
}

function defaultTitle(n: number): string {
  return `Terminal ${n}`;
}

function markSpawnFailed(
  setSessions: React.Dispatch<React.SetStateAction<TerminalSession[]>>,
  client_id: string,
  msg: string
): void {
  console.error(`[TerminalPanel] spawn failed: ${msg}`);
  setSessions((prev) => prev.map((s) => (s.client_id === client_id ? { ...s, exited: true } : s)));
}
