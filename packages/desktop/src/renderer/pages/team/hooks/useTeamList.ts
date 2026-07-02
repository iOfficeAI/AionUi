// src/renderer/pages/team/hooks/useTeamList.ts
import { ipcBridge } from '@/common';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import type { TTeam } from '@/common/types/team/teamTypes';
import { useCallback, useEffect } from 'react';
import useSWR from 'swr';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { removeTeamWithCronCleanup } from '../utils/removeTeamAssistantWithCronCleanup';

export function useTeamList() {
  const { user } = useAuth();
  const user_id = user?.id ?? 'system_default_user';

  const { data: teams = [], mutate } = useSWR<TTeam[]>(
    `teams/${user_id}`,
    () => ipcBridge.team.list.invoke({ user_id }),
    { revalidateOnFocus: false }
  );

  // Refresh list when backend creates/removes a team (e.g. via MCP)
  useEffect(() => {
    const unsubListChanged = ipcBridge.team.listChanged.on(() => {
      void mutate();
    });
    const unsubCreated = ipcBridge.team.created.on(() => {
      void mutate();
    });
    const unsubRemoved = ipcBridge.team.removed.on(() => {
      void mutate();
    });
    const unsubRenamed = ipcBridge.team.renamed.on(() => {
      void mutate();
    });
    return () => {
      unsubListChanged();
      unsubCreated();
      unsubRemoved();
      unsubRenamed();
    };
  }, [mutate]);

  const removeTeam = useCallback(
    async (id: string) => {
      const team = teams.find((item) => item.id === id);
      if (team) {
        await removeTeamWithCronCleanup({
          team,
          getConversation: getConversationOrNull,
          removeCronJob: (job_id) => ipcBridge.cron.removeJob.invoke({ job_id }),
          removeTeam: (params) => ipcBridge.team.remove.invoke(params),
        });
      } else {
        await ipcBridge.team.remove.invoke({ id });
      }
      localStorage.removeItem(`team-active-slot-${id}`);
      await mutate();
    },
    [teams, mutate]
  );

  return { teams, mutate, removeTeam };
}
