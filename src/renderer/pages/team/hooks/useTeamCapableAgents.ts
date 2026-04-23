/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import useSWR from 'swr';
import { ipcBridge } from '@/common';
import type { TeamAgentEntry } from '@/common/types/teamAgentEntry';

export const TEAM_CAPABLE_AGENTS_SWR_KEY = 'team.capable-agents';

async function fetchTeamCapableAgents(): Promise<TeamAgentEntry[]> {
  try {
    const resp = await ipcBridge.team.listCapableAgents.invoke();
    if (resp?.success && resp.data) return resp.data;
  } catch {
    /* fall through */
  }
  return [];
}

/**
 * Single unified source for team-spawnable agents. Replaces the renderer-side
 * pattern of merging `cliAgents` + `presetAssistants` and re-running
 * `isTeamCapableBackend` filter locally — the process already did the merge
 * and filter when responding to this IPC, so the renderer just consumes
 * the finished list.
 */
export function useTeamCapableAgents() {
  const { data, isLoading, mutate } = useSWR<TeamAgentEntry[]>(TEAM_CAPABLE_AGENTS_SWR_KEY, fetchTeamCapableAgents);
  return {
    entries: data ?? [],
    isLoading,
    refresh: () => mutate(),
  };
}
