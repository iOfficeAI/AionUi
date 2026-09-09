/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import {
  chatAreaDropId,
  dropActionHighlightsTarget,
  pickRowInGap,
  resolveConversationDropAction,
  resolveDropIntent,
  splitGroupDropId,
} from '@/renderer/pages/conversation/GroupedHistory/utils/conversationDropTargets';
import type { SplitGroup } from '@/renderer/pages/conversation/GroupedHistory/utils/splitGroupHelpers';

const member = (id: string, group: string, order: number): TChatConversation =>
  ({
    id,
    name: id,
    type: 'acp',
    created_at: 1,
    modified_at: 1,
    extra: { split_group: { id: group, order } },
  }) as TChatConversation;

const groups: SplitGroup[] = [{ id: 'g1', members: [member('m1', 'g1', 0), member('m2', 'g1', 1)] }];

describe('resolveDropIntent', () => {
  const row = { targetTop: 100, targetHeight: 40 };

  it('reads the middle of a reorderable row as "onto"', () => {
    expect(resolveDropIntent({ ...row, pointerY: 120, canReorder: true })).toBe('onto');
  });

  it('reads the top and bottom bands of a reorderable row as "between"', () => {
    expect(resolveDropIntent({ ...row, pointerY: 105, canReorder: true })).toBe('before');
    expect(resolveDropIntent({ ...row, pointerY: 135, canReorder: true })).toBe('after');
  });

  it('reads anywhere on a row that cannot be reordered as "onto"', () => {
    expect(resolveDropIntent({ ...row, pointerY: 101, canReorder: false })).toBe('onto');
    expect(resolveDropIntent({ ...row, pointerY: 139, canReorder: false })).toBe('onto');
  });

  it('reads a release in the gap beside a target as "between", whatever the target and whether it can be reordered', () => {
    // Above the target's middle is "before" it, below is "after" — the
    // collision picked the nearer row, so the pointer is just outside it.
    expect(resolveDropIntent({ pointerY: 96, targetTop: 100, targetHeight: 34, canReorder: false, inGap: true })).toBe(
      'before'
    );
    expect(resolveDropIntent({ pointerY: 140, targetTop: 100, targetHeight: 34, canReorder: false, inGap: true })).toBe(
      'after'
    );
  });

  it('never divides by a zero height', () => {
    expect(resolveDropIntent({ targetTop: 0, targetHeight: 0, pointerY: 0, canReorder: true })).toBe('onto');
  });
});

const row = (conversation_id: string) => ({
  kind: 'conversation' as const,
  conversation_id,
  surface: 'row' as const,
});
const chat = (conversation_id: string) => ({
  kind: 'conversation' as const,
  conversation_id,
  surface: 'chat' as const,
});

