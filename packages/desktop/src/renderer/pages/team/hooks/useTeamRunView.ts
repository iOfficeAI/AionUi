import { ipcBridge } from '@/common';
import { normalizeTeamStatus } from '@/common/adapter/teamMapper';
import type {
  ITeamChildTurnEvent,
  ITeamRunAck,
  ITeamRunEvent,
  ITeamRunStateResponse,
  ITeamSlotWork,
  ITeamSlotWorkChangedEvent,
  TeamRunStatus,
} from '@/common/types/team/teamTypes';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type TeamRunViewRun = ITeamRunEvent;
export type TeamRunViewChildTurn = ITeamChildTurnEvent;
export type TeamRunReconcileResult = 'applied' | 'superseded' | 'failed';

const TERMINAL_RUN_STATUSES = new Set<TeamRunStatus>(['completed', 'cancelled', 'failed']);
const TERMINAL_AGENT_STATUSES = new Set(['idle', 'completed', 'failed', 'dormant']);
const ORPHAN_RECONCILE_DELAY_MS = 500;
const AGENT_STATUS_RECONCILE_DELAY_MS = 250;

export type TeamRunViewState = {
  activeRun?: TeamRunViewRun;
  childTurnsBySlot: Record<string, TeamRunViewChildTurn | undefined>;
  slotWorkBySlot: Record<string, ITeamSlotWork | undefined>;
  /**
   * True when the team session was reclaimed by idle-cleanup (backend broadcast
   * `sessionStatusChanged` with status `stopped`). Event-driven and independent
   * of `slotWorkBySlot`, which is re-derived/emptied on reconcile and would
   * otherwise lose the stopped signal. Cleared on recovery (`starting`/`ready`)
   * or on any applied active run event (self-heal).
   */
  sessionStopped: boolean;
};

const emptyState: TeamRunViewState = {
  activeRun: undefined,
  childTurnsBySlot: {},
  slotWorkBySlot: {},
  sessionStopped: false,
};

const isTeamRunDebugEnabled = process.env.NODE_ENV !== 'production';

const debugTeamRunEvent = (source: string, event: ITeamRunEvent) => {
  if (!isTeamRunDebugEnabled) return;
  console.debug('[Renderer:teamRunView] team_run_event_applied', {
    source,
    team_id: event.team_id,
    team_run_id: event.team_run_id,
    target_slot_id: event.target_slot_id,
    target_role: event.target_role,
    status: event.status,
    queued_intent_count: event.queued_intent_count,
    starting_batch_count: event.starting_batch_count,
    running_batch_count: event.running_batch_count,
    active_enqueue_lease_count: event.active_enqueue_lease_count,
  });
};

const debugTeamChildTurnEvent = (source: string, event: ITeamChildTurnEvent) => {
  if (!isTeamRunDebugEnabled) return;
  console.debug('[Renderer:teamRunView] team_child_turn_event_applied', {
    source,
    team_id: event.team_id,
    team_run_id: event.team_run_id,
    slot_id: event.slot_id,
    role: event.role,
    conversation_id: event.conversation_id,
    turn_id: event.turn_id,
    status: event.status,
  });
};

const indexSlotWork = (slotWork?: ITeamSlotWork[] | null): Record<string, ITeamSlotWork | undefined> => {
  const indexed: Record<string, ITeamSlotWork | undefined> = {};
  for (const work of slotWork ?? []) {
    indexed[work.slot_id] = work;
  }
  return indexed;
};

const mergeSlotWork = (
  current: Record<string, ITeamSlotWork | undefined>,
  incoming?: ITeamSlotWork[] | null
): Record<string, ITeamSlotWork | undefined> => ({
  ...current,
  ...indexSlotWork(incoming),
});

const hasOrphanedProcessingWork = (state: TeamRunViewState): boolean => {
  if (state.activeRun || state.sessionStopped) return false;
  return Object.values(state.slotWorkBySlot).some(
    (work) =>
      work &&
      work.state !== 'paused' &&
      (work.state === 'queued' ||
        work.state === 'starting' ||
        work.state === 'running' ||
        work.queued_foreground_count > 0 ||
        work.queued_background_count > 0)
  );
};

