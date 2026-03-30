// src/renderer/pages/team/hooks/useTeamList.ts
import { ipcBridge } from '@/common';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import type { TTeam } from '@process/team/types';
import { useCallback } from 'react';
import useSWR from 'swr';

export function useTeamList() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const { data: teams = [], mutate } = useSWR<TTeam[]>(
    userId ? `teams/${userId}` : null,
    () => ipcBridge.team.list.invoke({ userId: userId! }),
    { revalidateOnFocus: false }
  );

  const removeTeam = useCallback(
    async (id: string) => {
      await ipcBridge.team.remove.invoke({ id });
      await mutate();
    },
    [mutate]
  );

  return { teams, mutate, removeTeam };
}
