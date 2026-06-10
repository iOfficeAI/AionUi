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
 *
 * On first mount the hook also asks the main process for the list of live
 * sessions and adds any not already present as `restored` tabs — this is
 * the Bet A2 re-attach path: PTYs survive a renderer reload, the renderer
 * just has to learn about them. The restored flag tells the corresponding
 * `<TerminalInstance>` to fetch a snapshot before subscribing to output so
 * the user sees their scrollback tail immediately.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { ipcBridge } from '@/common';
import type { TerminalExitEvent, TerminalSessionInfo } from '@/common/types/terminal/terminalTypes';
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
  /**
   * Split-pane state. `null` means no split; otherwise it is the
   * `client_id` of the right-pane session (a real spawned PTY that lives
   * outside the tab strip — see comment in the implementation).
   */
  splitSessionId: string | null;
  /** Spawn a fresh PTY rooted at the active session's cwd and open a split. */
  splitActive: () => Promise<void>;
  /** Close the right-pane split session, killing its PTY, and clear split. */
  closeSplit: () => Promise<void>;
};

export function useTerminalSessions(): UseTerminalSessionsApi {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [splitSessionId, setSplitSessionId] = useState<string | null>(null);

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

  // Re-attach: on first mount, pull the list of live PTYs from main. Anything
  // we don't already know about becomes a restored tab. Failures are
  // non-fatal — we just leave the panel empty and let the user open a new
  // shell as normal.
  useEffect(() => {
    let cancelled = false;
    const restore = async (): Promise<void> => {
      try {
        const res = await ipcBridge.terminal.list.invoke();
        if (cancelled) return;
        if (!res?.success || !Array.isArray(res.data)) {
          console.warn('[TerminalPanel] terminal.list failed:', res?.msg ?? 'unknown');
          return;
        }
        setSessions((prev) => mergeLiveSessions(prev, res.data ?? []));
      } catch (error) {
        if (cancelled) return;
        console.warn('[TerminalPanel] terminal.list threw:', error);
      }
    };
    void restore();
    return () => {
      cancelled = true;
    };
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
      restored: false,
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

    // If the closed tab was the active left-pane tab while a split was open,
    // collapse the split too — the right pane references a session we no
    // longer care about.
    setSplitSessionId((current) => (current === id ? null : current));
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

  // Split support: the right-pane session is a fully-fledged PTY like any
  // other, but it is NOT in the tab strip — the tab strip continues to
  // govern the LEFT pane only. This keeps A2 split support minimal: a single
  // binary "open / close the right pane" toggle, no per-pane tab groups
  // (those are deferred to a follow-up). The split session is tracked in
  // its own piece of state so the panel can render two TerminalInstances.
  const splitActive = useCallback(async () => {
    const active = sessionsRef.current.find((s) => s.client_id === activeId) ?? sessionsRef.current[0];
    if (!active) return;
    const cwd = active.cwd ?? undefined;
    const client_id = clientId();
    const optimistic: TerminalSession = {
      client_id,
      session_id: null,
      title: defaultTitle(sessionsRef.current.length + 1),
      cwd: cwd ?? null,
      shell: null,
      exited: false,
      exit_code: null,
      restored: false,
    };
    setSessions((prev) => [...prev, optimistic]);
    setSplitSessionId(client_id);
    try {
      const res = await ipcBridge.terminal.spawn.invoke({ cwd });
      if (!res?.success || !res.data) {
        markSpawnFailed(setSessions, client_id, res?.msg ?? 'Failed to spawn shell');
        setSplitSessionId(null);
        return;
      }
      const { session_id, shell, cwd: resolvedCwd } = res.data;
      setSessions((prev) =>
        prev.map((s) => (s.client_id === client_id ? { ...s, session_id, shell, cwd: resolvedCwd } : s))
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      markSpawnFailed(setSessions, client_id, message);
      setSplitSessionId(null);
    }
  }, [activeId]);

  const closeSplit = useCallback(async () => {
    const id = splitSessionId;
    if (!id) return;
    setSplitSessionId(null);
    const target = sessionsRef.current.find((s) => s.client_id === id);
    if (target?.session_id && !target.exited) {
      try {
        await ipcBridge.terminal.kill.invoke({ session_id: target.session_id });
      } catch (error) {
        console.error('[TerminalPanel] kill (split) failed:', error);
      }
    }
    setSessions((prev) => prev.filter((s) => s.client_id !== id));
  }, [splitSessionId]);

  return {
    sessions,
    activeId,
    setActive,
    openSession,
    closeSession,
    renameSession,
    cycleSession,
    splitSessionId,
    splitActive,
    closeSplit,
  };
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

/**
 * Diff existing renderer-side sessions against the main process's live list
 * and append any survivors we don't already know about. Existing sessions
 * are left untouched (so a tab the user has open in the current renderer
 * wins over a same-id restore from main).
 */
function mergeLiveSessions(prev: TerminalSession[], live: readonly TerminalSessionInfo[]): TerminalSession[] {
  if (live.length === 0) return prev;
  const knownSessionIds = new Set(prev.map((s) => s.session_id).filter((id): id is string => id !== null));
  const additions: TerminalSession[] = [];
  for (const info of live) {
    if (knownSessionIds.has(info.session_id)) continue;
    additions.push({
      client_id: clientId(),
      session_id: info.session_id,
      title: titleFromShell(info.shell),
      cwd: info.cwd,
      shell: info.shell,
      exited: false,
      exit_code: null,
      restored: true,
    });
  }
  if (additions.length === 0) return prev;
  return [...prev, ...additions];
}

/** Best-effort tab title from a shell path: keep just the basename. */
function titleFromShell(shell: string): string {
  if (!shell) return 'Terminal';
  const idx = Math.max(shell.lastIndexOf('/'), shell.lastIndexOf('\\'));
  return idx >= 0 ? shell.slice(idx + 1) : shell;
}
