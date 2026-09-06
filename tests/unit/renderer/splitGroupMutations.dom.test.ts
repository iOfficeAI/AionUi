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
import { renderHook, waitFor } from '@testing-library/react';

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

const { messageError } = vi.hoisted(() => ({ messageError: vi.fn() }));
// Arco's Message renders through the React 18 ReactDOM.render shim, which is
// gone in React 19; what matters here is that it was asked to speak.
vi.mock('@arco-design/web-react', () => ({ Message: { error: messageError, success: vi.fn() } }));

const { navigateMock, routeState } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  routeState: { pathname: '/' },
}));
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useLocation: () => ({ pathname: routeState.pathname, search: '', hash: '', state: null, key: 'test' }),
}));

import type { TChatConversation } from '@/common/config/storage';
import { ipcBridge } from '@/common';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { readSplitGroupCensus } from '@/renderer/pages/conversation/GroupedHistory/utils/splitGroupCensus';
import type { SplitGroupMutationDeps } from '@/renderer/pages/conversation/GroupedHistory/hooks/useSplitGroupMutations';
import {
  applySplitGroupPatches,
  nextFocusNonce,
  runSplitGroupMutation,
  useSplitGroupMutations,
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

describe('runSplitGroupMutation: rename', () => {
  it('writes the name onto every member in one batch', async () => {
    const { deps, writes, refresh } = makeDeps({
      a: row('a', tag('g', 0)),
      b: row('b', tag('g', 1)),
      c: row('c', tag('g', 2)),
    });
    await runSplitGroupMutation({ type: 'rename', group_id: 'g', name: '  Research  ' }, deps);
    expect(writes).toEqual([
      ['a', { id: 'g', order: 0, name: 'Research' }],
      ['b', { id: 'g', order: 1, name: 'Research' }],
      ['c', { id: 'g', order: 2, name: 'Research' }],
    ]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('clears the name on every member when the input is blank', async () => {
    const { deps, writes } = makeDeps({
      a: row('a', { id: 'g', order: 0, name: 'Research' }),
      b: row('b', { id: 'g', order: 1, name: 'Research' }),
    });
    await runSplitGroupMutation({ type: 'rename', group_id: 'g', name: '   ' }, deps);
    // The name is left out of the tag entirely rather than stored as empty.
    expect(writes).toEqual([
      ['a', { id: 'g', order: 0 }],
      ['b', { id: 'g', order: 1 }],
    ]);
  });

  it('reconciles the members a half-landed rename left disagreeing', async () => {
    const { deps, writes } = makeDeps({
      a: row('a', { id: 'g', order: 0, name: 'Research' }),
      b: row('b', tag('g', 1)),
    });
    await runSplitGroupMutation({ type: 'rename', group_id: 'g', name: 'Research' }, deps);
    // Only the member that is out of step is written.
    expect(writes).toEqual([['b', { id: 'g', order: 1, name: 'Research' }]]);
  });

  it('writes nothing when the name is already the one asked for', async () => {
    const { deps, writes } = makeDeps({
      a: row('a', { id: 'g', order: 0, name: 'Research' }),
      b: row('b', { id: 'g', order: 1, name: 'Research' }),
    });
    const result = await runSplitGroupMutation({ type: 'rename', group_id: 'g', name: 'Research' }, deps);
    expect(result.noop).toBe('the name is already that');
    expect(writes).toEqual([]);
  });

  it('rolls the whole rename back when one member refuses it', async () =>
    silenced(async () => {
      const { deps, writes } = makeDeps({ a: row('a', tag('g', 0)), b: row('b', tag('g', 1)) }, { refuse: ['b'] });
      await expect(runSplitGroupMutation({ type: 'rename', group_id: 'g', name: 'Research' }, deps)).rejects.toThrow(
        /rejected/
      );
      expect(writes.slice(2)).toEqual([['a', tag('g', 0)]]);
    }));

  it('refuses to name one leftover tag, which is not a group', async () => {
    const { deps, writes } = makeDeps({ a: row('a', tag('g', 0)) });
    await expect(runSplitGroupMutation({ type: 'rename', group_id: 'g', name: 'Research' }, deps)).rejects.toThrow(
      /no longer exists/
    );
    expect(writes).toEqual([]);
  });

  it('refuses to name a group nobody carries', async () => {
    const { deps } = makeDeps({ a: row('a') });
    await expect(runSplitGroupMutation({ type: 'rename', group_id: 'g', name: 'Research' }, deps)).rejects.toThrow(
      /no longer exists/
    );
  });

  it('carries the name onto a conversation added to a named group', async () => {
    const { deps, writes } = makeDeps({
      a: row('a', { id: 'g', order: 0, name: 'Research' }),
      b: row('b', { id: 'g', order: 1, name: 'Research' }),
      z: row('z'),
    });
    await runSplitGroupMutation({ type: 'add', group_id: 'g', conversation_id: 'z' }, deps);
    expect(writes).toEqual([['z', { id: 'g', order: 2, name: 'Research' }]]);
  });

  it('carries the name onto a member moved into a named group', async () => {
    const { deps, writes } = makeDeps({
      a: row('a', { id: 'g', order: 0, name: 'Research' }),
      b: row('b', { id: 'g', order: 1, name: 'Research' }),
      x: row('x', tag('g2', 0)),
      y: row('y', tag('g2', 1)),
      z: row('z', tag('g2', 2)),
    });
    await runSplitGroupMutation(
      { type: 'move', from_group_id: 'g2', conversation_id: 'z', to: { kind: 'group', group_id: 'g' } },
      deps
    );
    expect(writes).toEqual([['z', { id: 'g', order: 2, name: 'Research' }]]);
  });
});

describe("runSplitGroupMutation: keeping a group's members in step on its name", () => {
  it('refuses a rename it cannot deliver to everyone', async () => {
    const { deps, writes } = makeDeps({ a: row('a', tag('g', 0)), b: row('b', tag('g', 1)) }, { incomplete: true });
    // Naming only the members it could see would report success on a group
    // that now disagrees with itself.
    await expect(runSplitGroupMutation({ type: 'rename', group_id: 'g', name: 'Research' }, deps)).rejects.toThrow(
      /could not be read whole/
    );
    expect(writes).toEqual([]);
  });

  it('repairs a divergent member when a conversation joins the group', async () => {
    const { deps, writes } = makeDeps({
      a: row('a', { id: 'g', order: 0, name: 'Research' }),
      b: row('b', tag('g', 1)),
      z: row('z'),
    });
    await runSplitGroupMutation({ type: 'add', group_id: 'g', conversation_id: 'z' }, deps);
    // The newcomer is named, and so is the member a half-landed rename left
    // behind — it would otherwise rename the group the day it became first.
    expect(writes).toEqual([
      ['z', { id: 'g', order: 2, name: 'Research' }],
      ['b', { id: 'g', order: 1, name: 'Research' }],
    ]);
  });

  it('repairs a divergent member when one is moved into the group', async () => {
    const { deps, writes } = makeDeps({
      a: row('a', { id: 'g', order: 0, name: 'Research' }),
      b: row('b', tag('g', 1)),
      x: row('x', tag('g2', 0)),
      y: row('y', tag('g2', 1)),
      z: row('z', tag('g2', 2)),
    });
    await runSplitGroupMutation(
      { type: 'move', from_group_id: 'g2', conversation_id: 'z', to: { kind: 'group', group_id: 'g' } },
      deps
    );
    expect(writes).toEqual([
      ['z', { id: 'g', order: 2, name: 'Research' }],
      ['b', { id: 'g', order: 1, name: 'Research' }],
    ]);
  });

  it('clears a stale name off a member when the group goes by none', async () => {
    const { deps, writes } = makeDeps({
      a: row('a', tag('g', 0)),
      b: row('b', { id: 'g', order: 1, name: 'Stale' }),
      z: row('z'),
    });
    await runSplitGroupMutation({ type: 'add', group_id: 'g', conversation_id: 'z' }, deps);
    // The first member by order decides, and it has no name.
    expect(writes).toEqual([
      ['z', { id: 'g', order: 2 }],
      ['b', { id: 'g', order: 1 }],
    ]);
  });

  it('adds nothing to the batch when the members already agree', async () => {
    const { deps, writes } = makeDeps({
      a: row('a', { id: 'g', order: 0, name: 'Research' }),
      b: row('b', { id: 'g', order: 1, name: 'Research' }),
      z: row('z'),
    });
    await runSplitGroupMutation({ type: 'add', group_id: 'g', conversation_id: 'z' }, deps);
    expect(writes).toEqual([['z', { id: 'g', order: 2, name: 'Research' }]]);
  });

  it('rolls a repaired member back with the rest when a write is refused', async () =>
    silenced(async () => {
      const { deps, writes } = makeDeps(
        { a: row('a', { id: 'g', order: 0, name: 'Research' }), b: row('b', tag('g', 1)), z: row('z') },
        { refuse: ['z'] }
      );
      await expect(runSplitGroupMutation({ type: 'add', group_id: 'g', conversation_id: 'z' }, deps)).rejects.toThrow(
        /rejected/
      );
      // b was remembered before the batch, so the repair is undone too.
      expect(writes.slice(2)).toEqual([['b', tag('g', 1)]]);
    }));
});

describe('runSplitGroupMutation: a group keeps its name when someone leaves it', () => {
  // Readers take the name from the first member by column order. A group whose
  // members disagree — a rename that half-landed — therefore changes what it is
  // called the moment its first member walks out, which is not something
  // leaving a group is allowed to do.
  it('holds the name when the member carrying it is removed', async () => {
    const { deps, writes } = makeDeps({
      a: row('a', { id: 'g', order: 0, name: 'Research' }),
      b: row('b', tag('g', 1)),
      c: row('c', tag('g', 2)),
    });
    await runSplitGroupMutation({ type: 'remove', group_id: 'g', conversation_id: 'a' }, deps);
    expect(writes).toEqual([
      ['a', null],
      ['b', { id: 'g', order: 1, name: 'Research' }],
      ['c', { id: 'g', order: 2, name: 'Research' }],
    ]);
  });

  it('does not let a stale name surface when the unnamed first member leaves', async () => {
    const { deps, writes } = makeDeps({
      a: row('a', tag('g', 0)),
      b: row('b', { id: 'g', order: 1, name: 'Stale' }),
      c: row('c', tag('g', 2)),
    });
    await runSplitGroupMutation({ type: 'remove', group_id: 'g', conversation_id: 'a' }, deps);
    // The group went by no name; it still does.
    expect(writes).toEqual([
      ['a', null],
      ['b', { id: 'g', order: 1 }],
    ]);
  });

  it('holds the name of the group a member is moved out of', async () => {
    const { deps, writes } = makeDeps({
      a: row('a', { id: 'g1', order: 0, name: 'Research' }),
      b: row('b', tag('g1', 1)),
      c: row('c', tag('g1', 2)),
      x: row('x', tag('g2', 0)),
      y: row('y', tag('g2', 1)),
    });
    await runSplitGroupMutation(
      { type: 'move', from_group_id: 'g1', conversation_id: 'a', to: { kind: 'group', group_id: 'g2' } },
      deps
    );
    const bySource = writes.filter(([id]) => id === 'b' || id === 'c');
    expect(bySource).toEqual([
      ['b', { id: 'g1', order: 1, name: 'Research' }],
      ['c', { id: 'g1', order: 2, name: 'Research' }],
    ]);
  });

  it('writes nothing extra when the members already agree', async () => {
    const { deps, writes } = makeDeps({
      a: row('a', { id: 'g', order: 0, name: 'Research' }),
      b: row('b', { id: 'g', order: 1, name: 'Research' }),
      c: row('c', { id: 'g', order: 2, name: 'Research' }),
    });
    await runSplitGroupMutation({ type: 'remove', group_id: 'g', conversation_id: 'a' }, deps);
    expect(writes).toEqual([['a', null]]);
  });

  it('still holds the survivors it could read to the name when the count is short', async () =>
    silenced(async () => {
      const { deps, writes } = makeDeps(
        {
          a: row('a', { id: 'g', order: 0, name: 'Research' }),
          b: row('b', tag('g', 1)),
          c: row('c', tag('g', 2)),
        },
        { incomplete: true }
      );
      await runSplitGroupMutation({ type: 'remove', group_id: 'g', conversation_id: 'a' }, deps);
      // The carrier is leaving. Left alone, readers would take the name from
      // whichever member is first now — none — and the group would lose its
      // name because someone walked out. The read survivors are held to it;
      // any the count missed are put back in step by the next complete write.
      expect(writes).toEqual([
        ['a', null],
        ['b', { id: 'g', order: 1, name: 'Research' }],
        ['c', { id: 'g', order: 2, name: 'Research' }],
      ]);
    }));

  it('says so when it could only hold the name among the survivors it read', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { deps } = makeDeps(
        { a: row('a', { id: 'g', order: 0, name: 'Research' }), b: row('b', tag('g', 1)), c: row('c', tag('g', 2)) },
        { incomplete: true }
      );
      await runSplitGroupMutation({ type: 'remove', group_id: 'g', conversation_id: 'a' }, deps);
      expect(error).toHaveBeenCalledWith(expect.stringContaining('its name was held only among b, c'));
    } finally {
      error.mockRestore();
    }
  });

  it('has nothing to hold when the group dissolves', async () => {
    const { deps, writes } = makeDeps({
      a: row('a', { id: 'g', order: 0, name: 'Research' }),
      b: row('b', tag('g', 1)),
    });
    await runSplitGroupMutation({ type: 'remove', group_id: 'g', conversation_id: 'a' }, deps);
    expect(writes).toEqual([
      ['a', null],
      ['b', null],
    ]);
  });
});

describe('runSplitGroupMutation: a tag naming a group that is gone', () => {
  it('clears it rather than failing, so archiving a stale-tagged row still works', async () => {
    // The row insists it is in group `ghost`; nobody else carries that tag.
    // The desired end state — no membership — is one write away, and refusing
    // would fail an archive that had nothing wrong with it.
    const { deps, writes } = makeDeps({ z: row('z', tag('ghost', 0)) });
    const result = await runSplitGroupMutation({ type: 'leave-own-group', conversation_id: 'z' }, deps);
    expect(result.group_id).toBe('ghost');
    expect(writes).toEqual([['z', null]]);
  });
});

describe('runSplitGroupMutation: move', () => {
  it('leaves one group and joins another as a single batch', async () => {
    const { deps, writes, refresh } = makeDeps({
      a: row('a', tag('g1', 0)),
      b: row('b', tag('g1', 1)),
      c: row('c', tag('g1', 2)),
      x: row('x', tag('g2', 0)),
      y: row('y', tag('g2', 1)),
    });
    const result = await runSplitGroupMutation(
      { type: 'move', from_group_id: 'g1', conversation_id: 'c', to: { kind: 'group', group_id: 'g2' } },
      deps
    );
    expect(result.group_id).toBe('g2');
    expect(result.dissolved).toBe(false);
    // One write, one reload: the member is never briefly in both groups or in neither.
    expect(writes).toEqual([['c', tag('g2', 2)]]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('fuses with a plain row it is dropped on, and dissolves the pair it leaves', async () => {
    const { deps, writes, refresh } = makeDeps({ a: row('a', tag('g1', 0)), b: row('b', tag('g1', 1)), z: row('z') });
    const result = await runSplitGroupMutation(
      { type: 'move', from_group_id: 'g1', conversation_id: 'b', to: { kind: 'conversation', conversation_id: 'z' } },
      deps
    );
    expect(result.dissolved).toBe(true);
    expect(result.survivor).toBe('a');
    const written = writes.map(([id, value]) => [id, value?.id === result.group_id ? value.order : value]);
    // z and b get the new group in column order; a, left alone, loses its tag.
    expect(written).toEqual([
      ['z', 0],
      ['b', 1],
      ['a', null],
    ]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("joins the target's group when the target was grouped after the drag started", async () => {
    const { deps, writes } = makeDeps({
      a: row('a', tag('g1', 0)),
      b: row('b', tag('g1', 1)),
      c: row('c', tag('g1', 2)),
      z: row('z', tag('g2', 0)),
      w: row('w', tag('g2', 1)),
    });
    const result = await runSplitGroupMutation(
      { type: 'move', from_group_id: 'g1', conversation_id: 'c', to: { kind: 'conversation', conversation_id: 'z' } },
      deps
    );
    expect(result.group_id).toBe('g2');
    expect(writes).toEqual([['c', tag('g2', 2)]]);
  });

  it('writes nothing when the target turns out to be in the same group', async () => {
    const { deps, writes } = makeDeps({ a: row('a', tag('g1', 0)), b: row('b', tag('g1', 1)) });
    const result = await runSplitGroupMutation(
      { type: 'move', from_group_id: 'g1', conversation_id: 'b', to: { kind: 'conversation', conversation_id: 'a' } },
      deps
    );
    expect(result.noop).toBe('the same group');
    expect(writes).toEqual([]);
  });

  it('writes nothing when the member already left the group', async () => {
    const { deps, writes } = makeDeps({
      a: row('a', tag('g1', 0)),
      b: row('b', tag('g1', 1)),
      c: row('c'),
      z: row('z'),
    });
    const result = await runSplitGroupMutation(
      { type: 'move', from_group_id: 'g1', conversation_id: 'c', to: { kind: 'conversation', conversation_id: 'z' } },
      deps
    );
    expect(result.noop).toBe('not a member');
    expect(writes).toEqual([]);
  });

  it('keeps the survivor tagged when the count of the group it leaves could not be read whole', async () =>
    silenced(async () => {
      const { deps, writes } = makeDeps(
        { a: row('a', tag('g1', 0)), b: row('b', tag('g1', 1)), z: row('z') },
        { incomplete: true }
      );
      const result = await runSplitGroupMutation(
        { type: 'move', from_group_id: 'g1', conversation_id: 'b', to: { kind: 'conversation', conversation_id: 'z' } },
        deps
      );
      expect(result.dissolved).toBe(false);
      expect(writes.map(([id]) => id)).toEqual(['z', 'b']);
    }));

  it('rolls the whole move back when any write in it is refused', async () =>
    silenced(async () => {
      const { deps, writes } = makeDeps(
        { a: row('a', tag('g1', 0)), b: row('b', tag('g1', 1)), z: row('z') },
        { refuse: ['a'] }
      );
      await expect(
        runSplitGroupMutation(
          {
            type: 'move',
            from_group_id: 'g1',
            conversation_id: 'b',
            to: { kind: 'conversation', conversation_id: 'z' },
          },
          deps
        )
      ).rejects.toThrow(/rejected/);
      // z and b are put back to the tags they had before the batch.
      expect(writes.slice(3)).toEqual([
        ['z', null],
        ['b', tag('g1', 1)],
      ]);
    }));

  it('propagates a vanished destination group without writing anything', async () => {
    const { deps, writes } = makeDeps({ a: row('a', tag('g1', 0)), b: row('b', tag('g1', 1)) });
    await expect(
      runSplitGroupMutation(
        { type: 'move', from_group_id: 'g1', conversation_id: 'b', to: { kind: 'group', group_id: 'gone' } },
        deps
      )
    ).rejects.toThrow(/no longer exists/);
    expect(writes).toEqual([]);
  });
});

describe('runSplitGroupMutation: joining a group that could not be read whole', () => {
  // A short count cannot say what the highest order is. Appending anyway hands
  // the newcomer an order an unread member already holds, and nothing
  // afterwards can tell the two columns apart — so every path that appends a
  // column refuses instead.
  it('refuses to add a conversation to a group whose count is short', async () => {
    const { deps, writes } = makeDeps(
      { a: row('a', tag('g', 0)), b: row('b', tag('g', 1)), z: row('z') },
      { incomplete: true }
    );
    await expect(runSplitGroupMutation({ type: 'add', group_id: 'g', conversation_id: 'z' }, deps)).rejects.toThrow(
      /could not be read whole/
    );
    expect(writes).toEqual([]);
  });

  it('refuses to move a member into a group whose count is short', async () => {
    const { deps, writes } = makeDeps(
      { a: row('a', tag('g1', 0)), b: row('b', tag('g1', 1)), c: row('c', tag('g1', 2)), x: row('x', tag('g2', 0)) },
      { incomplete: true }
    );
    await expect(
      runSplitGroupMutation(
        { type: 'move', from_group_id: 'g1', conversation_id: 'c', to: { kind: 'group', group_id: 'g2' } },
        deps
      )
    ).rejects.toThrow(/could not be read whole/);
    expect(writes).toEqual([]);
  });

  it('refuses to move a member onto a row whose group cannot be counted', async () => {
    const { deps, writes } = makeDeps(
      { a: row('a', tag('g1', 0)), b: row('b', tag('g1', 1)), c: row('c', tag('g1', 2)), x: row('x', tag('g2', 0)) },
      { incomplete: true }
    );
    await expect(
      runSplitGroupMutation(
        { type: 'move', from_group_id: 'g1', conversation_id: 'c', to: { kind: 'conversation', conversation_id: 'x' } },
        deps
      )
    ).rejects.toThrow(/could not be read whole/);
    expect(writes).toEqual([]);
  });

  it('refuses a create whose target joined a group that cannot be counted', async () => {
    const { deps, writes } = makeDeps(
      { a: row('a', tag('g', 0)), c: row('c', tag('g', 1)), b: row('b') },
      { incomplete: true }
    );
    await expect(runSplitGroupMutation({ type: 'create', target_id: 'a', dragged_id: 'b' }, deps)).rejects.toThrow(
      /could not be read whole/
    );
    expect(writes).toEqual([]);
  });

  it('propagates no name at all when the count that would supply it is short', async () => {
    // The member the count missed is the one carrying the name; the members it
    // did read carry a stale one. Nothing is inherited and nothing is repaired,
    // because nothing is written: the join is refused before the name matters.
    const { deps, writes } = makeDeps(
      { b: row('b', { id: 'g', order: 1, name: 'Old' }), c: row('c', { id: 'g', order: 2, name: 'Old' }), z: row('z') },
      { incomplete: true }
    );
    await expect(runSplitGroupMutation({ type: 'add', group_id: 'g', conversation_id: 'z' }, deps)).rejects.toThrow(
      /could not be read whole/
    );
    expect(writes).toEqual([]);
  });

  it('still fuses two plain rows, which need no count at all', async () => {
    const { deps, writes } = makeDeps({ a: row('a'), b: row('b') }, { incomplete: true });
    const result = await runSplitGroupMutation({ type: 'create', target_id: 'a', dragged_id: 'b' }, deps);
    expect(result.group_id).toBeTruthy();
    expect(writes.map(([id, t]) => [id, t?.order])).toEqual([
      ['a', 0],
      ['b', 1],
    ]);
  });
});

/**
 * The column order lives on every member's tag, so a reorder is one batch that
 * rewrites every member's slot from the new sequence — and, like the other
 * writes, refuses a count read short rather than numbering only the members it
 * could see.
 */
describe('runSplitGroupMutation: reorder', () => {
  it('rewrites the slot of every member whose slot changed, keeping the name', async () => {
    const { deps, writes } = makeDeps({
      a: row('a', { id: 'g', order: 0, name: 'Research' }),
      b: row('b', { id: 'g', order: 1, name: 'Research' }),
      c: row('c', { id: 'g', order: 2, name: 'Research' }),
    });
    const result = await runSplitGroupMutation({ type: 'reorder', group_id: 'g', order: ['c', 'a', 'b'] }, deps);
    expect(result).toMatchObject({ group_id: 'g', dissolved: false });
    expect(writes).toEqual([
      ['c', { id: 'g', order: 0, name: 'Research' }],
      ['a', { id: 'g', order: 1, name: 'Research' }],
      ['b', { id: 'g', order: 2, name: 'Research' }],
    ]);
  });

  it('gives a member named twice the first of its slots', async () => {
    const { deps, writes } = makeDeps({ a: row('a', tag('g', 0)), b: row('b', tag('g', 1)), c: row('c', tag('g', 2)) });
    await runSplitGroupMutation({ type: 'reorder', group_id: 'g', order: ['c', 'a', 'c', 'b'] }, deps);
    expect(writes).toEqual([
      ['c', { id: 'g', order: 0 }],
      ['a', { id: 'g', order: 1 }],
      ['b', { id: 'g', order: 2 }],
    ]);
  });

  it('writes nothing when the order is already that', async () => {
    const { deps, writes } = makeDeps({ a: row('a', tag('g', 0)), b: row('b', tag('g', 1)) });
    const result = await runSplitGroupMutation({ type: 'reorder', group_id: 'g', order: ['a', 'b'] }, deps);
    expect(result.noop).toBe('the order is already that');
    expect(writes).toEqual([]);
  });

  it('refuses a count read short, so no member is numbered against one it could not see', async () => {
    const { deps, writes } = makeDeps({ a: row('a', tag('g', 0)), b: row('b', tag('g', 1)) }, { incomplete: true });
    await expect(runSplitGroupMutation({ type: 'reorder', group_id: 'g', order: ['b', 'a'] }, deps)).rejects.toThrow(
      /could not be read whole/
    );
    expect(writes).toEqual([]);
  });

  it('keeps a member the sequence missed at the tail, and skips an id that left', async () => {
    // d joined since the drag started; z left. The named ones come first in
    // the sequence's order, d keeps the tail.
    const { deps, writes } = makeDeps({
      a: row('a', tag('g', 0)),
      b: row('b', tag('g', 1)),
      d: row('d', tag('g', 2)),
    });
    await runSplitGroupMutation({ type: 'reorder', group_id: 'g', order: ['b', 'z', 'a'] }, deps);
    expect(writes).toEqual([
      ['b', { id: 'g', order: 0 }],
      ['a', { id: 'g', order: 1 }],
    ]);
  });

  it('refuses to order one leftover tag', async () => {
    const { deps, writes } = makeDeps({ a: row('a', tag('g', 0)) });
    await expect(runSplitGroupMutation({ type: 'reorder', group_id: 'g', order: ['a'] }, deps)).rejects.toThrow(
      /no longer exists/
    );
    expect(writes).toEqual([]);
  });

  it('rolls the whole reorder back when one member refuses it', async () =>
    silenced(async () => {
      const { deps, writes } = makeDeps(
        { a: row('a', tag('g', 0)), b: row('b', tag('g', 1)), c: row('c', tag('g', 2)) },
        { refuse: ['a'] }
      );
      await expect(
        runSplitGroupMutation({ type: 'reorder', group_id: 'g', order: ['c', 'a', 'b'] }, deps)
      ).rejects.toThrow();
      // Every slot that did land is put back; a is never touched.
      const rolledBack = writes.filter(([id, value]) => id !== 'a' && value !== null);
      expect(rolledBack.map(([id, value]) => [id, (value as { order: number }).order])).toEqual(
        expect.arrayContaining([
          ['c', 2],
          ['b', 1],
        ])
      );
    }));
});

describe('runSplitGroupMutation: leave-own-group', () => {
  // Archiving takes a conversation out of the active list but leaves its tag
  // behind, so the group folds to a plain row while the census — which counts
  // archived rows — still sees two and refuses to dissolve it. Leaving first
  // is what keeps that from happening.
  it('takes the conversation out of whatever group it is in', async () => {
    const { deps, writes } = makeDeps({
      a: row('a', tag('g', 0)),
      b: row('b', tag('g', 1)),
      c: row('c', tag('g', 2)),
    });
    const result = await runSplitGroupMutation({ type: 'leave-own-group', conversation_id: 'c' }, deps);
    expect(result.group_id).toBe('g');
    expect(result.dissolved).toBe(false);
    expect(writes).toEqual([['c', null]]);
  });

  it('dissolves the pair it leaves behind, so no survivor keeps a dangling tag', async () => {
    const { deps, writes } = makeDeps({ a: row('a', tag('g', 0)), b: row('b', tag('g', 1)) });
    const result = await runSplitGroupMutation({ type: 'leave-own-group', conversation_id: 'b' }, deps);
    expect(result.dissolved).toBe(true);
    expect(result.survivor).toBe('a');
    expect(writes).toEqual([
      ['b', null],
      ['a', null],
    ]);
  });

  it('writes nothing for a conversation that is in no group', async () => {
    const { deps, writes } = makeDeps({ z: row('z') });
    const result = await runSplitGroupMutation({ type: 'leave-own-group', conversation_id: 'z' }, deps);
    expect(result.noop).toBe('not in a group');
    expect(writes).toEqual([]);
  });

  it('writes nothing for a conversation the backend no longer has', async () => {
    const { deps, writes } = makeDeps({});
    const result = await runSplitGroupMutation({ type: 'leave-own-group', conversation_id: 'gone' }, deps);
    expect(result.noop).toBe('no longer exists');
    expect(writes).toEqual([]);
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

/**
 * The standing rule (ledger 2026-09-05 18:40): dropping a conversation onto the
 * OPEN CHAT AREA creates or extends the group *and shows the columns*. A
 * split-group member dropped there takes the same gesture, so it must land the
 * same way — on the destination's columns, not on wherever the user already was.
 */
describe('useSplitGroupMutations: a drop on the open chat area shows what it built', () => {
  /** Point the module-level ipc dependencies at an in-memory backend. */
  const wireBackend = (backend: Backend) => {
    vi.mocked(getConversationOrNull).mockImplementation(async (id: string) => backend[id] ?? null);
    vi.mocked(ipcBridge.conversation.update.invoke).mockImplementation(
      async ({ id, updates }: { id: string; updates: { extra: { split_group: SplitGroupTag | null } } }) => {
        if (backend[id]) backend[id] = row(id, updates.extra.split_group);
        return true;
      }
    );
    vi.mocked(readSplitGroupCensus).mockImplementation(async (group_id: string) => ({
      members: Object.values(backend).filter(
        (item): item is TChatConversation => item !== null && readSplitGroupTag(item)?.id === group_id
      ),
      complete: true,
    }));
  };

  const trio = (): Backend => ({
    a: row('a', tag('g1', 0)),
    b: row('b', tag('g1', 1)),
    c: row('c', tag('g1', 2)),
    x: row('x', tag('g2', 0)),
    y: row('y', tag('g2', 1)),
  });

  it("opens the destination's columns, with the dropped member focused", async () => {
    navigateMock.mockClear();
    routeState.pathname = '/conversation/x';
    wireBackend(trio());
    const { result } = renderHook(() => useSplitGroupMutations());
    await result.current.moveMember('g1', 'c', { kind: 'group', group_id: 'g2' }, { open: true });
    await waitFor(() => expect(navigateMock).toHaveBeenCalledTimes(1));
    expect(navigateMock.mock.calls[0][0]).toBe('/split/g2');
    expect(navigateMock.mock.calls[0][1].state.focus).toBe('c');
  });

  it('leaves the view alone for the same move made in the sidebar', async () => {
    navigateMock.mockClear();
    routeState.pathname = '/conversation/x';
    wireBackend(trio());
    const { result } = renderHook(() => useSplitGroupMutations());
    await result.current.moveMember('g1', 'c', { kind: 'group', group_id: 'g2' });
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('shows the destination even when the group it left dissolved under the user', async () => {
    navigateMock.mockClear();
    // The user is looking at g1's columns, and the move empties g1 — the
    // survivor navigation must not win over the columns they dropped onto.
    routeState.pathname = '/split/g1';
    wireBackend({
      a: row('a', tag('g1', 0)),
      b: row('b', tag('g1', 1)),
      x: row('x', tag('g2', 0)),
      y: row('y', tag('g2', 1)),
    });
    const { result } = renderHook(() => useSplitGroupMutations());
    await result.current.moveMember('g1', 'b', { kind: 'group', group_id: 'g2' }, { open: true });
    await waitFor(() => expect(navigateMock).toHaveBeenCalledTimes(1));
    expect(navigateMock.mock.calls[0][0]).toBe('/split/g2');
  });

  it('follows a dissolve to its survivor when the caller allows that survivor', async () => {
    navigateMock.mockClear();
    routeState.pathname = '/split/g1';
    wireBackend({ a: row('a', tag('g1', 0)), b: row('b', tag('g1', 1)) });
    const asked: string[] = [];
    const { result } = renderHook(() => useSplitGroupMutations());
    await result.current.leaveOwnGroup('b', {
      moveToSurvivor: (survivor_id, group_id) => {
        asked.push(`${survivor_id}@${group_id}`);
        return true;
      },
    });
    // The caller is asked about the actual survivor and the group it survived, once known.
    expect(asked).toEqual(['a@g1']);
    await waitFor(() => expect(navigateMock).toHaveBeenCalledTimes(1));
    expect(navigateMock.mock.calls[0][0]).toBe('/conversation/a');
  });

  it('stays put when the caller is taking the survivor too', async () => {
    navigateMock.mockClear();
    routeState.pathname = '/split/g1';
    wireBackend({ a: row('a', tag('g1', 0)), b: row('b', tag('g1', 1)) });
    const { result } = renderHook(() => useSplitGroupMutations());
    await expect(result.current.leaveOwnGroup('b', { moveToSurvivor: () => false })).resolves.toBe(true);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('still leaves a dissolved group on its survivor when the drop was in the sidebar', async () => {
    navigateMock.mockClear();
    routeState.pathname = '/split/g1';
    wireBackend({
      a: row('a', tag('g1', 0)),
      b: row('b', tag('g1', 1)),
      x: row('x', tag('g2', 0)),
      y: row('y', tag('g2', 1)),
    });
    const { result } = renderHook(() => useSplitGroupMutations());
    await result.current.moveMember('g1', 'b', { kind: 'group', group_id: 'g2' });
    await waitFor(() => expect(navigateMock).toHaveBeenCalledTimes(1));
    expect(navigateMock.mock.calls[0][0]).toBe('/conversation/a');
  });
});

/**
 * A mutation that throws is not an unhandled rejection. The queue is the one
 * place every mutation passes through, and it turns a throw into a console
 * error, a message on screen, and a `null` result — so a `void`-ed call from a
 * drag handler cannot go quiet or bring the window down.
 */
describe('useSplitGroupMutations: a refused mutation is reported, not dropped', () => {
  const wire = (backend: Backend, complete: boolean) => {
    vi.mocked(getConversationOrNull).mockImplementation(async (id: string) => backend[id] ?? null);
    vi.mocked(ipcBridge.conversation.update.invoke).mockResolvedValue(true);
    vi.mocked(readSplitGroupCensus).mockImplementation(async (group_id: string) => ({
      members: Object.values(backend).filter(
        (item): item is TChatConversation => item !== null && readSplitGroupTag(item)?.id === group_id
      ),
      complete,
    }));
  };

  it('surfaces the failure and resolves, rather than rejecting into the drag handler', async () => {
    messageError.mockClear();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      // An incomplete count refuses the join; the throw happens inside the
      // queue, which is below every call site.
      wire({ a: row('a', tag('g', 0)), b: row('b', tag('g', 1)), z: row('z') }, false);
      const { result } = renderHook(() => useSplitGroupMutations());
      await expect(result.current.addMember('g', 'z')).resolves.toBeUndefined();
      expect(messageError).toHaveBeenCalledWith('conversation.splitGroup.updateFailed');
      expect(error).toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });

  it('answers false for a refused leave, so archiving can stop', async () => {
    messageError.mockClear();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      wire({ a: row('a', tag('g', 0)), b: row('b', tag('g', 1)) }, true);
      vi.mocked(ipcBridge.conversation.update.invoke).mockResolvedValue(false);
      const { result } = renderHook(() => useSplitGroupMutations());
      await expect(result.current.leaveOwnGroup('b')).resolves.toBe(false);
      expect(messageError).toHaveBeenCalledWith('conversation.splitGroup.updateFailed');
    } finally {
      error.mockRestore();
    }
  });

  it('answers true for a conversation that was never in a group', async () => {
    // Every archive is gated on this answer, so a no-op leave that read as a
    // failure would block archiving *every ordinary conversation* — and the
    // archive-path tests could not see it, because they stub this call. The
    // ungrouped arm returns a noop result, not a null one, and a noop is not a
    // refusal.
    wire({ z: row('z') }, true);
    vi.mocked(ipcBridge.conversation.update.invoke).mockClear();
    const { result } = renderHook(() => useSplitGroupMutations());
    await expect(result.current.leaveOwnGroup('z')).resolves.toBe(true);
    // Nothing to write, so nothing is written and the list is not reloaded.
    expect(vi.mocked(ipcBridge.conversation.update.invoke)).not.toHaveBeenCalled();
  });

  it('answers true for a conversation the backend no longer has', async () => {
    wire({}, true);
    const { result } = renderHook(() => useSplitGroupMutations());
    await expect(result.current.leaveOwnGroup('gone')).resolves.toBe(true);
  });

  it('answers true when the leave lands', async () => {
    wire({ a: row('a', tag('g', 0)), b: row('b', tag('g', 1)) }, true);
    vi.mocked(ipcBridge.conversation.update.invoke).mockResolvedValue(true);
    const { result } = renderHook(() => useSplitGroupMutations());
    await expect(result.current.leaveOwnGroup('b')).resolves.toBe(true);
  });
});
