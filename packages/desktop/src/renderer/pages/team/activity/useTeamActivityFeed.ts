/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { ipcBridge } from '@/common';
import type { ITeamMailboxMessage, ITeamTaskItem } from '@/common/types/team/teamTypes';

const ACTIVITY_LIMIT = 500;

export type TeamActivityFeed = {
  messages: ITeamMailboxMessage[];
  tasks: ITeamTaskItem[];
  isLoading: boolean;
  error: unknown;
};

const indexById = <T extends { id: string }>(items: ReadonlyArray<T>): Record<string, T> => {
  const map: Record<string, T> = {};
  for (const item of items) map[item.id] = item;
  return map;
};

/**
 * Read-only feed of a team's mailbox + task board for the activity view.
 *
 * - Lazy: only fetches while `active` (SWR key is null otherwise).
 * - Initial full snapshot via REST (latest 500 each), then incremental WS
 *   upserts by id (`team.mailboxChanged` covers created/read, `team.taskChanged`
 *   covers created/updated). Legacy task events without a `task` payload trigger
 *   a lightweight revalidate.
 * - `realtime.reconnected` re-pulls to realign after a disconnect.
 *
 * Upserts are idempotent by id, so WS arrival order does not matter; ordering
 * and lane positioning are derived downstream from the returned maps.
 */
export function useTeamActivityFeed(team_id: string, active: boolean): TeamActivityFeed {
  const [messagesById, setMessagesById] = useState<Record<string, ITeamMailboxMessage>>({});
  const [tasksById, setTasksById] = useState<Record<string, ITeamTaskItem>>({});

  const { data, error, isLoading, mutate } = useSWR(
    active ? ['team-activity', team_id] : null,
    async () => {
      const [messages, tasks] = await Promise.all([
        ipcBridge.team.listMailbox.invoke({ team_id, limit: ACTIVITY_LIMIT }),
        ipcBridge.team.listTasks.invoke({ team_id, limit: ACTIVITY_LIMIT }),
      ]);
      return { messages: messages ?? [], tasks: tasks ?? [] };
    },
    { revalidateOnFocus: false }
  );

  // Reseed local maps whenever a fresh snapshot arrives (initial load or
  // reconnect-triggered revalidate). WS updates between fetches are preserved.
  useEffect(() => {
    if (!data) return;
    setMessagesById(indexById(data.messages));
    setTasksById(indexById(data.tasks));
  }, [data]);

  useEffect(() => {
    if (!active) return;
    const unsubs = [
      ipcBridge.team.mailboxChanged.on((event) => {
        if (event.team_id !== team_id) return;
        const message = event.message;
        setMessagesById((prev) => ({ ...prev, [message.id]: message }));
      }),
      ipcBridge.team.taskChanged.on((event) => {
        if (event.team_id !== team_id) return;
        if (event.task) {
          const task = event.task;
          setTasksById((prev) => ({ ...prev, [task.id]: task }));
        } else {
          // Legacy event shape without a full task payload: realign via refetch.
          void mutate();
        }
      }),
      ipcBridge.realtime.reconnected.on(() => {
        void mutate();
      }),
    ];
    return () => unsubs.forEach((unsubscribe) => unsubscribe());
  }, [active, team_id, mutate]);

  const messages = useMemo(() => Object.values(messagesById), [messagesById]);
  const tasks = useMemo(() => Object.values(tasksById), [tasksById]);

  return { messages, tasks, isLoading: active ? isLoading : false, error };
}
