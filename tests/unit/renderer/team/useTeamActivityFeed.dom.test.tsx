/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type {
  ITeamActivityItem,
  ITeamActivityPage,
  ITeamMailboxChangedEvent,
  ITeamMailboxMessage,
  ITeamTaskChangedEvent,
  ITeamTaskItem,
} from '@/common/types/team/teamTypes';

const h = vi.hoisted(() => {
  type Handler<T> = (e: T) => void;
  return {
    mailboxHandlers: [] as Handler<ITeamMailboxChangedEvent>[],
    taskHandlers: [] as Handler<ITeamTaskChangedEvent>[],
    reconnectHandlers: [] as Array<() => void>,
    listActivity: vi.fn(),
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    team: {
      listActivity: { invoke: h.listActivity },
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

const taskOf = (id: string, ts: number): ITeamTaskItem => ({
  id,
  team_id: 't1',
  subject: 's',
  status: 'pending',
  blocked_by: [],
  blocks: [],
  created_at: ts,
  updated_at: ts,
});

const msgItem = (id: string, ts: number, over: Partial<ITeamMailboxMessage> = {}): ITeamActivityItem => ({
  kind: 'message',
  created_at: ts,
  id,
  message: message({ id, created_at: ts, ...over }),
});

const page = (items: ITeamActivityItem[], next?: { ts: number; id: string }): ITeamActivityPage => ({
  items,
  next_cursor: next,
  has_more: Boolean(next),
});

beforeEach(() => {
  h.mailboxHandlers.length = 0;
  h.taskHandlers.length = 0;
  h.reconnectHandlers.length = 0;
  h.listActivity.mockReset();
  h.listActivity.mockResolvedValue(page([msgItem('m1', 1000)]));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useTeamActivityFeed (single-cursor pagination)', () => {
  it('loads the first page (desc)', async () => {
    const { result } = renderHook(() => useTeamActivityFeed('t1', true, 'desc', 'all'));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(result.current.messages[0].id).toBe('m1');
    expect(result.current.hasMore).toBe(false);
    const call = h.listActivity.mock.calls[0][0];
    expect(call.direction).toBe('desc');
    expect(call.cursor_ts).toBeUndefined();
  });

  it('does not fetch when inactive', async () => {
    renderHook(() => useTeamActivityFeed('t1', false, 'desc', 'all'));
    await Promise.resolve();
    expect(h.listActivity).not.toHaveBeenCalled();
  });

  it('loadMore fetches the next page with the cursor and appends', async () => {
    h.listActivity.mockResolvedValueOnce(page([msgItem('m2', 2000)], { ts: 2000, id: 'm2' }));
    h.listActivity.mockResolvedValueOnce(page([msgItem('m1', 1000)]));
    const { result } = renderHook(() => useTeamActivityFeed('t1', true, 'desc', 'all'));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(result.current.hasMore).toBe(true);

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.messages).toHaveLength(2));
    const secondCall = h.listActivity.mock.calls[1][0];
    expect(secondCall.cursor_ts).toBe(2000);
    expect(secondCall.cursor_id).toBe('m2');
    expect(result.current.hasMore).toBe(false);
  });

  it('ignores concurrent loadMore calls while one is in flight', async () => {
    let resolveFirst: (v: ITeamActivityPage) => void = () => {};
    h.listActivity
      .mockResolvedValueOnce(page([msgItem('m2', 2000)], { ts: 2000, id: 'm2' }))
      .mockImplementationOnce(() => new Promise<ITeamActivityPage>((res) => (resolveFirst = res)));
    const { result } = renderHook(() => useTeamActivityFeed('t1', true, 'desc', 'all'));
    await waitFor(() => expect(result.current.hasMore).toBe(true));

    act(() => {
      result.current.loadMore();
      result.current.loadMore();
    });
    await waitFor(() => expect(result.current.isLoadingMore).toBe(true));
    expect(h.listActivity).toHaveBeenCalledTimes(2); // initial + one loadMore
    act(() => resolveFirst(page([])));
    await waitFor(() => expect(result.current.isLoadingMore).toBe(false));
  });

  it('resets and refetches when direction changes', async () => {
    h.listActivity.mockImplementation((args: { direction: string }) =>
      Promise.resolve(args.direction === 'asc' ? page([msgItem('old', 1)]) : page([msgItem('m1', 1000)]))
    );
    const { result, rerender } = renderHook(
      ({ dir }: { dir: 'desc' | 'asc' }) => useTeamActivityFeed('t1', true, dir, 'all'),
      {
        initialProps: { dir: 'desc' as const },
      }
    );
    await waitFor(() => expect(result.current.messages.map((m) => m.id)).toEqual(['m1']));
    rerender({ dir: 'asc' });
    await waitFor(() => expect(result.current.messages.map((m) => m.id)).toEqual(['old']));
  });

  it('discards a stale response after direction switch (epoch guard)', async () => {
    let resolveDesc: (v: ITeamActivityPage) => void = () => {};
    h.listActivity
      .mockImplementationOnce(() => new Promise<ITeamActivityPage>((res) => (resolveDesc = res)))
      .mockResolvedValueOnce(page([msgItem('asc1', 1)]));
    const { result, rerender } = renderHook(
      ({ dir }: { dir: 'desc' | 'asc' }) => useTeamActivityFeed('t1', true, dir, 'all'),
      {
        initialProps: { dir: 'desc' as const },
      }
    );
    // Switch before the desc page resolves.
    rerender({ dir: 'asc' });
    await waitFor(() => expect(result.current.messages.map((m) => m.id)).toEqual(['asc1']));
    // Now resolve the stale desc response — it must not pollute the maps.
    act(() => resolveDesc(page([msgItem('descStale', 9999)])));
    await Promise.resolve();
    expect(result.current.messages.map((m) => m.id)).toEqual(['asc1']);
  });

  it('WS: updates an already-loaded id in place (read flip)', async () => {
    const { result } = renderHook(() => useTeamActivityFeed('t1', true, 'desc', 'all'));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    act(() =>
      h.mailboxHandlers.forEach((fn) => fn({ team_id: 't1', change: 'read', message: message({ read: true }) }))
    );
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].read).toBe(true);
  });

  it('WS: inserts a genuinely newer message (desc) but drops an older unknown task', async () => {
    const { result } = renderHook(() => useTeamActivityFeed('t1', true, 'desc', 'all'));
    await waitFor(() => expect(result.current.messages).toHaveLength(1)); // edge = m1@1000
    act(() =>
      h.mailboxHandlers.forEach((fn) =>
        fn({ team_id: 't1', change: 'created', message: message({ id: 'm9', created_at: 5000 }) })
      )
    );
    expect(result.current.messages.map((m) => m.id).toSorted()).toEqual(['m1', 'm9']);
    // Older unknown task (created_at below the loaded edge) is dropped.
    act(() => h.taskHandlers.forEach((fn) => fn({ team_id: 't1', change: 'created', task: taskOf('old', 10) })));
    expect(result.current.tasks).toHaveLength(0);
  });

  it('WS: legacy taskChanged without payload reloads the first page', async () => {
    const { result } = renderHook(() => useTeamActivityFeed('t1', true, 'desc', 'all'));
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    h.listActivity.mockResolvedValueOnce(page([msgItem('m1', 1000), msgItem('m2', 2000)]));
    await act(async () => {
      h.taskHandlers.forEach((fn) => fn({ team_id: 't1' }));
    });
    await waitFor(() => expect(result.current.messages).toHaveLength(2));
  });
});