describe('resolveConversationDropAction', () => {
  it('fuses two plain rows when dropped onto', () => {
    expect(
      resolveConversationDropAction({ dragged_id: 'a', target: row('b'), intent: 'onto', groups, pinnedIds: [] })
    ).toEqual({ type: 'create-group', target_id: 'b', dragged_id: 'a' });
  });

  it('keeps the pinned reorder when dropped between two pinned rows', () => {
    expect(
      resolveConversationDropAction({
        dragged_id: 'a',
        target: row('b'),
        intent: 'after',
        groups,
        pinnedIds: ['a', 'b'],
      })
    ).toEqual({ type: 'reorder-pinned', active_id: 'a', over_id: 'b' });
  });

  it('does nothing when dropped between rows that cannot be reordered', () => {
    expect(
      resolveConversationDropAction({ dragged_id: 'a', target: row('b'), intent: 'before', groups, pinnedIds: ['b'] })
    ).toEqual({ type: 'none', reason: 'between' });
  });

  it('never reorders from a drop on the chat area', () => {
    expect(
      resolveConversationDropAction({
        dragged_id: 'a',
        target: chat('b'),
        intent: 'after',
        groups,
        pinnedIds: ['a', 'b'],
      })
    ).toEqual({ type: 'none', reason: 'between' });
  });

  it('fuses with a single open conversation dropped on in the chat area', () => {
    expect(
      resolveConversationDropAction({ dragged_id: 'a', target: chat('b'), intent: 'onto', groups, pinnedIds: [] })
    ).toEqual({ type: 'create-group', target_id: 'b', dragged_id: 'a' });
  });

  it('adds to the group when dropped on a pill', () => {
    expect(
      resolveConversationDropAction({
        dragged_id: 'a',
        target: { kind: 'split_group', group_id: 'g1' },
        intent: 'onto',
        groups,
        pinnedIds: [],
      })
    ).toEqual({ type: 'add-member', group_id: 'g1', dragged_id: 'a' });
  });

  it('adds to the group when dropped on one of its columns, whatever the band', () => {
    expect(
      resolveConversationDropAction({ dragged_id: 'a', target: chat('m2'), intent: 'after', groups, pinnedIds: [] })
    ).toEqual({ type: 'add-member', group_id: 'g1', dragged_id: 'a' });
  });

  it('ignores a drop on itself', () => {
    expect(
      resolveConversationDropAction({ dragged_id: 'a', target: row('a'), intent: 'onto', groups, pinnedIds: [] })
    ).toEqual({ type: 'none', reason: 'self' });
  });

  it('does nothing when a member is dropped back onto its own block', () => {
    expect(
      resolveConversationDropAction({
        dragged_id: 'm1',
        target: { kind: 'split_group', group_id: 'g1' },
        intent: 'onto',
        groups,
        pinnedIds: [],
      })
    ).toEqual({ type: 'none', reason: 'self' });
  });

  it('does nothing when a member is dropped onto one of its own peers', () => {
    expect(
      resolveConversationDropAction({ dragged_id: 'm1', target: row('m2'), intent: 'onto', groups, pinnedIds: [] })
    ).toEqual({ type: 'none', reason: 'self' });
  });

  it('takes a member out of its group when it lands on nothing', () => {
    expect(
      resolveConversationDropAction({ dragged_id: 'm1', target: null, intent: 'onto', groups, pinnedIds: [] })
    ).toEqual({ type: 'remove-member', group_id: 'g1', dragged_id: 'm1' });
  });

  it('takes a member out of its group when it lands between two rows', () => {
    expect(
      resolveConversationDropAction({ dragged_id: 'm1', target: row('z'), intent: 'before', groups, pinnedIds: [] })
    ).toEqual({ type: 'remove-member', group_id: 'g1', dragged_id: 'm1' });
  });

  it('takes a member out of its group when it lands in the gap beside an unpinned row', () => {
    // Nothing here can be reordered, so the old code read the gap as "onto"
    // and moved the member onto the row it was merely beside.
    expect(
      resolveConversationDropAction({
        dragged_id: 'm1',
        target: row('z'),
        intent: 'onto',
        inGap: true,
        groups,
        pinnedIds: [],
      })
    ).toEqual({ type: 'remove-member', group_id: 'g1', dragged_id: 'm1' });
  });

  it('takes a member out of its group when it lands in the gap beside another block', () => {
    const two: SplitGroup[] = [...groups, { id: 'g2', members: [member('n1', 'g2', 0), member('n2', 'g2', 1)] }];
    expect(
      resolveConversationDropAction({
        dragged_id: 'm1',
        target: { kind: 'split_group', group_id: 'g2' },
        intent: 'before',
        inGap: true,
        groups: two,
        pinnedIds: [],
      })
    ).toEqual({ type: 'remove-member', group_id: 'g1', dragged_id: 'm1' });
    // Beside a member of that block means the same thing.
    expect(
      resolveConversationDropAction({
        dragged_id: 'm1',
        target: row('n2'),
        intent: 'after',
        inGap: true,
        groups: two,
        pinnedIds: [],
      })
    ).toEqual({ type: 'remove-member', group_id: 'g1', dragged_id: 'm1' });
    // And beside its own block: still out, not "self".
    expect(
      resolveConversationDropAction({
        dragged_id: 'm1',
        target: { kind: 'split_group', group_id: 'g1' },
        intent: 'after',
        inGap: true,
        groups: two,
        pinnedIds: [],
      })
    ).toEqual({ type: 'remove-member', group_id: 'g1', dragged_id: 'm1' });
  });

  it('takes a member out of its group when it lands in a "between" band of any row, grouped or not', () => {
    // A dragged member has bands on every row: the 2px gap alone is too
    // narrow to be the only way out of a group.
    expect(
      resolveConversationDropAction({ dragged_id: 'm1', target: row('z'), intent: 'before', groups, pinnedIds: [] })
    ).toEqual({ type: 'remove-member', group_id: 'g1', dragged_id: 'm1' });
    const two: SplitGroup[] = [...groups, { id: 'g2', members: [member('n1', 'g2', 0), member('n2', 'g2', 1)] }];
    expect(
      resolveConversationDropAction({
        dragged_id: 'm1',
        target: row('n2'),
        intent: 'after',
        groups: two,
        pinnedIds: [],
      })
    ).toEqual({ type: 'remove-member', group_id: 'g1', dragged_id: 'm1' });
  });

  it('does nothing with a plain row released in the gap beside a block or beside one of its members', () => {
    expect(
      resolveConversationDropAction({
        dragged_id: 'a',
        target: { kind: 'split_group', group_id: 'g1' },
        intent: 'after',
        inGap: true,
        groups,
        pinnedIds: [],
      })
    ).toEqual({ type: 'none', reason: 'between' });
    expect(
      resolveConversationDropAction({
        dragged_id: 'a',
        target: row('m2'),
        intent: 'before',
        inGap: true,
        groups,
        pinnedIds: [],
      })
    ).toEqual({ type: 'none', reason: 'between' });
  });

  it('moves a member onto a plain row it is dropped on', () => {
    expect(
      resolveConversationDropAction({ dragged_id: 'm1', target: row('z'), intent: 'onto', groups, pinnedIds: [] })
    ).toEqual({
      type: 'move-member',
      from_group_id: 'g1',
      dragged_id: 'm1',
      to: { kind: 'conversation', conversation_id: 'z' },
    });
  });

  it('moves a member onto another group it is dropped on', () => {
    const two: SplitGroup[] = [...groups, { id: 'g2', members: [member('n1', 'g2', 0), member('n2', 'g2', 1)] }];
    expect(
      resolveConversationDropAction({
        dragged_id: 'm1',
        target: { kind: 'split_group', group_id: 'g2' },
        intent: 'onto',
        groups: two,
        pinnedIds: [],
      })
    ).toEqual({
      type: 'move-member',
      from_group_id: 'g1',
      dragged_id: 'm1',
      to: { kind: 'group', group_id: 'g2' },
    });
    // Landing on a member of the other group means the same thing.
    expect(
      resolveConversationDropAction({ dragged_id: 'm1', target: row('n2'), intent: 'onto', groups: two, pinnedIds: [] })
    ).toEqual({
      type: 'move-member',
      from_group_id: 'g1',
      dragged_id: 'm1',
      to: { kind: 'group', group_id: 'g2' },
    });
  });

  it('leaves a plain row alone when it lands on nothing', () => {
    expect(
      resolveConversationDropAction({ dragged_id: 'a', target: null, intent: 'onto', groups, pinnedIds: [] })
    ).toEqual({ type: 'none', reason: 'nowhere' });
  });

  it('ignores a pill that no longer exists', () => {
    expect(
      resolveConversationDropAction({
        dragged_id: 'a',
        target: { kind: 'split_group', group_id: 'gone' },
        intent: 'onto',
        groups,
        pinnedIds: [],
      })
    ).toEqual({ type: 'none', reason: 'unknown-group' });
  });
});

