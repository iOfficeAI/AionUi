/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The write path for split-group tags. A mutation reads the conversations it
 * touches from the backend when it runs, plans from those reads, writes them
 * as one batch with rollback, and waits for the list to catch up. Nothing a
 * caller saw earlier is trusted; a conversation is gone only on a 404.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/common', () => ({ ipcBridge: { conversation: { update: { invoke: vi.fn() } } } }));
vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({ getConversationOrNull: vi.fn() }));
vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync', () => ({
  getSnapshotConversations: () => [],
  refreshConversationList: vi.fn(),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import type { TChatConversation } from '@/common/config/storage';
import type { SplitGroupMutationDeps } from '@/renderer/pages/conversation/GroupedHistory/hooks/useSplitGroupMutations';
import { runSplitGroupMutation } from '@/renderer/pages/conversation/GroupedHistory/hooks/useSplitGroupMutations';
import type { SplitGroupTag } from '@/renderer/pages/conversation/GroupedHistory/utils/splitGroupHelpers';

const tag = (id: string, order: number): SplitGroupTag => ({ id, order });
const row = (id: string, split_group: SplitGroupTag | null = null): TChatConversation =>
  ({ id, name: id, type: 'acp', created_at: 1, modified_at: 1, extra: { split_group } }) as TChatConversation;

type Backend = Record<string, TChatConversation | null>;

/** An in-memory backend: reads answer from `backend` (null = 404), writes land unless refused. */
const makeDeps = (
  backend: Backend,
  options: { refuse?: string[]; candidates?: Record<string, string[]>; unreachable?: string[] } = {}
) => {
  const writes: Array<[string, SplitGroupTag | null]> = [];
  const refresh = vi.fn(async () => {});
  const deps: SplitGroupMutationDeps = {
    read: async (id) => {
      if (options.unreachable?.includes(id)) throw new Error(`read ${id}: offline`);
      return backend[id] ?? null;
    },
    update: async (id, split_group) => {
      writes.push([id, split_group]);
      if (options.refuse?.includes(id)) return false;
      const current = backend[id];
      if (current) backend[id] = row(id, split_group);
      return true;
    },
    refresh,
    candidates: (group_id) => options.candidates?.[group_id] ?? Object.keys(backend),
  };
  return { deps, writes, refresh, backend };
};

const silenced = async (body: () => Promise<void>): Promise<void> => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await body();
  } finally {
    error.mockRestore();
  }
};

