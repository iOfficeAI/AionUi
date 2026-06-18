import { ipcBridge } from '@/common';
import type {
  ITeamChildTurnEvent,
  ITeamRunAck,
  ITeamRunEvent,
  ITeamSlotWork,
  TeamRunStatus,
} from '@/common/types/team/teamTypes';
import { useCallback, useEffect, useMemo, useState } from 'react';

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
    active_child_count: event.active_child_count,
    pending_wake_count: event.pending_wake_count,
    starting_child_count: event.starting_child_count,
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

const ackToRunEvent = (ack: ITeamRunAck): ITeamRunEvent => ({
  team_id: ack.team_id,
  team_run_id: ack.team_run_id,
  target_slot_id: ack.target_slot_id,
  target_role: ack.target_role,
  status: ack.status,
  active_child_count: 0,
  pending_wake_count: 0,
  starting_child_count: 0,
  slot_work: [
    {
      slot_id: ack.accepted_slot_id || ack.target_slot_id,
      role: ack.accepted_role || ack.target_role,
      pending_wake_count: 1,
      starting_child_count: 0,
    },
  ],
});

const indexSlotWork = (slotWork: ITeamSlotWork[] | undefined): Record<string, ITeamSlotWork | undefined> => {
  const indexed: Record<string, ITeamSlotWork | undefined> = {};
  for (const work of slotWork ?? []) {
    indexed[work.slot_id] = work;
  }
  return indexed;
};

export const useTeamRunView = (team_id: string) => {
  const [state, setState] = useState<TeamRunViewState>(emptyState);

  useEffect(() => {
    setState(emptyState);
  }, [team_id]);

  const applyRunEvent = useCallback(
    (event: ITeamRunEvent, source = 'websocket') => {
      if (event.team_id !== team_id) return;
      debugTeamRunEvent(source, event);
      setState((prev) => {
        if (TERMINAL_RUN_STATUSES.has(event.status)) {
          return emptyState;
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
      const event = ackToRunEvent(ack);
      applyRunEvent(event, 'ack');
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
        slotWorkBySlot: {
          ...prev.slotWorkBySlot,
          [event.slot_id]: {
            ...prev.slotWorkBySlot[event.slot_id],
            slot_id: event.slot_id,
            role: event.role,
            pending_wake_count: prev.slotWorkBySlot[event.slot_id]?.pending_wake_count ?? 0,
            starting_child_count: 0,
            active_turn_id: event.turn_id,
          },
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
        const nextSlotWork = { ...prev.slotWorkBySlot };
        if (nextSlotWork[event.slot_id]) {
          nextSlotWork[event.slot_id] = {
            ...nextSlotWork[event.slot_id],
            active_turn_id: undefined,
            active_turn_started_at_ms: undefined,
            active_turn_elapsed_ms: undefined,
            active_turn_slow: undefined,
            active_turn_slow_threshold_ms: undefined,
          };
          const hasRemainingWork =
            (nextSlotWork[event.slot_id]?.pending_wake_count ?? 0) > 0 ||
            (nextSlotWork[event.slot_id]?.starting_child_count ?? 0) > 0 ||
            Boolean(nextSlotWork[event.slot_id]?.paused) ||
            (nextSlotWork[event.slot_id]?.suppressed_wake_count ?? 0) > 0;
          if (!hasRemainingWork) {
            delete nextSlotWork[event.slot_id];
          }
        }
        return {
          ...prev,
          childTurnsBySlot: nextChildTurns,
          slotWorkBySlot: nextSlotWork,
        };
      });
    },
    [team_id]
  );

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
    ];
    return () => {
      unsubs.forEach((unsubscribe) => unsubscribe());
    };
  }, [applyChildStarted, applyChildTerminal, applyRunEvent]);

  return useMemo(
    () => ({
      state,
      applyAck,
    }),
    [applyAck, state]
  );
};
