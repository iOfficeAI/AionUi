// src/renderer/pages/team/hooks/useTeamSession.ts
import { ipcBridge } from '@/common';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type {
  ITeamAgentRemovedEvent,
  ITeamAgentRenamedEvent,
  ITeamAgentSpawnedEvent,
  ITeamAgentStatusEvent,
  TeamAgent,
  TeammateStatus,
  TTeam,
} from '@/common/types/team/teamTypes';
import { useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';

type AgentStatusInfo = {
  slot_id: string;
  status: TeammateStatus;
  last_message?: string;
};

export function useTeamSession(team: TTeam) {
  const { mutate: mutateTeam } = useSWR(team.id ? `team/${team.id}` : null, () =>
    ipcBridge.team.get.invoke({ id: team.id })
  );

  const [statusMap, setStatusMap] = useState<Map<string, AgentStatusInfo>>(() => {
    return new Map(team.agents.map((a) => [a.slot_id, { slot_id: a.slot_id, status: a.status }]));
  });

  useEffect(() => {
    const unsubStatus = ipcBridge.team.agentStatusChanged.on((event: ITeamAgentStatusEvent) => {
      if (event.team_id !== team.id) return;
      setStatusMap((prev) => {
        const next = new Map(prev);
        next.set(event.slot_id, { slot_id: event.slot_id, status: event.status, last_message: event.last_message });
        return next;
      });
    });

    const unsubSpawned = ipcBridge.team.agentSpawned.on((event: ITeamAgentSpawnedEvent) => {
      if (event.team_id !== team.id) return;
      void mutateTeam();
    });

    const unsubRemoved = ipcBridge.team.agentRemoved.on((event: ITeamAgentRemovedEvent) => {
      if (event.team_id !== team.id) return;
      void mutateTeam();
    });

    const unsubRenamed = ipcBridge.team.agentRenamed.on((event: ITeamAgentRenamedEvent) => {
      if (event.team_id !== team.id) return;
      void mutateTeam();
    });

    return () => {
      unsubStatus();
      unsubSpawned();
      unsubRemoved();
      unsubRenamed();
    };
  }, [team.id, mutateTeam]);

  const addAgent = useCallback(
    async (agent: Omit<TeamAgent, 'slot_id'>) => {
      await ipcBridge.team.addAgent.invoke({ team_id: team.id, agent });
      await mutateTeam();
    },
    [team.id, mutateTeam]
  );

  const renameAgent = useCallback(
    async (slot_id: string, new_name: string) => {
      await ipcBridge.team.renameAgent.invoke({ team_id: team.id, slot_id, new_name });
      await mutateTeam();
    },
    [team.id, mutateTeam]
  );

  const removeAgent = useCallback(
    async (slot_id: string) => {
      try {
        await ipcBridge.team.removeAgent.invoke({ team_id: team.id, slot_id });
      } catch (error) {
        // UI/backend roster 可能失同步（runtime spawn / 缓存陈旧 / 并发操作）。
        // 幂等删除：把 404 当作"已删除"，让下面的 mutateTeam 把 ghost slot 刷掉。
        if (!isBackendHttpError(error) || error.status !== 404) throw error;
        console.warn(`[useTeamSession] agent slot ${slot_id} not in backend roster; treating as already removed`);
      }
      await mutateTeam();
    },
    [team.id, mutateTeam]
  );

  return { statusMap, addAgent, renameAgent, removeAgent, mutateTeam };
}
