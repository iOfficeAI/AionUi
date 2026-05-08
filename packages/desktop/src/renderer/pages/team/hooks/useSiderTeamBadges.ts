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
  const readFromStorage = (team_id: string): number => {
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${team_id}`);
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
    // Build conversation_id → team_id lookup
    const cidToTeamId = new Map<string, string>();
    for (const team of teams) {
      for (const agent of team.agents) {
        if (agent.conversation_id) {
          cidToTeamId.set(agent.conversation_id, team.id);
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

    // Refresh from backend to ensure accurate counts after mount.
    // If a query fails (e.g. session not running), fall back to the localStorage value
    // so we don't overwrite a previously-known nonzero count with 0.
    const fetchCurrent = async () => {
      const teamCounts = new Map<string, number>();
      const teamFailed = new Set<string>();
      for (const [, team_id] of cidToTeamId) {
        if (!teamCounts.has(team_id)) teamCounts.set(team_id, 0);
      }
      await Promise.allSettled(
        Array.from(cidToTeamId.entries()).map(async ([cid, team_id]) => {
          try {
            const data = await ipcBridge.conversation.confirmation.list.invoke({ conversation_id: cid });
            teamCounts.set(team_id, (teamCounts.get(team_id) ?? 0) + data.length);
          } catch {
            teamFailed.add(team_id);
          }
        })
      );
      // For teams where ALL cid queries failed, keep the localStorage fallback
      setCounts((prev) => {
        const next = new Map<string, number>();
        for (const [team_id, fetched] of teamCounts) {
          if (fetched === 0 && teamFailed.has(team_id)) {
            // All queries for this team failed — keep previous (localStorage-seeded) value
            next.set(team_id, prev.get(team_id) ?? readFromStorage(team_id));
          } else {
            next.set(team_id, fetched);
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
    // Include agent conversation_ids in deps so the effect re-runs when agents spawn
    // and receive their conversation_id (initially undefined until spawn completes).
  }, [teams.map((t) => `${t.id}:${t.agents.map((a) => a.conversation_id || '').join(',')}`).join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  return counts;
}
