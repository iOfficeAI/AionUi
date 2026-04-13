import { ipcBridge } from '@/common';
import { useCallback, useEffect, useState } from 'react';
import { removeStack } from '@/renderer/utils/common';

const STORAGE_KEY_PREFIX = 'team-pending-permissions-';

/**
 * Track pending permission confirmation counts per conversation (agent slot).
 *
 * - Loads initial counts from localStorage for instant render
 * - Syncs with live IPC events for real-time accuracy
 * - Persists counts back to localStorage after each change
 */
export function useTeamPendingPermissions(teamId: string, conversationIds: string[]) {
  const storageKey = `${STORAGE_KEY_PREFIX}${teamId}`;

  const readFromStorage = (): Record<string, number> => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as Record<string, number>) : {};
    } catch {
      return {};
    }
  };

  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>(() => readFromStorage());

  // Write to localStorage whenever counts change
  useEffect(() => {
    try {
      // Only persist entries for current conversations; prune stale ones
      const pruned: Record<string, number> = {};
      for (const cid of conversationIds) {
        const count = pendingCounts[cid];
        if (count !== undefined && count > 0) {
          pruned[cid] = count;
        }
      }
      localStorage.setItem(storageKey, JSON.stringify(pruned));
    } catch {
      // Storage quota exceeded — silent ignore
    }
  }, [storageKey, pendingCounts, conversationIds]);

  // Initial load from backend + live subscription
  useEffect(() => {
    if (conversationIds.length === 0) return;

    const idSet = new Set(conversationIds);

    // Fetch initial counts from backend
    const fetchInitial = async () => {
      const results = await Promise.allSettled(
        conversationIds.map(async (cid) => {
          try {
            const data = await ipcBridge.conversation.confirmation.list.invoke({ conversation_id: cid });
            return { cid, count: data.length };
          } catch {
            return { cid, count: 0 };
          }
        })
      );
      const counts: Record<string, number> = {};
      for (const r of results) {
        if (r.status === 'fulfilled') {
          counts[r.value.cid] = r.value.count;
        }
      }
      setPendingCounts((prev) => ({ ...prev, ...counts }));
    };

    void fetchInitial();

    // Subscribe to real-time events
    const unsub = removeStack(
      ipcBridge.conversation.confirmation.add.on((data) => {
        if (!idSet.has(data.conversation_id)) return;
        setPendingCounts((prev) => ({
          ...prev,
          [data.conversation_id]: (prev[data.conversation_id] ?? 0) + 1,
        }));
      }),
      ipcBridge.conversation.confirmation.remove.on((data) => {
        if (!idSet.has(data.conversation_id)) return;
        setPendingCounts((prev) => ({
          ...prev,
          [data.conversation_id]: Math.max(0, (prev[data.conversation_id] ?? 0) - 1),
        }));
      })
    );

    return unsub;
  }, [conversationIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Total pending confirmations across all agents in this team */
  const totalPending = conversationIds.reduce((sum, cid) => sum + (pendingCounts[cid] ?? 0), 0);

  /** Clear persisted storage for this team (call when team is deleted) */
  const clearStorage = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  }, [storageKey]);

  return { pendingCounts, totalPending, clearStorage };
}
