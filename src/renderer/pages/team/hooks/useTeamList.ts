// src/renderer/pages/team/hooks/useTeamList.ts
import { ipcBridge } from '@/common';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import type { TTeam } from '@/common/types/teamTypes';
import { useCallback, useEffect } from 'react';
import useSWR from 'swr';

export function useTeamList() {
  const { user } = useAuth();
  const userId = user?.id ?? 'system_default_user';

  const { data: teams = [], mutate } = useSWR<TTeam[]>(
    `teams/${userId}`,
    () => ipcBridge.team.list.invoke({ userId }),
    { revalidateOnFocus: false }
  );

  // Refresh list when backend creates/removes a team (e.g. via MCP)
  useEffect(() => {
    return ipcBridge.team.listChanged.on(() => {
      void mutate();
    });
  }, [mutate]);

  const removeTeam = useCallback(
    async (id: string) => {
      await ipcBridge.team.remove.invoke({ id });
      localStorage.removeItem(`team-active-slot-${id}`);
      await mutate();
    },
    [mutate]
  );

  return { teams, mutate, removeTeam };
}
