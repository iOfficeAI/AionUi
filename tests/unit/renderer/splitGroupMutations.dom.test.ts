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
vi.mock('@/renderer/pages/conversation/GroupedHistory/utils/splitGroupCensus', () => ({
  readSplitGroupCensus: vi.fn(),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import type { TChatConversation } from '@/common/config/storage';
import type { SplitGroupMutationDeps } from '@/renderer/pages/conversation/GroupedHistory/hooks/useSplitGroupMutations';
import {
  applySplitGroupPatches,
  nextFocusNonce,
  runSplitGroupMutation,
} from '@/renderer/pages/conversation/GroupedHistory/hooks/useSplitGroupMutations';
import type { SplitGroupTag } from '@/renderer/pages/conversation/GroupedHistory/utils/splitGroupHelpers';
import { readSplitGroupTag } from '@/renderer/pages/conversation/GroupedHistory/utils/splitGroupHelpers';

const tag = (id: string, order: number): SplitGroupTag => ({ id, order });
const row = (id: string, split_group: SplitGroupTag | null = null): TChatConversation =>
  ({ id, name: id, type: 'acp', created_at: 1, modified_at: 1, extra: { split_group } }) as TChatConversation;

type Backend = Record<string, TChatConversation | null>;

/**
 * An in-memory backend: reads answer from `backend` (null = 404), writes land
 * unless refused, and the census enumerates the same rows — including the ones
 * the sidebar would never show (archived), because the census reads the
 * backend rather than the published list.
 */
const makeDeps = (
  backend: Backend,
  options: {
    refuse?: string[];
    /** Ids whose first write lands and whose every later write (a rollback) is refused. */
    refuseRollback?: string[];
    unreachable?: string[];
    /** The census could not be read whole, so a short count proves nothing. */
    incomplete?: boolean;
  } = {}
) => {
  const writes: Array<[string, SplitGroupTag | null]> = [];
  const attempts = new Map<string, number>();
  const refresh = vi.fn(async () => {});
  const deps: SplitGroupMutationDeps = {
    read: async (id) => {
      if (options.unreachable?.includes(id)) throw new Error(`read ${id}: offline`);
      return backend[id] ?? null;
    },
    update: async (id, split_group) => {
      writes.push([id, split_group]);
      const seen = attempts.get(id) ?? 0;
      attempts.set(id, seen + 1);
      if (options.refuse?.includes(id)) return false;
      if (seen > 0 && options.refuseRollback?.includes(id)) return false;
      const current = backend[id];
      if (current) backend[id] = row(id, split_group);
      return true;
    },
    refresh,
    census: async (group_id) => ({
      members: Object.values(backend).filter(
        (item): item is TChatConversation => item !== null && readSplitGroupTag(item)?.id === group_id
      ),
      complete: options.incomplete !== true,
    }),
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

  it('refuses to drag a conversation whose group still has another member', async () => {
    const { deps, writes } = makeDeps({
      a: row('a'),
      b: row('b', tag('other', 0)),
      c: row('c', tag('other', 1)),
    });
    await expect(runSplitGroupMutation({ type: 'create', target_id: 'a', dragged_id: 'b' }, deps)).rejects.toThrow(
      /already belongs/
    );
    expect(writes).toEqual([]);
  });

  it('lets a conversation wearing a leftover tag join: nobody else carries it', async () => {
    // b's group was dissolved while this window was not watching (its peer was
    // deleted with no listener attached). Without this, b shows as a plain row
    // that refuses every group forever.
    const { deps, writes, backend } = makeDeps({ a: row('a'), b: row('b', tag('gone', 0)) });
    const result = await runSplitGroupMutation({ type: 'create', target_id: 'a', dragged_id: 'b' }, deps);
    expect(result.group_id).not.toBe('gone');
    expect(writes.map(([id]) => id)).toEqual(['a', 'b']);
    expect(readSplitGroupTag(backend.b as TChatConversation)?.id).toBe(result.group_id);
  });

  it('still refuses a leftover-looking tag when the backend could not be read whole', async () => {
    const { deps, writes } = makeDeps({ a: row('a'), b: row('b', tag('other', 0)) }, { incomplete: true });
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

  it('lets a conversation wearing a leftover tag be added to a live group', async () => {
    const { deps, backend } = makeDeps({
      a: row('a', tag('g', 0)),
      b: row('b', tag('g', 1)),
      c: row('c', tag('gone', 0)),
    });
    await runSplitGroupMutation({ type: 'add', group_id: 'g', conversation_id: 'c' }, deps);
    expect(readSplitGroupTag(backend.c as TChatConversation)).toEqual({ id: 'g', order: 2 });
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

  it('counts a member the sidebar cannot show, so a three-member group does not dissolve', async () => {
    // b is archived: it is absent from the published list yet still carries the
    // tag. Counting only what the sidebar shows would dissolve the group and
    // leave b wearing a tag for a group nobody renders.
    const { deps, writes, backend } = makeDeps({
      a: row('a', tag('g', 0)),
      b: row('b', tag('g', 1)),
      c: row('c', tag('g', 2)),
    });
    const result = await runSplitGroupMutation({ type: 'remove', group_id: 'g', conversation_id: 'a' }, deps);
    expect(result.dissolved).toBe(false);
    expect(writes).toEqual([['a', null]]);
    expect(readSplitGroupTag(backend.b as TChatConversation)).toEqual({ id: 'g', order: 1 });
  });

  it('appends after the highest order any member holds, archived ones included', async () => {
    const { deps, backend } = makeDeps({
      a: row('a', tag('g', 0)),
      b: row('b', tag('g', 5)),
      c: row('c'),
    });
    await runSplitGroupMutation({ type: 'add', group_id: 'g', conversation_id: 'c' }, deps);
    expect(readSplitGroupTag(backend.c as TChatConversation)).toEqual({ id: 'g', order: 6 });
  });

  it('removes the member but keeps the survivor tagged when the count could not be read whole', async () =>
    silenced(async () => {
      const { deps, writes } = makeDeps({ a: row('a', tag('g', 0)), b: row('b', tag('g', 1)) }, { incomplete: true });
      const result = await runSplitGroupMutation({ type: 'remove', group_id: 'g', conversation_id: 'a' }, deps);
      expect(result.dissolved).toBe(false);
      expect(writes).toEqual([['a', null]]);
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

describe('runSplitGroupMutation: dissolve-if-alone', () => {
  it('clears a tag nobody else carries', async () => {
    const { deps, writes } = makeDeps({ a: row('a', tag('g', 0)), b: row('b') });
    const result = await runSplitGroupMutation({ type: 'dissolve-if-alone', group_id: 'g' }, deps);
    expect(result).toMatchObject({ dissolved: true, survivor: 'a' });
    expect(writes).toEqual([['a', null]]);
  });

  it('leaves the tags alone while an archived peer still carries one', async () => {
    const { deps, writes } = makeDeps({ a: row('a', tag('g', 0)), b: row('b', tag('g', 1)) });
    const result = await runSplitGroupMutation({ type: 'dissolve-if-alone', group_id: 'g' }, deps);
    expect(result.noop).toBe('the group still has members');
    expect(writes).toEqual([]);
  });

  it('writes nothing when nobody carries the tag', async () => {
    const { deps, writes } = makeDeps({ a: row('a') });
    expect((await runSplitGroupMutation({ type: 'dissolve-if-alone', group_id: 'g' }, deps)).noop).toBe(
      'nobody carries the tag'
    );
    expect(writes).toEqual([]);
  });

  it('writes nothing when the backend could not be read whole', async () => {
    const { deps, writes } = makeDeps({ a: row('a', tag('g', 0)) }, { incomplete: true });
    expect((await runSplitGroupMutation({ type: 'dissolve-if-alone', group_id: 'g' }, deps)).noop).toBe(
      'the backend could not be read whole'
    );
    expect(writes).toEqual([]);
  });
});

describe('applySplitGroupPatches', () => {
  it('reports the ids left inconsistent when the rollback itself is refused', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { deps, writes } = makeDeps({ a: row('a'), b: row('b') }, { refuse: ['b'], refuseRollback: ['a'] });
      const previous = new Map<string, SplitGroupTag | null>([['a', null]]);
      await expect(
        applySplitGroupPatches(
          [
            { conversation_id: 'a', split_group: tag('g', 0) },
            { conversation_id: 'b', split_group: tag('g', 1) },
          ],
          previous,
          deps
        )
      ).rejects.toThrow(/rejected for b/);
      // a's tag was written, its rollback refused, and it stays on the group
      // tag nothing else points at — which is exactly what must be shouted.
      expect(writes).toEqual([
        ['a', tag('g', 0)],
        ['b', tag('g', 1)],
        ['a', null],
      ]);
      expect(error.mock.calls.map((call) => String(call[0]))).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/Rollback failed for a; their split_group tags are inconsistent/),
        ])
      );
      expect(deps.refresh).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });
});

describe('nextFocusNonce', () => {
  it('never repeats, however fast two requests follow each other', () => {
    // Two focus requests for the same member inside one millisecond (a held
    // Enter on a member row) must read as two requests, not one repeated.
    const nonces = Array.from({ length: 5 }, () => nextFocusNonce());
    expect(new Set(nonces).size).toBe(nonces.length);
    expect(nonces.toSorted((a, b) => a - b)).toEqual(nonces);
  });
});
