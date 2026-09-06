/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import {
  buildSplitGroups,
  findSplitGroupOf,
  normalizeSplitGroupName,
  placeSplitGroupPills,
  planAddSplitGroupMember,
  planCreateSplitGroup,
  planRemoveSplitGroupMember,
  readSplitGroupTag,
  resetSplitGroupWarningsForTest,
  SPLIT_GROUP_NAME_MAX,
} from '@/renderer/pages/conversation/GroupedHistory/utils/splitGroupHelpers';

const conversation = (id: string, extra: Record<string, unknown> = {}): TChatConversation =>
  ({ id, name: id, type: 'acp', created_at: 1, modified_at: 1, extra }) as TChatConversation;

const member = (id: string, group: string, order: number): TChatConversation =>
  conversation(id, { split_group: { id: group, order } });

const named = (id: string, group: string, order: number, name?: string): TChatConversation =>
  conversation(id, { split_group: name === undefined ? { id: group, order } : { id: group, order, name } });

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetSplitGroupWarningsForTest();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

describe('readSplitGroupTag', () => {
  it('reads a well-formed tag', () => {
    expect(readSplitGroupTag(member('a', 'g1', 2))).toEqual({ id: 'g1', order: 2 });
  });

  it('treats a missing or null tag as not grouped', () => {
    expect(readSplitGroupTag(conversation('a'))).toBeNull();
    expect(readSplitGroupTag(conversation('a', { split_group: null }))).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ['a string', 'g1'],
    ['an empty id', { id: '', order: 0 }],
    ['a non-numeric order', { id: 'g1', order: '0' }],
    ['a NaN order', { id: 'g1', order: Number.NaN }],
    ['no order', { id: 'g1' }],
  ])('ignores a malformed tag (%s) and warns once', (_label, split_group) => {
    const row = conversation('a', { split_group });
    expect(readSplitGroupTag(row)).toBeNull();
    expect(readSplitGroupTag(row)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('buildSplitGroups', () => {
  it('groups tagged conversations and orders members by their column order', () => {
    const groups = buildSplitGroups([
      member('b', 'g1', 1),
      conversation('x'),
      member('a', 'g1', 0),
      member('c', 'g1', 2),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe('g1');
    expect(groups[0].members.map((row) => row.id)).toEqual(['a', 'b', 'c']);
  });

  it('breaks an order tie by conversation id so the layout is stable', () => {
    const groups = buildSplitGroups([member('b', 'g1', 0), member('a', 'g1', 0)]);
    expect(groups[0].members.map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('drops a group whose other member is gone and warns once, leaving a plain row', () => {
    const rows = [member('a', 'g1', 0), conversation('x')];
    expect(buildSplitGroups(rows)).toEqual([]);
    expect(buildSplitGroups(rows)).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('g1');
  });

  it('keeps unrelated groups apart', () => {
    const groups = buildSplitGroups([
      member('a', 'g1', 0),
      member('b', 'g2', 0),
      member('c', 'g1', 1),
      member('d', 'g2', 1),
    ]);
    expect(groups.map((group) => [group.id, group.members.map((row) => row.id)])).toEqual([
      ['g1', ['a', 'c']],
      ['g2', ['b', 'd']],
    ]);
  });

  it('does not let a malformed tag on one row break the others', () => {
    const groups = buildSplitGroups([
      member('a', 'g1', 0),
      conversation('bad', { split_group: 42 }),
      member('b', 'g1', 1),
    ]);
    expect(groups[0].members.map((row) => row.id)).toEqual(['a', 'b']);
  });
});

describe('placeSplitGroupPills', () => {
  const group = { id: 'g1', members: [member('b', 'g1', 0), member('c', 'g1', 1)] };

  it('puts the pill where the first member sits in render order and hides the rest', () => {
    const placement = placeSplitGroupPills(['a', 'c', 'b', 'd'], [group]);
    expect([...placement.pillByLeaderId.keys()]).toEqual(['c']);
    expect([...placement.hiddenIds]).toEqual(['b']);
  });

  it('does not hide a member that is not rendered at all', () => {
    const placement = placeSplitGroupPills(['a', 'b'], [group]);
    expect([...placement.pillByLeaderId.keys()]).toEqual(['b']);
    expect(placement.hiddenIds.size).toBe(0);
  });

  it('places nothing for a group with no member on screen', () => {
    const placement = placeSplitGroupPills(['a', 'd'], [group]);
    expect(placement.pillByLeaderId.size).toBe(0);
    expect(placement.hiddenIds.size).toBe(0);
  });
});

describe('planCreateSplitGroup', () => {
  it('tags the drop target as the first column and the dragged row as the second', () => {
    expect(planCreateSplitGroup('target', 'dragged', 'g9')).toEqual([
      { conversation_id: 'target', split_group: { id: 'g9', order: 0 } },
      { conversation_id: 'dragged', split_group: { id: 'g9', order: 1 } },
    ]);
  });

  it('mints a fresh id per group', () => {
    const first = planCreateSplitGroup('a', 'b')[0].split_group?.id;
    const second = planCreateSplitGroup('a', 'b')[0].split_group?.id;
    expect(first).toBeTruthy();
    expect(first).not.toBe(second);
  });
});

describe('planAddSplitGroupMember', () => {
  const group = { id: 'g1', members: [member('a', 'g1', 0), member('b', 'g1', 5)] };

  it('appends after the highest existing column order, even with gaps', () => {
    expect(planAddSplitGroupMember(group, 'c')).toEqual([
      { conversation_id: 'c', split_group: { id: 'g1', order: 6 } },
    ]);
  });

  it('is a no-op for a conversation already in the group', () => {
    expect(planAddSplitGroupMember(group, 'b')).toEqual([]);
  });
});

describe('planRemoveSplitGroupMember', () => {
  const trio = { id: 'g1', members: [member('a', 'g1', 0), member('b', 'g1', 1), member('c', 'g1', 2)] };
  const pair = { id: 'g1', members: [member('a', 'g1', 0), member('b', 'g1', 1)] };

  it('clears only the removed member while two or more remain', () => {
    expect(planRemoveSplitGroupMember(trio, 'b')).toEqual({
      patches: [{ conversation_id: 'b', split_group: null }],
      dissolved: false,
      remaining: ['a', 'c'],
    });
  });

  it('dissolves the group when one member would remain, clearing both tags', () => {
    expect(planRemoveSplitGroupMember(pair, 'b')).toEqual({
      patches: [
        { conversation_id: 'b', split_group: null },
        { conversation_id: 'a', split_group: null },
      ],
      dissolved: true,
      remaining: ['a'],
    });
  });

  it('changes nothing for a conversation that is not a member', () => {
    expect(planRemoveSplitGroupMember(pair, 'zzz')).toEqual({
      patches: [],
      dissolved: false,
      remaining: ['a', 'b'],
    });
  });
});

describe('findSplitGroupOf', () => {
  it('finds the group a conversation belongs to, or nothing', () => {
    const groups = buildSplitGroups([member('a', 'g1', 0), member('b', 'g1', 1)]);
    expect(findSplitGroupOf(groups, 'b')?.id).toBe('g1');
    expect(findSplitGroupOf(groups, 'x')).toBeUndefined();
  });
});

describe('split-group names', () => {
  it('derives the name from the first member by order, not by list position', () => {
    const [group] = buildSplitGroups([
      named('b', 'g', 1, 'Ignored'),
      named('a', 'g', 0, 'Research'),
      named('c', 'g', 2, 'Also ignored'),
    ]);
    expect(group.name).toBe('Research');
  });

  it('leaves the name absent when the first member carries none', () => {
    const [group] = buildSplitGroups([named('a', 'g', 0), named('b', 'g', 1, 'Research')]);
    expect(group.name).toBeUndefined();
  });

  it('treats a malformed or over-long name as absent without losing the group', () => {
    const broken = [
      { ...named('a', 'g', 0), extra: { split_group: { id: 'g', order: 0, name: 42 } } },
      { ...named('b', 'g', 1), extra: { split_group: { id: 'g', order: 1, name: 'x'.repeat(61) } } },
    ] as unknown as TChatConversation[];
    const [group] = buildSplitGroups(broken);
    expect(group.members).toHaveLength(2);
    expect(group.name).toBeUndefined();
    expect(readSplitGroupTag(broken[1])).toEqual({ id: 'g', order: 1 });
  });

  it('trims a name and drops one that is only whitespace', () => {
    expect(normalizeSplitGroupName('  Research  ')).toBe('Research');
    expect(normalizeSplitGroupName('   ')).toBeUndefined();
    expect(normalizeSplitGroupName('')).toBeUndefined();
    expect(normalizeSplitGroupName(null)).toBeUndefined();
    expect(normalizeSplitGroupName('x'.repeat(80))).toHaveLength(SPLIT_GROUP_NAME_MAX);
  });

  it('copies the name onto a conversation joining the group', () => {
    const group = buildSplitGroups([named('a', 'g', 0, 'Research'), named('b', 'g', 1, 'Research')])[0];
    expect(planAddSplitGroupMember(group, 'z')).toEqual([
      { conversation_id: 'z', split_group: { id: 'g', order: 2, name: 'Research' } },
    ]);
  });

  it('leaves the name out of the tag entirely when there is none', () => {
    const group = buildSplitGroups([named('a', 'g', 0), named('b', 'g', 1)])[0];
    expect(planAddSplitGroupMember(group, 'z')).toEqual([{ conversation_id: 'z', split_group: { id: 'g', order: 2 } }]);
  });
});
