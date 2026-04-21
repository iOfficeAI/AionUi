// src/renderer/pages/team/hooks/useTeamSession.ts
import { ipcBridge } from '@/common';
import type {
  ITeamAgentRemovedEvent,
  ITeamAgentRenamedEvent,
  ITeamAgentSpawnedEvent,
  ITeamAgentStatusEvent,
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

export function useTeamSession(team: TTeam) {
  const { mutate: mutateTeam } = useSWR(team.id ? `team/${team.id}` : null, () =>
    ipcBridge.team.get.invoke({ id: team.id })
  );

  const [statusMap, setStatusMap] = useState<Map<string, AgentStatusInfo>>(() => {
    return new Map(team.agents.map((a) => [a.slotId, { slotId: a.slotId, status: a.status }]));
  });

  useEffect(() => {
    void ipcBridge.team.ensureSession.invoke({ teamId: team.id });

    const unsubStatus = ipcBridge.team.agentStatusChanged.on((event: ITeamAgentStatusEvent) => {
      if (event.teamId !== team.id) return;
      setStatusMap((prev) => {
        const next = new Map(prev);
        next.set(event.slotId, { slotId: event.slotId, status: event.status, lastMessage: event.lastMessage });
        return next;
      });
    });

    const unsubSpawned = ipcBridge.team.agentSpawned.on((event: ITeamAgentSpawnedEvent) => {
      if (event.teamId !== team.id) return;
      void mutateTeam();
    });

    const unsubRemoved = ipcBridge.team.agentRemoved.on((event: ITeamAgentRemovedEvent) => {
      if (event.teamId !== team.id) return;
      void mutateTeam();
    });

    const unsubRenamed = ipcBridge.team.agentRenamed.on((event: ITeamAgentRenamedEvent) => {
      if (event.teamId !== team.id) return;
      void mutateTeam();
    });

    return () => {
      unsubStatus();
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
      await ipcBridge.team.removeAgent.invoke({ teamId: team.id, slotId });
      await mutateTeam();
    },
    [team.id, mutateTeam]
  );

  return { statusMap, sendMessage, addAgent, renameAgent, removeAgent, mutateTeam };
}
