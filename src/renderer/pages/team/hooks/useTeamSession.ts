// src/renderer/pages/team/hooks/useTeamSession.ts
import { ipcBridge } from '@/common';
import type {
  ITeamAgentRemovedEvent,
  ITeamAgentRenamedEvent,
  ITeamAgentSpawnedEvent,
  ITeamAgentStatusEvent,
  ITeamMessageEvent,
  TeamAgent,
  TeammateStatus,
  TTeam,
} from '@/common/types/teamTypes';
import { useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';

type AgentStatusInfo = {
  slotId: string;
  status: TeammateStatus;
  lastMessage?: string;
};

const FAILED_AGENTS_KEY = 'team-failed-agents';

function loadFailedAgents(teamId: string): Set<string> {
  try {
    const stored = JSON.parse(localStorage.getItem(FAILED_AGENTS_KEY) ?? '{}') as Record<string, string[]>;
    return new Set(stored[teamId] ?? []);
  } catch {
    return new Set();
  }
}

function saveFailedAgent(teamId: string, slotId: string): void {
  try {
    const stored = JSON.parse(localStorage.getItem(FAILED_AGENTS_KEY) ?? '{}') as Record<string, string[]>;
    const set = new Set(stored[teamId] ?? []);
    set.add(slotId);
    stored[teamId] = [...set];
    localStorage.setItem(FAILED_AGENTS_KEY, JSON.stringify(stored));
  } catch {
    // ignore
  }
}

function clearFailedAgent(teamId: string, slotId: string): void {
  try {
    const stored = JSON.parse(localStorage.getItem(FAILED_AGENTS_KEY) ?? '{}') as Record<string, string[]>;
    const set = new Set(stored[teamId] ?? []);
    set.delete(slotId);
    if (set.size === 0) {
      delete stored[teamId];
    } else {
      stored[teamId] = [...set];
    }
    localStorage.setItem(FAILED_AGENTS_KEY, JSON.stringify(stored));
  } catch {
    // ignore
  }
}

export function useTeamSession(team: TTeam) {
  const { mutate: mutateTeam } = useSWR(team.id ? `team/${team.id}` : null, () =>
    ipcBridge.team.get.invoke({ id: team.id })
  );

  // Initialize statusMap: restore 'failed' from localStorage for agents still in the team
  const [statusMap, setStatusMap] = useState<Map<string, AgentStatusInfo>>(() => {
    const failedSet = loadFailedAgents(team.id);
    return new Map(
      team.agents.map((a) => [
        a.slotId,
        { slotId: a.slotId, status: failedSet.has(a.slotId) ? ('failed' as TeammateStatus) : a.status },
      ])
    );
  });

  const [messages, setMessages] = useState<Map<string, ITeamMessageEvent[]>>(
    new Map(team.agents.map((a): [string, ITeamMessageEvent[]] => [a.slotId, []]))
  );

  useEffect(() => {
    const unsubStatus = ipcBridge.team.agentStatusChanged.on((event: ITeamAgentStatusEvent) => {
      if (event.teamId !== team.id) return;
      if (event.status === 'failed') {
        saveFailedAgent(team.id, event.slotId);
      }
      setStatusMap((prev) => {
        const next = new Map(prev);
        next.set(event.slotId, { slotId: event.slotId, status: event.status, lastMessage: event.lastMessage });
        return next;
      });
    });

    const MESSAGE_BUFFER_LIMIT = 200;
    const unsubMessages = ipcBridge.team.messageStream.on((event: ITeamMessageEvent) => {
      if (event.teamId !== team.id) return;
      setMessages((prev) => {
        const next = new Map(prev);
        const existing = next.get(event.slotId) ?? [];
        const updated = [...existing, event];
        // Keep only the most recent messages to prevent unbounded growth
        next.set(event.slotId, updated.length > MESSAGE_BUFFER_LIMIT ? updated.slice(-MESSAGE_BUFFER_LIMIT) : updated);
        return next;
      });
    });

    const unsubSpawned = ipcBridge.team.agentSpawned.on((event: ITeamAgentSpawnedEvent) => {
      if (event.teamId !== team.id) return;
      // Refresh team data so the new agent appears in tabs
      void mutateTeam();
    });

    const unsubRemoved = ipcBridge.team.agentRemoved.on((event: ITeamAgentRemovedEvent) => {
      if (event.teamId !== team.id) return;
      // Refresh team data so the removed agent's tab disappears
      void mutateTeam();
    });

    const unsubRenamed = ipcBridge.team.agentRenamed.on((event: ITeamAgentRenamedEvent) => {
      if (event.teamId !== team.id) return;
      // Refresh team data so the renamed agent's tab updates
      void mutateTeam();
    });

    return () => {
      unsubStatus();
      unsubMessages();
      unsubSpawned();
      unsubRemoved();
      unsubRenamed();
    };
  }, [team.id, mutateTeam]);

  const sendMessage = useCallback(
    async (content: string) => {
      await ipcBridge.team.sendMessage.invoke({ teamId: team.id, content });
    },
    [team.id]
  );

  const addAgent = useCallback(
    async (agent: Omit<TeamAgent, 'slotId'>) => {
      await ipcBridge.team.addAgent.invoke({ teamId: team.id, agent });
      // Refresh team data after agent is added so that UI gets the new agent's conversationId
      await mutateTeam();
    },
    [team.id, mutateTeam]
  );

  const renameAgent = useCallback(
    async (slotId: string, newName: string) => {
      await ipcBridge.team.renameAgent.invoke({ teamId: team.id, slotId, newName });
      await mutateTeam();
    },
    [team.id, mutateTeam]
  );

  const removeAgent = useCallback(
    async (slotId: string) => {
      clearFailedAgent(team.id, slotId);
      await ipcBridge.team.removeAgent.invoke({ teamId: team.id, slotId });
      await mutateTeam();
    },
    [team.id, mutateTeam]
  );

  return { statusMap, messages, sendMessage, addAgent, renameAgent, removeAgent, mutateTeam };
}
