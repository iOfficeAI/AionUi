/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ipcBridge } from '@/common';
import type {
  ITeamAgentRuntimeStatusEvent,
  ITeamSessionStatusChangedEvent,
  TeamAgentRuntimeStatus,
} from '@/common/types/team/teamTypes';

/**
 * Team-level readiness gate.
 *
 * Bootstrap is atomic, while an already-published session reconciles dynamic
 * members in place. In both cases the team status stream is authoritative for
 * ready/failed transitions; the ensure promise is the fallback when an event
 * was missed. Member runtime events provide per-slot diagnostic detail only.
 */
export type TeamWarmupPhase = 'warming' | 'ready' | 'error';

/** Runtime state and optional failure reason for one member. */
export type TeamWarmupMemberState = {
  status: TeamAgentRuntimeStatus;
  error?: string;
};

export type TeamWarmupState = {
  phase: TeamWarmupPhase;
  /** Runtime state by slot id. A missing entry means warmup has not started for that member. */
  runtimeStatus: Map<string, TeamWarmupMemberState>;
  retry: () => void;
};

const TEAM_WARMUP_TIMEOUT_MS = 60_000;

export function useTeamWarmup(team_id: string): TeamWarmupState {
  const [phase, setPhase] = useState<TeamWarmupPhase>(team_id ? 'warming' : 'ready');
  const [runtimeStatus, setRuntimeStatus] = useState<Map<string, TeamWarmupMemberState>>(() => new Map());
  const [ensureAttempt, setEnsureAttempt] = useState(0);
  const sessionTerminalRef = useRef<'ready' | 'failed' | null>(null);

  useEffect(() => {
    if (!team_id) {
      setPhase('ready');
      setRuntimeStatus(new Map());
      return;
    }

    let cancelled = false;
    sessionTerminalRef.current = null;
    setPhase('warming');
    setRuntimeStatus(new Map<string, TeamWarmupMemberState>());

    const unsubRuntime = ipcBridge.team.agentRuntimeStatusChanged.on((event: ITeamAgentRuntimeStatusEvent) => {
      if (event.team_id !== team_id || cancelled) return;
      setRuntimeStatus((prev) => {
        const next = new Map(prev);
        next.set(event.slot_id, { status: event.status, error: event.error });
        return next;
      });
    });

    const unsubSessionStatus = ipcBridge.team.sessionStatusChanged.on((event: ITeamSessionStatusChangedEvent) => {
      if (event.team_id !== team_id || cancelled) return;
      if (event.status === 'starting') {
        sessionTerminalRef.current = null;
        setPhase('warming');
      } else if (event.status === 'ready') {
        sessionTerminalRef.current = 'ready';
        setPhase('ready');
      } else if (event.status === 'failed') {
        sessionTerminalRef.current = 'failed';
        setPhase('error');
      }
    });

    return () => {
      cancelled = true;
      unsubRuntime();
      unsubSessionStatus();
    };
  }, [team_id]);

  useEffect(() => {
    if (!team_id) return;

    let cancelled = false;
    let settled = false;
    sessionTerminalRef.current = null;
    setPhase('warming');
    const timeout = setTimeout(() => {
      if (cancelled || settled || sessionTerminalRef.current) return;
      settled = true;
      setRuntimeStatus((prev) => {
        const next = new Map(prev);
        next.forEach((state, slot_id) => {
          if (state.status === 'pending') next.set(slot_id, { ...state, status: 'failed' });
        });
        return next;
      });
      setPhase('error');
    }, TEAM_WARMUP_TIMEOUT_MS);
    const ensure = ipcBridge.team.ensureSession.invoke({ team_id });
    ensure
      .then(() => {
        if (!cancelled && !settled && sessionTerminalRef.current !== 'failed') {
          settled = true;
          clearTimeout(timeout);
          setPhase('ready');
        }
      })
      .catch(() => {
        if (!cancelled && !settled && sessionTerminalRef.current !== 'ready') {
          settled = true;
          clearTimeout(timeout);
          setPhase('error');
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [team_id, ensureAttempt]);

  const retry = useCallback(() => {
    if (!team_id) return;
    setPhase('warming');
    setEnsureAttempt((attempt) => attempt + 1);
  }, [team_id]);

  return { phase, runtimeStatus, retry };
}