describe('dropActionHighlightsTarget', () => {
  it('lights the target only for an action that would use it', () => {
    expect(dropActionHighlightsTarget({ type: 'create-group', target_id: 'z', dragged_id: 'a' })).toBe(true);
    expect(dropActionHighlightsTarget({ type: 'add-member', group_id: 'g1', dragged_id: 'a' })).toBe(true);
    expect(
      dropActionHighlightsTarget({
        type: 'move-member',
        from_group_id: 'g1',
        dragged_id: 'm1',
        to: { kind: 'conversation', conversation_id: 'z' },
      })
    ).toBe(true);
    expect(dropActionHighlightsTarget({ type: 'reorder-pinned', active_id: 'a', over_id: 'b' })).toBe(true);
  });

  it('lights nothing while a member is leaving, or while a release would do nothing', () => {
    // Beside a block, the block must not say "drop here" while the ghost says "take it out".
    expect(dropActionHighlightsTarget({ type: 'remove-member', group_id: 'g1', dragged_id: 'm1' })).toBe(false);
    expect(dropActionHighlightsTarget({ type: 'none', reason: 'between' })).toBe(false);
    expect(dropActionHighlightsTarget({ type: 'none', reason: 'self' })).toBe(false);
  });
});

describe('droppable ids', () => {
  it('keeps pill and chat-area ids apart from conversation row ids', () => {
    expect(splitGroupDropId('g1')).not.toBe('g1');
    expect(chatAreaDropId('c1')).not.toBe('c1');
    expect(chatAreaDropId('c1')).not.toBe(splitGroupDropId('c1'));
  });
});

describe('pickRowInGap', () => {
  const rows = [
    { id: 'a', top: 100, height: 34, left: 10, width: 200 },
    { id: 'b', top: 136, height: 34, left: 10, width: 200 },
    { id: 'c', top: 172, height: 34, left: 10, width: 200 },
  ];

  it('picks the nearer of the two rows bracketing the gap', () => {
    expect(pickRowInGap({ x: 50, y: 135 }, rows)).toBe('a');
    expect(pickRowInGap({ x: 50, y: 135.5 }, rows)).toBe('b');
    expect(pickRowInGap({ x: 50, y: 171 }, rows)).toBe('b');
  });

  it('returns nothing just below the last row: that is blank space, not a gap', () => {
    expect(pickRowInGap({ x: 50, y: 207 }, rows)).toBeNull();
    expect(pickRowInGap({ x: 50, y: 213 }, rows)).toBeNull();
  });

  it('returns nothing just above the first row', () => {
    expect(pickRowInGap({ x: 50, y: 98 }, rows)).toBeNull();
  });

  it('returns nothing in a space wider than a row gap (a section break)', () => {
    const spaced = [rows[0], { id: 'z', top: 200, height: 34, left: 10, width: 200 }];
    expect(pickRowInGap({ x: 50, y: 160 }, spaced)).toBeNull();
  });

  it('returns nothing beside the list, however close vertically', () => {
    expect(pickRowInGap({ x: 400, y: 135 }, rows)).toBeNull();
  });

  it('returns nothing with no rows', () => {
    expect(pickRowInGap({ x: 50, y: 135 }, [])).toBeNull();
  });
});
