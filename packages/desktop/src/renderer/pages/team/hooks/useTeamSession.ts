// src/renderer/pages/team/hooks/useTeamSession.ts
import { ipcBridge } from '@/common';
import { normalizeTeamStatus } from '@/common/adapter/teamMapper';
import type { TeamAssistantInput } from '@/common/adapter/teamMapper';
import type {
  ITeamAgentRemovedEvent,
  ITeamAgentRenamedEvent,
  ITeamAgentSpawnedEvent,
  ITeamAgentStatusEvent,
  ITeamMcpStatusEvent,
  ITeamSessionChangedEvent,
  ITeamTaskChangedEvent,
  TeammateStatus,
  TTeam,
} from '@/common/types/team/teamTypes';
import { useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { removeTeamAssistantWithCronCleanup } from '../utils/removeTeamAssistantWithCronCleanup';

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
    return new Map(team.assistants.map((a) => [a.slot_id, { slot_id: a.slot_id, status: a.status }]));
  });

  useEffect(() => {
    const unsubStatus = ipcBridge.team.agentStatusChanged.on((event: ITeamAgentStatusEvent) => {
      if (event.team_id !== team.id) return;
      setStatusMap((prev) => {
        const next = new Map(prev);
        next.set(event.slot_id, {
          slot_id: event.slot_id,
          status: normalizeTeamStatus(event.status),
          last_message: event.last_message,
        });
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

    const unsubMcpStatus = ipcBridge.team.mcpStatus.on((event: ITeamMcpStatusEvent) => {
      if (event.team_id !== team.id) return;
    });

    const unsubTaskChanged = ipcBridge.team.taskChanged.on((event: ITeamTaskChangedEvent) => {
      if (event.team_id !== team.id) return;
      void mutateTeam();
    });

    const unsubSessionChanged = ipcBridge.team.sessionChanged.on((event: ITeamSessionChangedEvent) => {
      if (event.team_id !== team.id) return;
      void mutateTeam();
    });

    return () => {
      unsubStatus();
      unsubSpawned();
      unsubRemoved();
      unsubRenamed();
      unsubMcpStatus();
      unsubTaskChanged();
      unsubSessionChanged();
    };
  }, [team.id, mutateTeam]);

  const addAssistant = useCallback(
    async (assistant: TeamAssistantInput) => {
      await ipcBridge.team.addAgent.invoke({ team_id: team.id, assistant });
      await mutateTeam();
    },
    [team.id, mutateTeam]
  );

  const renameAssistant = useCallback(
    async (slot_id: string, new_name: string) => {
      await ipcBridge.team.renameAgent.invoke({ team_id: team.id, slot_id, new_name });
      await mutateTeam();
    },
    [team.id, mutateTeam]
  );

  const removeAssistant = useCallback(
    async (slot_id: string) => {
      await removeTeamAssistantWithCronCleanup({
        team,
        slot_id,
        getConversation: getConversationOrNull,
        removeCronJob: (job_id) => ipcBridge.cron.removeJob.invoke({ job_id }),
        removeAgent: (params) => ipcBridge.team.removeAgent.invoke(params),
      });
      await mutateTeam();
    },
    [team, mutateTeam]
  );

  return { statusMap, addAssistant, renameAssistant, removeAssistant, mutateTeam };
}