describe('runSplitGroupMutation: create', () => {
  it('tags both conversations from fresh reads and reloads the list once', async () => {
    const { deps, writes, refresh } = makeDeps({ a: row('a'), b: row('b') });
    const result = await runSplitGroupMutation({ type: 'create', target_id: 'a', dragged_id: 'b' }, deps);
    expect(result.group_id).toBeTruthy();
    expect(writes.map(([id, t]) => [id, t?.order])).toEqual([
      ['a', 0],
      ['b', 1],
    ]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("joins the target's group when the target was grouped after the drag started", async () => {
    const { deps, writes } = makeDeps({ a: row('a', tag('g', 0)), c: row('c', tag('g', 1)), b: row('b') });
    const result = await runSplitGroupMutation({ type: 'create', target_id: 'a', dragged_id: 'b' }, deps);
    expect(result.group_id).toBe('g');
    expect(writes).toEqual([['b', tag('g', 2)]]);
  });

  it('refuses a second create for a conversation the first one already grouped', async () =>
    silenced(async () => {
      // A+B was queued, then A+C: by the time A+C runs, B carries A's group and
      // A is grouped — the stale plan must not retag A and orphan B.
      const { deps, writes } = makeDeps({ a: row('a'), b: row('b'), c: row('c') });
      await runSplitGroupMutation({ type: 'create', target_id: 'a', dragged_id: 'b' }, deps);
      const result = await runSplitGroupMutation({ type: 'create', target_id: 'a', dragged_id: 'c' }, deps);
      // A is grouped now, so C joins A's group as a third column, B keeps its tag.
      expect(result.group_id).toBe(writes[0][1]?.id);
      expect(writes.at(-1)?.[0]).toBe('c');
      expect(writes.at(-1)?.[1]?.order).toBe(2);
    }));

  it('fails when either conversation reads back as deleted, writing nothing', async () => {
    const { deps, writes } = makeDeps({ a: row('a'), b: null });
    await expect(runSplitGroupMutation({ type: 'create', target_id: 'a', dragged_id: 'b' }, deps)).rejects.toThrow(
      /no longer exists/
    );
    expect(writes).toEqual([]);
  });

  it('refuses to drag a conversation that already belongs to a group', async () => {
    const { deps, writes } = makeDeps({ a: row('a'), b: row('b', tag('other', 0)) });
    await expect(runSplitGroupMutation({ type: 'create', target_id: 'a', dragged_id: 'b' }, deps)).rejects.toThrow(
      /already belongs/
    );
    expect(writes).toEqual([]);
  });

  it('rolls the landed write back when the other is refused, and writes nothing on the reload', async () =>
    silenced(async () => {
      const { deps, writes, refresh } = makeDeps({ a: row('a'), b: row('b') }, { refuse: ['b'] });
      await expect(runSplitGroupMutation({ type: 'create', target_id: 'a', dragged_id: 'b' }, deps)).rejects.toThrow(
        /rejected for b/
      );
      expect(writes.map(([id, t]) => [id, t?.order ?? null])).toEqual([
        ['a', 0],
        ['b', 1],
        ['a', null],
      ]);
      expect(refresh).not.toHaveBeenCalled();
    }));
});

describe('runSplitGroupMutation: add', () => {
  it('appends after the highest order the backend currently shows', async () => {
    const { deps, writes } = makeDeps({ a: row('a', tag('g', 0)), b: row('b', tag('g', 5)), c: row('c') });
    await runSplitGroupMutation({ type: 'add', group_id: 'g', conversation_id: 'c' }, deps);
    expect(writes).toEqual([['c', tag('g', 6)]]);
  });

  it('fails loudly when the group dissolved before its turn, instead of writing a singleton', async () => {
    // The list still shows a and b as candidates, but the backend has cleared them.
    const { deps, writes } = makeDeps({ a: row('a'), b: row('b'), c: row('c') }, { candidates: { g: ['a', 'b'] } });
    await expect(runSplitGroupMutation({ type: 'add', group_id: 'g', conversation_id: 'c' }, deps)).rejects.toThrow(
      /no longer exists/
    );
    expect(writes).toEqual([]);
  });

  it('is a no-op for a conversation already in the group', async () => {
    const { deps, writes } = makeDeps({ a: row('a', tag('g', 0)), b: row('b', tag('g', 1)) });
    const result = await runSplitGroupMutation({ type: 'add', group_id: 'g', conversation_id: 'b' }, deps);
    expect(result.noop).toBe('already a member');
    expect(writes).toEqual([]);
  });
});

describe('runSplitGroupMutation: remove', () => {
  it('clears only the leaving member while two remain', async () => {
    const { deps, writes } = makeDeps({ a: row('a', tag('g', 0)), b: row('b', tag('g', 1)), c: row('c', tag('g', 2)) });
    const result = await runSplitGroupMutation({ type: 'remove', group_id: 'g', conversation_id: 'b' }, deps);
    expect(writes).toEqual([['b', null]]);
    expect(result.dissolved).toBe(false);
  });

  it("dissolves from the backend's view, not the caller's: a second removal finds the pair, not the trio", async () => {
    const { deps, writes } = makeDeps({ a: row('a', tag('g', 0)), b: row('b', tag('g', 1)), c: row('c', tag('g', 2)) });
    await runSplitGroupMutation({ type: 'remove', group_id: 'g', conversation_id: 'b' }, deps);
    const result = await runSplitGroupMutation({ type: 'remove', group_id: 'g', conversation_id: 'c' }, deps);
    expect(result).toMatchObject({ dissolved: true, survivor: 'a' });
    expect(writes.slice(1)).toEqual([
      ['c', null],
      ['a', null],
    ]);
  });

  it('removes a member that reads back as deleted and dissolves the survivor', async () => {
    const { deps, writes } = makeDeps({ a: row('a', tag('g', 0)), b: null }, { candidates: { g: ['a', 'b'] } });
    const result = await runSplitGroupMutation({ type: 'remove', group_id: 'g', conversation_id: 'b' }, deps);
    // Nothing is written for the deleted row; the survivor's tag is cleared.
    expect(writes).toEqual([['a', null]]);
    expect(result).toMatchObject({ dissolved: true, survivor: 'a' });
  });

  it('on a deleted event, leaves an archived (still readable) member alone', async () => {
    const { deps, writes } = makeDeps({ a: row('a', tag('g', 0)), b: row('b', tag('g', 1)) });
    const result = await runSplitGroupMutation(
      { type: 'remove-if-deleted', group_id: 'g', conversation_id: 'b' },
      deps
    );
    expect(result.noop).toBe('not deleted');
    expect(writes).toEqual([]);
  });

  it('rolls a dissolve back to the tags the members had when clearing the survivor is refused', async () =>
    silenced(async () => {
      const { deps, writes } = makeDeps({ a: row('a', tag('g', 0)), b: row('b', tag('g', 1)) }, { refuse: ['a'] });
      await expect(
        runSplitGroupMutation({ type: 'remove', group_id: 'g', conversation_id: 'b' }, deps)
      ).rejects.toThrow(/rejected for a/);
      // b's clear landed and is put back to the tag it had; a was never cleared.
      expect(writes).toEqual([
        ['b', null],
        ['a', null],
        ['b', tag('g', 1)],
      ]);
    }));

  it('propagates a read failure without writing anything', async () => {
    const { deps, writes } = makeDeps({ a: row('a', tag('g', 0)), b: row('b', tag('g', 1)) }, { unreachable: ['b'] });
    await expect(runSplitGroupMutation({ type: 'remove', group_id: 'g', conversation_id: 'b' }, deps)).rejects.toThrow(
      /offline/
    );
    expect(writes).toEqual([]);
  });

  it('propagates a failed list reload so the caller does not navigate', async () => {
    const { deps, refresh } = makeDeps({ a: row('a', tag('g', 0)), b: row('b', tag('g', 1)) });
    refresh.mockRejectedValueOnce(new Error('list offline'));
    await expect(runSplitGroupMutation({ type: 'remove', group_id: 'g', conversation_id: 'b' }, deps)).rejects.toThrow(
      'list offline'
    );
  });
});