export const useTeamRunView = (team_id: string) => {
  const [state, setState] = useState<TeamRunViewState>(emptyState);
  const reconcileSeq = useRef(0);
  const liveEventVersion = useRef(0);

  useEffect(() => {
    reconcileSeq.current += 1;
    liveEventVersion.current += 1;
    setState(emptyState);
  }, [team_id]);

  const reconcile = useCallback(
    async (source = 'manual'): Promise<TeamRunReconcileResult> => {
      const requestSnapshot = async (attempt: 0 | 1): Promise<TeamRunReconcileResult> => {
        const seq = ++reconcileSeq.current;
        const requestedAtLiveEventVersion = liveEventVersion.current;
        let snapshot: ITeamRunStateResponse;
        try {
          snapshot = await ipcBridge.team.getRunState.invoke({ team_id });
        } catch (error) {
          console.warn('[Renderer:teamRunView] run_state_reconcile_failed', { source, team_id, error });
          return 'failed';
        }

        if (seq !== reconcileSeq.current || requestedAtLiveEventVersion !== liveEventVersion.current) {
          return attempt === 0 ? requestSnapshot(1) : 'superseded';
        }

        const activeRun = snapshot.active_run ?? undefined;
        if (activeRun) debugTeamRunEvent(`reconcile:${source}`, activeRun);
        setState({
          activeRun,
          childTurnsBySlot: {},
          slotWorkBySlot: indexSlotWork(snapshot.slot_work),
          sessionStopped: false,
        });
        return 'applied';
      };
      return requestSnapshot(0);
    },
    [team_id]
  );

  const applyRunEvent = useCallback(
    (event: ITeamRunEvent, source = 'websocket') => {
      if (event.team_id !== team_id) return;
      liveEventVersion.current += 1;
      debugTeamRunEvent(source, event);
      setState((prev) => {
        if (TERMINAL_RUN_STATUSES.has(event.status)) {
          return {
            activeRun: undefined,
            childTurnsBySlot: prev.childTurnsBySlot,
            slotWorkBySlot: mergeSlotWork(prev.slotWorkBySlot, event.slot_work),
            sessionStopped: false,
          };
        }
        return {
          activeRun: event,
          childTurnsBySlot: prev.childTurnsBySlot,
          slotWorkBySlot: mergeSlotWork(prev.slotWorkBySlot, event.slot_work),
          sessionStopped: false,
        };
      });
      if (TERMINAL_RUN_STATUSES.has(event.status)) {
        void reconcile(`terminal-run:${event.status}`);
      }
    },
    [reconcile, team_id]
  );

  const applyAck = useCallback(
    (ack: ITeamRunAck) => {
      applyRunEvent(ack.run, 'ack');
    },
    [applyRunEvent]
  );

  const applyChildStarted = useCallback(
    (event: ITeamChildTurnEvent) => {
      if (event.team_id !== team_id) return;
      debugTeamChildTurnEvent('websocket', event);
      setState((prev) => ({
        ...prev,
        childTurnsBySlot: {
          ...prev.childTurnsBySlot,
          [event.slot_id]: event,
        },
      }));
    },
    [team_id]
  );

  const applyChildTerminal = useCallback(
    (event: ITeamChildTurnEvent) => {
      if (event.team_id !== team_id) return;
      debugTeamChildTurnEvent('websocket', event);
      setState((prev) => {
        const nextChildTurns = { ...prev.childTurnsBySlot };
        delete nextChildTurns[event.slot_id];
        return {
          ...prev,
          childTurnsBySlot: nextChildTurns,
        };
      });
    },
    [team_id]
  );

  // Per-slot work update, independent of any team run. Run events only carry
  // slot_work for slots bound to the active tracked run, so run-less work (e.g.
  // a leader self-wake draining its mailbox) reaches us only here. Merge the one
  // slot so an orphaned "running" snapshot from a completed run's terminal event
  // clears without a full reconcile.
  const applySlotWork = useCallback(
    (event: ITeamSlotWorkChangedEvent) => {
      if (event.team_id !== team_id) return;
      liveEventVersion.current += 1;
      setState((prev) => ({
        ...prev,
        slotWorkBySlot: {
          ...prev.slotWorkBySlot,
          [event.slot_work.slot_id]: event.slot_work,
        },
      }));
    },
    [team_id]
  );

  const applyLocalPause = useCallback((slot_id: string) => {
    liveEventVersion.current += 1;
    setState((prev) => {
      const work = prev.slotWorkBySlot[slot_id];
      if (!work) return prev;
      return {
        ...prev,
        slotWorkBySlot: {
          ...prev.slotWorkBySlot,
          [slot_id]: {
            ...work,
            state: 'paused',
            active_turn_id: null,
            active_turn_started_at_ms: null,
            active_turn_elapsed_ms: null,
            active_turn_slow: null,
            active_turn_slow_threshold_ms: null,
          },
        },
      };
    });
  }, []);

  useEffect(() => {
    void reconcile('load');
  }, [reconcile]);

  // A terminal run can legitimately carry one last running slot snapshot while
  // run-less trailing work finishes. If its final slot event is missed, poll the
  // authoritative snapshot at a bounded interval until the orphaned busy shape
  // clears. One timer per render avoids overlapping requests.
  useEffect(() => {
    if (!hasOrphanedProcessingWork(state)) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const reconcileOrphan = async () => {
      const reconciled = await reconcile('orphaned-slot-work');
      if (!cancelled && reconciled !== 'applied') {
        retryTimer = setTimeout(() => void reconcileOrphan(), ORPHAN_RECONCILE_DELAY_MS);
      }
    };
    retryTimer = setTimeout(() => void reconcileOrphan(), ORPHAN_RECONCILE_DELAY_MS);
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [reconcile, state]);

  useEffect(() => {
    let agentStatusReconcileTimer: ReturnType<typeof setTimeout> | undefined;
    const unsubs = [
      ipcBridge.team.runAccepted.on(applyRunEvent),
      ipcBridge.team.runStarted.on(applyRunEvent),
      ipcBridge.team.runUpdated.on(applyRunEvent),
      ipcBridge.team.runCompleted.on(applyRunEvent),
      ipcBridge.team.runCancelled.on(applyRunEvent),
      ipcBridge.team.runFailed.on(applyRunEvent),
      ipcBridge.team.childTurnStarted.on(applyChildStarted),
      ipcBridge.team.childTurnCompleted.on(applyChildTerminal),
      ipcBridge.team.childTurnCancelled.on(applyChildTerminal),
      ipcBridge.team.slotWorkChanged.on(applySlotWork),
      ipcBridge.team.agentStatusChanged.on((event) => {
        if (event.team_id !== team_id) return;
        const status = normalizeTeamStatus(event.status);
        if (!TERMINAL_AGENT_STATUSES.has(status)) return;
        if (agentStatusReconcileTimer) clearTimeout(agentStatusReconcileTimer);
        agentStatusReconcileTimer = setTimeout(() => {
          agentStatusReconcileTimer = undefined;
          void reconcile(`team.agentStatusChanged:${status}`);
        }, AGENT_STATUS_RECONCILE_DELAY_MS);
      }),
      ipcBridge.realtime.reconnected.on(() => {
        void reconcile('realtime.reconnected');
      }),
      ipcBridge.team.listChanged.on((event) => {
        if (event.team_id === team_id) void reconcile('team.listChanged');
      }),
      ipcBridge.team.sessionChanged.on((event) => {
        if (event.team_id === team_id) void reconcile('team.sessionChanged');
      }),
      ipcBridge.team.agentSpawned.on((event) => {
        if (event.team_id === team_id) void reconcile('team.agentSpawned');
      }),
      ipcBridge.team.agentRemoved.on((event) => {
        if (event.team_id === team_id) void reconcile('team.agentRemoved');
      }),
      ipcBridge.team.agentRenamed.on((event) => {
        if (event.team_id === team_id) void reconcile('team.agentRenamed');
      }),
      ipcBridge.team.sessionStatusChanged.on((event) => {
        if (event.team_id !== team_id) return;
        if (event.status === 'stopped') {
          setState((prev) => ({ ...prev, sessionStopped: true }));
        } else if (event.status === 'starting' || event.status === 'ready') {
          setState((prev) => ({ ...prev, sessionStopped: false }));
        }
        // 'failed' leaves sessionStopped unchanged.
      }),
    ];
    return () => {
      if (agentStatusReconcileTimer) clearTimeout(agentStatusReconcileTimer);
      unsubs.forEach((unsubscribe) => unsubscribe());
    };
  }, [applyChildStarted, applyChildTerminal, applySlotWork, applyRunEvent, reconcile, team_id]);

  return useMemo(
    () => ({
      state,
      applyAck,
      applyLocalPause,
      reconcile,
    }),
    [applyAck, applyLocalPause, reconcile, state]
  );
};
