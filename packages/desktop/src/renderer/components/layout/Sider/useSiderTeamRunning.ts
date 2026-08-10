import { ipcBridge } from '@/common';
import type { ITeamRunEvent, TeamRunStatus, TTeam } from '@/common/types/team/teamTypes';
import { removeStack } from '@/renderer/utils/common';
import { useCallback, useEffect, useRef, useState } from 'react';

const ACTIVE_RUN_STATUSES = new Set<TeamRunStatus>(['accepted', 'running', 'cancelling']);
const TERMINAL_RUN_STATUSES = new Set<TeamRunStatus>(['completed', 'cancelled', 'failed']);

type ActiveRunIdsByTeam = Map<string, Set<string>>;

const addActiveRun = (runsByTeam: ActiveRunIdsByTeam, event: ITeamRunEvent): ActiveRunIdsByTeam => {
  const teamRuns = runsByTeam.get(event.team_id);
  if (teamRuns?.has(event.team_run_id)) return runsByTeam;

  const next = new Map(runsByTeam);
  next.set(event.team_id, new Set(teamRuns).add(event.team_run_id));
  return next;
};

const removeActiveRun = (runsByTeam: ActiveRunIdsByTeam, event: ITeamRunEvent): ActiveRunIdsByTeam => {
  const teamRuns = runsByTeam.get(event.team_id);
  if (!teamRuns?.has(event.team_run_id)) return runsByTeam;

  const next = new Map(runsByTeam);
  const remainingRuns = new Set(teamRuns);
  remainingRuns.delete(event.team_run_id);
  if (remainingRuns.size > 0) {
    next.set(event.team_id, remainingRuns);
  } else {
    next.delete(event.team_id);
  }
  return next;
};

const replaceActiveRun = (
  runsByTeam: ActiveRunIdsByTeam,
  team_id: string,
  activeRun: ITeamRunEvent | null
): ActiveRunIdsByTeam => {
  const activeRunId = activeRun && ACTIVE_RUN_STATUSES.has(activeRun.status) ? activeRun.team_run_id : null;
  const currentRuns = runsByTeam.get(team_id);

  if (!activeRunId) {
    if (!currentRuns) return runsByTeam;
    const next = new Map(runsByTeam);
    next.delete(team_id);
    return next;
  }

  if (currentRuns?.size === 1 && currentRuns.has(activeRunId)) return runsByTeam;
  const next = new Map(runsByTeam);
  next.set(team_id, new Set([activeRunId]));
  return next;
};

/**
 * Tracks whether each sidebar team has active work.
 *
 * Run events provide immediate updates. Authoritative snapshots on team-list
 * load and WebSocket reconnect recover state when lifecycle events were missed.
 */
export function useSiderTeamRunning(teams: TTeam[]): (team_id: string) => boolean {
  const teamSignature = teams
    .map((team) => team.id)
    .toSorted()
    .join('|');
  const knownTeamIdsRef = useRef(new Set<string>());
  const mountedRef = useRef(false);
  const eventVersionByTeamRef = useRef(new Map<string, number>());
  const nextRequestSequenceRef = useRef(0);
  const requestSequenceByTeamRef = useRef(new Map<string, number>());
  const [activeRunIdsByTeam, setActiveRunIdsByTeam] = useState<ActiveRunIdsByTeam>(() => new Map());

  knownTeamIdsRef.current = new Set(teams.map((team) => team.id));

  const reconcileTeam = useCallback(async function reconcile(team_id: string): Promise<void> {
    const requestSequence = ++nextRequestSequenceRef.current;
    requestSequenceByTeamRef.current.set(team_id, requestSequence);
    const eventVersion = eventVersionByTeamRef.current.get(team_id) ?? 0;

    try {
      const snapshot = await ipcBridge.team.getRunState.invoke({ team_id });
      if (
        !mountedRef.current ||
        !knownTeamIdsRef.current.has(team_id) ||
        requestSequenceByTeamRef.current.get(team_id) !== requestSequence
      ) {
        return;
      }

      if ((eventVersionByTeamRef.current.get(team_id) ?? 0) !== eventVersion) {
        // A live event made this snapshot stale. Only the latest request reaches
        // this branch, so reconciliation retries serially without duplicate fan-out.
        void reconcile(team_id);
        return;
      }

      setActiveRunIdsByTeam((current) => replaceActiveRun(current, team_id, snapshot.active_run));
    } catch {
      // Keep the event-derived state when the authoritative snapshot is unavailable.
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const applyRunEvent = (event: ITeamRunEvent) => {
      if (!mountedRef.current || !knownTeamIdsRef.current.has(event.team_id)) return;
      eventVersionByTeamRef.current.set(event.team_id, (eventVersionByTeamRef.current.get(event.team_id) ?? 0) + 1);
      if (ACTIVE_RUN_STATUSES.has(event.status)) {
        setActiveRunIdsByTeam((current) => addActiveRun(current, event));
      } else if (TERMINAL_RUN_STATUSES.has(event.status)) {
        setActiveRunIdsByTeam((current) => removeActiveRun(current, event));
      }
    };

    return removeStack(
      ipcBridge.team.runAccepted.on(applyRunEvent),
      ipcBridge.team.runStarted.on(applyRunEvent),
      ipcBridge.team.runUpdated.on(applyRunEvent),
      ipcBridge.team.runCompleted.on(applyRunEvent),
      ipcBridge.team.runCancelled.on(applyRunEvent),
      ipcBridge.team.runFailed.on(applyRunEvent),
      ipcBridge.realtime.reconnected.on(() => {
        for (const team_id of knownTeamIdsRef.current) {
          void reconcileTeam(team_id);
        }
      })
    );
  }, [reconcileTeam]);

  useEffect(() => {
    const knownTeamIds = knownTeamIdsRef.current;
    for (const team_id of eventVersionByTeamRef.current.keys()) {
      if (!knownTeamIds.has(team_id)) eventVersionByTeamRef.current.delete(team_id);
    }
    for (const team_id of requestSequenceByTeamRef.current.keys()) {
      if (!knownTeamIds.has(team_id)) requestSequenceByTeamRef.current.delete(team_id);
    }

    setActiveRunIdsByTeam((current) => {
      const removedTeamIds = Array.from(current.keys()).filter((team_id) => !knownTeamIds.has(team_id));
      if (removedTeamIds.length === 0) return current;
      const next = new Map(current);
      removedTeamIds.forEach((team_id) => next.delete(team_id));
      return next;
    });

    for (const team_id of knownTeamIds) {
      void reconcileTeam(team_id);
    }
  }, [reconcileTeam, teamSignature]);

  return useCallback((team_id: string) => (activeRunIdsByTeam.get(team_id)?.size ?? 0) > 0, [activeRunIdsByTeam]);
}
