/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import type {
  ITeamMailboxMessage,
  ITeamMailboxChangedEvent,
  ITeamTaskChangedEvent,
  ITeamTaskItem,
} from '@/common/types/team/teamTypes';

const h = vi.hoisted(() => {
  type Handler<T> = (e: T) => void;
  return {
    mailbox: [] as ITeamMailboxMessage[],
    tasks: [] as ITeamTaskItem[],
    mailboxHandlers: [] as Handler<ITeamMailboxChangedEvent>[],
    taskHandlers: [] as Handler<ITeamTaskChangedEvent>[],
    reconnectHandlers: [] as Array<() => void>,
    listMailbox: vi.fn(),
    listTasks: vi.fn(),
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    team: {
      listMailbox: { invoke: h.listMailbox },
      listTasks: { invoke: h.listTasks },
      mailboxChanged: {
        on: (fn: (e: ITeamMailboxChangedEvent) => void) => {
          h.mailboxHandlers.push(fn);
          return () => {};
        },
      },
      taskChanged: {
        on: (fn: (e: ITeamTaskChangedEvent) => void) => {
          h.taskHandlers.push(fn);
          return () => {};
        },
      },
    },
    realtime: {
      reconnected: {
        on: (fn: () => void) => {
          h.reconnectHandlers.push(fn);
          return () => {};
        },
      },
    },
  },
}));

import { useTeamActivityFeed } from '@/renderer/pages/team/activity/useTeamActivityFeed';

const message = (over: Partial<ITeamMailboxMessage> = {}): ITeamMailboxMessage => ({
  id: 'm1',
  team_id: 't1',
  from_agent_id: 'lead',
  to_agent_id: 'a1',
  msg_type: 'message',
  content: 'hi',
  files: [],
  read: false,
  created_at: 1000,
  ...over,
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
);

beforeEach(() => {
  h.mailboxHandlers.length = 0;
  h.taskHandlers.length = 0;
  h.reconnectHandlers.length = 0;
  h.listMailbox.mockImplementation(() => Promise.resolve([message()]));
  h.listTasks.mockImplementation(() => Promise.resolve([]));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useTeamActivityFeed', () => {
  it('loads the initial snapshot', async () => {
    const { result } = renderHook(() => useTeamActivityFeed('t1', true), { wrapper });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(result.current.messages[0].id).toBe('m1');
  });

  it('does not fetch when inactive', async () => {
    renderHook(() => useTeamActivityFeed('t1', false), { wrapper });
    await Promise.resolve();
    expect(h.listMailbox).not.toHaveBeenCalled();
  });

  it('idempotently upserts a mailboxChanged read event (flips the badge)', async () => {
    const { result } = renderHook(() => useTeamActivityFeed('t1', true), { wrapper });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(result.current.messages[0].read).toBe(false);

    act(() => {
      h.mailboxHandlers.forEach((fn) => fn({ team_id: 't1', change: 'read', message: message({ read: true }) }));
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].read).toBe(true);
  });

  it('ignores events for other teams', async () => {
    const { result } = renderHook(() => useTeamActivityFeed('t1', true), { wrapper });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    act(() => {
      h.mailboxHandlers.forEach((fn) => fn({ team_id: 'other', change: 'created', message: message({ id: 'zzz' }) }));
    });
    expect(result.current.messages.map((m) => m.id)).toEqual(['m1']);
  });

  it('upserts a taskChanged event with a full payload', async () => {
    const { result } = renderHook(() => useTeamActivityFeed('t1', true), { wrapper });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    act(() => {
      h.taskHandlers.forEach((fn) =>
        fn({
          team_id: 't1',
          change: 'created',
          task: {
            id: 'tk1',
            team_id: 't1',
            subject: 'Build',
            status: 'pending',
            blocked_by: [],
            blocks: [],
            created_at: 5,
            updated_at: 5,
          },
        })
      );
    });
    expect(result.current.tasks.map((t) => t.id)).toEqual(['tk1']);
  });

  it('refetches on realtime reconnect', async () => {
    const { result } = renderHook(() => useTeamActivityFeed('t1', true), { wrapper });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    h.listMailbox.mockImplementation(() =>
      Promise.resolve([message({ id: 'm1' }), message({ id: 'm2', created_at: 2000 })])
    );
    await act(async () => {
      h.reconnectHandlers.forEach((fn) => fn());
    });
    await waitFor(() => expect(result.current.messages).toHaveLength(2));
  });
});
