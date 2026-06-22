/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TTeam } from '@/common/types/team/teamTypes';

type GetTeam = (params: { id: string }) => Promise<TTeam | null>;
type EmitDefer = (payload: { conversation_id: string; team_id: string }) => void;

export const getLeaderConversationIdFromTeam = (team: TTeam | null | undefined): string | null => {
  if (!team) return null;
  const bySlot = team.agents.find((agent) => agent.slot_id === team.leader_agent_id);
  const leader = bySlot ?? team.agents.find((agent) => agent.role === 'leader');
  const conversationId = leader?.conversation_id?.trim();
  return conversationId ? conversationId : null;
};

export const deferLeaderQueueBeforeTeamRedirect = async ({
  team_id,
  getTeam,
  emitDefer,
}: {
  team_id: string;
  getTeam: GetTeam;
  emitDefer: EmitDefer;
}): Promise<boolean> => {
  try {
    const team = await getTeam({ id: team_id });
    const conversation_id = getLeaderConversationIdFromTeam(team);
    if (!conversation_id) return false;
    emitDefer({ conversation_id, team_id });
    return true;
  } catch (error) {
    console.warn('[TeamCreatedRedirect] failed to defer leader command queue before redirect', error);
    return false;
  }
};
