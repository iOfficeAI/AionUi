import { ipcBridge } from '@/common';
import type { TTeam } from '@/common/types/teamTypes';
import { useEffect, useState } from 'react';
import { removeStack } from '@/renderer/utils/common';

const STORAGE_KEY_PREFIX = 'team-pending-permissions-';

/**
 * Returns pending permission confirmation counts per team ID for the sidebar badge.
 *
 * Uses the same localStorage keys as useTeamPendingPermissions for consistency.
 * Subscribes to live IPC events to stay up to date.
 */
export function useSiderTeamBadges(teams: TTeam[]): Map<string, number> {
  const readFromStorage = (teamId: string): number => {
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${teamId}`);
      if (!raw) return 0;
      const counts = JSON.parse(raw) as Record<string, number>;
      return Object.values(counts).reduce((sum, n) => sum + n, 0);
    } catch {
      return 0;
    }
  };

  const initCounts = (): Map<string, number> => {
    const map = new Map<string, number>();
    for (const team of teams) {
      map.set(team.id, readFromStorage(team.id));
    }
    return map;
  };

  const [counts, setCounts] = useState<Map<string, number>>(initCounts);

  useEffect(() => {
    // Build conversationId → teamId lookup
    const cidToTeamId = new Map<string, string>();
    for (const team of teams) {
      for (const agent of team.agents) {
        if (agent.conversationId) {
          cidToTeamId.set(agent.conversationId, team.id);
        }
      }
    }

    if (cidToTeamId.size === 0) return;

    const updateCount = (conversationId: string, delta: number) => {
      const teamId = cidToTeamId.get(conversationId);
      if (!teamId) return;
      setCounts((prev) => {
        const next = new Map(prev);
        next.set(teamId, Math.max(0, (next.get(teamId) ?? 0) + delta));
        return next;
      });
    };

    // Refresh from backend to ensure accurate counts after mount.
    // If a query fails (e.g. session not running), fall back to the localStorage value
    // so we don't overwrite a previously-known nonzero count with 0.
    const fetchCurrent = async () => {
      const teamCounts = new Map<string, number>();
      const teamFailed = new Set<string>();
      for (const [, teamId] of cidToTeamId) {
        if (!teamCounts.has(teamId)) teamCounts.set(teamId, 0);
      }
      await Promise.allSettled(
        Array.from(cidToTeamId.entries()).map(async ([cid, teamId]) => {
          try {
            const data = await ipcBridge.conversation.confirmation.list.invoke({ conversation_id: cid });
            teamCounts.set(teamId, (teamCounts.get(teamId) ?? 0) + data.length);
          } catch {
            teamFailed.add(teamId);
          }
        })
      );
      // For teams where ALL cid queries failed, keep the localStorage fallback
      setCounts((prev) => {
        const next = new Map<string, number>();
        for (const [teamId, fetched] of teamCounts) {
          if (fetched === 0 && teamFailed.has(teamId)) {
            // All queries for this team failed — keep previous (localStorage-seeded) value
            next.set(teamId, prev.get(teamId) ?? readFromStorage(teamId));
          } else {
            next.set(teamId, fetched);
          }
        }
        return next;
      });
    };

    void fetchCurrent();

    return removeStack(
      ipcBridge.conversation.confirmation.add.on((data) => {
        updateCount(data.conversation_id, +1);
      }),
      ipcBridge.conversation.confirmation.remove.on((data) => {
        updateCount(data.conversation_id, -1);
      })
    );
    // Include agent conversationIds in deps so the effect re-runs when agents spawn
    // and receive their conversationId (initially undefined until spawn completes).
  }, [teams.map((t) => `${t.id}:${t.agents.map((a) => a.conversationId || '').join(',')}`).join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  return counts;
}
