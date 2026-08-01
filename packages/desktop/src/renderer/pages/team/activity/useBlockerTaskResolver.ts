/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ipcBridge } from '@/common';
import type { ITeamTaskItem } from '@/common/types/team/teamTypes';

export type BlockerInfo = { subject: string; status: string; owner?: string };

const toInfo = (t: ITeamTaskItem): BlockerInfo => ({ subject: t.subject, status: t.status, owner: t.owner });

/**
 * Resolves a `blocked_by` task id to its subject/status/owner for the board's
 * dependency labels. Seeds from the already-loaded feed tasks (free), then
 * lazily batch-fetches only the referenced ids that are NOT loaded — so it does
 * not eagerly pull all tasks and does not break the feed's pagination. WS
 * `taskChanged` keeps the index fresh; the index is reset when the team changes.
 */
export function useBlockerTaskResolver(
  teamId: string,
  loadedTasks: ITeamTaskItem[]
): (id: string) => BlockerInfo | undefined {
  const [index, setIndex] = useState<Record<string, BlockerInfo>>({});
  const indexRef = useRef(index);
  indexRef.current = index;
  const inFlightRef = useRef<Set<string>>(new Set());

  // Reset when team changes.
  useEffect(() => {
    setIndex({});
    inFlightRef.current = new Set();
  }, [teamId]);

  // Seed from loaded tasks + lazily fetch unresolved referenced blocker ids.
  useEffect(() => {
    const seed: Record<string, BlockerInfo> = {};
    const referenced = new Set<string>();
    for (const t of loadedTasks) {
      seed[t.id] = toInfo(t);
      for (const dep of t.blocked_by) referenced.add(dep);
    }
    // Loaded tasks are the authoritative latest state, so they win over prev.
    if (Object.keys(seed).length) setIndex((prev) => ({ ...prev, ...seed }));

    const missing = [...referenced].filter((id) => !indexRef.current[id] && !seed[id] && !inFlightRef.current.has(id));
    if (missing.length === 0) return;
    missing.forEach((id) => inFlightRef.current.add(id));
    let cancelled = false;
    void (async () => {
      try {
        const rows = await ipcBridge.team.listTasks.invoke({ team_id: teamId, ids: missing });
        if (cancelled) return;
        const fetched: Record<string, BlockerInfo> = {};
        for (const t of rows ?? []) fetched[t.id] = toInfo(t);
        if (Object.keys(fetched).length) setIndex((prev) => ({ ...prev, ...fetched }));
      } finally {
        missing.forEach((id) => inFlightRef.current.delete(id));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId, loadedTasks]);

  // WS freshness: upsert on created/updated, drop on deleted.
  useEffect(() => {
    const unsub = ipcBridge.team.taskChanged.on((event) => {
      if (event.team_id !== teamId || !event.task) return;
      const t = event.task;
      setIndex((prev) => {
        if (t.status === 'deleted') {
          if (!prev[t.id]) return prev;
          const next = { ...prev };
          delete next[t.id];
          return next;
        }
        return { ...prev, [t.id]: toInfo(t) };
      });
    });
    return () => unsub();
  }, [teamId]);

  return useCallback((id: string) => indexRef.current[id], []);
}
