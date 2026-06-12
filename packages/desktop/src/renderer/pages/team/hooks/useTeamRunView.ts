import { ipcBridge } from '@/common';
import type { ITeamChildTurnEvent, ITeamRunAck, ITeamRunEvent, TeamRunStatus } from '@/common/types/team/teamTypes';
import { useCallback, useEffect, useMemo, useState } from 'react';

export type TeamRunViewRun = ITeamRunEvent;
export type TeamRunViewChildTurn = ITeamChildTurnEvent;

const TERMINAL_RUN_STATUSES = new Set<TeamRunStatus>(['completed', 'cancelled', 'failed']);

export type TeamRunViewState = {
  activeRun?: TeamRunViewRun;
  childTurnsBySlot: Record<string, TeamRunViewChildTurn | undefined>;
};

const emptyState: TeamRunViewState = {
  activeRun: undefined,
  childTurnsBySlot: {},
};

const ackToRunEvent = (ack: ITeamRunAck): ITeamRunEvent => ({
  team_id: ack.team_id,
  team_run_id: ack.team_run_id,
  target_slot_id: ack.target_slot_id,
  target_role: ack.target_role,
  status: ack.status,
  active_child_count: 0,
  pending_wake_count: 0,
});

export const useTeamRunView = (team_id: string) => {
  const [state, setState] = useState<TeamRunViewState>(emptyState);

  useEffect(() => {
    setState(emptyState);
  }, [team_id]);

  const applyRunEvent = useCallback(
    (event: ITeamRunEvent) => {
      if (event.team_id !== team_id) return;
      setState((prev) => ({
        activeRun: TERMINAL_RUN_STATUSES.has(event.status) ? undefined : event,
        childTurnsBySlot: TERMINAL_RUN_STATUSES.has(event.status) ? {} : prev.childTurnsBySlot,
      }));
    },
    [team_id]
  );

  const applyAck = useCallback(
    (ack: ITeamRunAck) => {
      applyRunEvent(ackToRunEvent(ack));
    },
    [applyRunEvent]
  );

  const applyChildStarted = useCallback(
    (event: ITeamChildTurnEvent) => {
      if (event.team_id !== team_id) return;
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
      setState((prev) => {
        const next = { ...prev.childTurnsBySlot };
        delete next[event.slot_id];
        return {
          ...prev,
          childTurnsBySlot: next,
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
