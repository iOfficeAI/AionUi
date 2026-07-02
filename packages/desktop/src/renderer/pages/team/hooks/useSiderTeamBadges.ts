import { ipcBridge } from '@/common';
import type { TTeam } from '@/common/types/team/teamTypes';
import { useEffect, useState } from 'react';
import { removeStack } from '@/renderer/utils/common';

const buildTeamCounts = (teams: TTeam[]): Map<string, number> => {
  const map = new Map<string, number>();
  for (const team of teams) {
    const total = team.assistants.reduce((sum, assistant) => sum + (assistant.pending_confirmations ?? 0), 0);
    map.set(team.id, total);
  }
  return map;
};

/**
 * Returns pending permission confirmation counts per team ID for the sidebar badge.
 *
 * Uses the backend-provided team agent summary as the initial source of truth.
 * Subscribes to live IPC events to stay up to date.
 */
export function useSiderTeamBadges(teams: TTeam[]): Map<string, number> {
  const teamSignature = teams
    .map(
      (t) =>
        `${t.id}:${t.assistants
          .map((assistant) => `${assistant.conversation_id || ''}:${assistant.pending_confirmations ?? 0}`)
          .join(',')}`
    )
    .join('|');
  const [counts, setCounts] = useState<Map<string, number>>(() => buildTeamCounts(teams));

  useEffect(() => {
    setCounts(buildTeamCounts(teams));
    // Include pending count summaries so a refreshed team list replaces stale
    // sidebar state with the backend source of truth.
  }, [teamSignature]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Build conversation_id → team_id lookup
    const cidToTeamId = new Map<string, string>();
    for (const team of teams) {
      for (const assistant of team.assistants) {
        if (assistant.conversation_id) {
          cidToTeamId.set(assistant.conversation_id, team.id);
        }
      }
    }

    if (cidToTeamId.size === 0) return;

    const updateCount = (conversation_id: string, delta: number) => {
      const team_id = cidToTeamId.get(conversation_id);
      if (!team_id) return;
      setCounts((prev) => {
        const next = new Map(prev);
        next.set(team_id, Math.max(0, (next.get(team_id) ?? 0) + delta));
        return next;
      });
    };

    return removeStack(
      ipcBridge.conversation.confirmation.add.on((data) => {
        updateCount(data.conversation_id, +1);
      }),
      ipcBridge.conversation.confirmation.remove.on((data) => {
        updateCount(data.conversation_id, -1);
      })
    );
    // Include assistant conversation_ids in deps so the effect re-runs when assistants
    // spawn and receive their conversation_id (initially undefined until spawn completes).
  }, [teamSignature]); // eslint-disable-line react-hooks/exhaustive-deps

  return counts;
}
