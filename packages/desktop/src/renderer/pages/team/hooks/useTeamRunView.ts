import { ipcBridge } from '@/common';
import type {
  ITeamChildTurnEvent,
  ITeamRunAck,
  ITeamRunEvent,
  ITeamSlotWork,
  TeamRunStatus,
} from '@/common/types/team/teamTypes';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type TeamRunViewRun = ITeamRunEvent;
export type TeamRunViewChildTurn = ITeamChildTurnEvent;

const TERMINAL_RUN_STATUSES = new Set<TeamRunStatus>(['completed', 'cancelled', 'failed']);

export type TeamRunViewState = {
  activeRun?: TeamRunViewRun;
  childTurnsBySlot: Record<string, TeamRunViewChildTurn | undefined>;
  slotWorkBySlot: Record<string, ITeamSlotWork | undefined>;
};

const emptyState: TeamRunViewState = {
  activeRun: undefined,
  childTurnsBySlot: {},
  slotWorkBySlot: {},
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

const indexSlotWork = (slotWork: ITeamSlotWork[]): Record<string, ITeamSlotWork | undefined> => {
  const indexed: Record<string, ITeamSlotWork | undefined> = {};
  for (const work of slotWork) {
    indexed[work.slot_id] = work;
  }
  return indexed;
};

export const useTeamRunView = (team_id: string) => {
  const [state, setState] = useState<TeamRunViewState>(emptyState);
  const reconcileSeq = useRef(0);

  useEffect(() => {
    reconcileSeq.current += 1;
    setState(emptyState);
  }, [team_id]);

  const applyRunEvent = useCallback(
    (event: ITeamRunEvent, source = 'websocket') => {
      if (event.team_id !== team_id) return;
      debugTeamRunEvent(source, event);
      setState((prev) => {
        if (TERMINAL_RUN_STATUSES.has(event.status)) {
          return {
            activeRun: undefined,
            childTurnsBySlot: prev.childTurnsBySlot,
            slotWorkBySlot: indexSlotWork(event.slot_work),
          };
        }
        return {
          activeRun: event,
          childTurnsBySlot: prev.childTurnsBySlot,
          slotWorkBySlot: indexSlotWork(event.slot_work),
        };
      });
    },
    [team_id]
  );

  const applyAck = useCallback(
    (ack: ITeamRunAck) => {
      applyRunEvent(ack.run, 'ack');
    },
    [applyRunEvent]
  );

  const reconcile = useCallback(
    async (source = 'manual'): Promise<boolean> => {
      const seq = ++reconcileSeq.current;
      try {
        const snapshot = await ipcBridge.team.getRunState.invoke({ team_id });
        setState((prev) => {
          if (seq !== reconcileSeq.current) return prev;
          const activeRun = snapshot.active_run ?? undefined;
          if (activeRun) debugTeamRunEvent(`reconcile:${source}`, activeRun);
          return {
            activeRun,
            childTurnsBySlot: {},
            slotWorkBySlot: indexSlotWork(snapshot.slot_work),
          };
        });
        return true;
      } catch (error) {
        console.warn('[Renderer:teamRunView] run_state_reconcile_failed', { source, team_id, error });
        return false;
      }
    },
    [team_id]
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

  useEffect(() => {
    void reconcile('load');
  }, [reconcile]);

  useEffect(() => {
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
    ];
    return () => {
      unsubs.forEach((unsubscribe) => unsubscribe());
    };
  }, [applyChildStarted, applyChildTerminal, applyRunEvent, reconcile, team_id]);

  return useMemo(
    () => ({
      state,
      applyAck,
      reconcile,
    }),
    [applyAck, reconcile, state]
  );
};
