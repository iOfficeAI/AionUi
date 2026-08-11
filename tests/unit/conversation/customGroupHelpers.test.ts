/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { SidebarCustomGroup } from '@/common/types/sidebar';
import {
  MOVE_TO_GROUP_PREFIX,
  createCustomGroup,
  deleteCustomGroup,
  findGroupForItem,
  isItemInAnyGroup,
  makeGroupItemId,
  makeMoveToGroupKey,
  moveItemToGroup,
  moveItemToGroupAt,
  normalizeCustomGroups,
  parseGroupItemId,
  parseMoveToGroupKey,
  renameCustomGroup,
  reorderGroupItems,
  reorderGroups,
  toggleGroupCollapsed,
} from '@/renderer/pages/conversation/GroupedHistory/utils/customGroupHelpers';

const group = (id: string, name: string, itemIds: string[] = [], collapsed = false): SidebarCustomGroup => ({
  id,
  name,
  itemIds,
  collapsed,
});

describe('customGroupHelpers - item id encoding', () => {
  it('round-trips conversation and team ids', () => {
    expect(parseGroupItemId(makeGroupItemId('conversation', 'abc-123'))).toEqual({
      kind: 'conversation',
      id: 'abc-123',
    });
    expect(parseGroupItemId(makeGroupItemId('team', 'team-9'))).toEqual({ kind: 'team', id: 'team-9' });
  });

  it('returns null for unknown kinds and malformed ids', () => {
    expect(parseGroupItemId('bogus:abc')).toBeNull();
    expect(parseGroupItemId('conversation:')).toBeNull();
    expect(parseGroupItemId('')).toBeNull();
  });
});

describe('customGroupHelpers - CRUD', () => {
  it('creates a group with a stable id and empty items', () => {
    const created = createCustomGroup('Work');
    expect(created.name).toBe('Work');
    expect(created.itemIds).toEqual([]);
    expect(created.collapsed).toBe(false);
    expect(createCustomGroup('Work', 'fixed-id').id).toBe('fixed-id');
  });

  it('falls back to "Untitled group" for a blank name', () => {
    expect(createCustomGroup('   ').name).toBe('Untitled group');
  });

  it('renames a group', () => {
    const groups = [group('a', 'Old')];
    expect(renameCustomGroup(groups, 'a', 'New')[0].name).toBe('New');
    // Unknown group: unchanged, no crash.
    expect(renameCustomGroup(groups, 'nope', 'New')).toEqual(groups);
    // Blank name: unchanged, no crash.
    expect(renameCustomGroup(groups, 'a', '   ')).toEqual(groups);
  });

  it('deletes a group and keeps the rest', () => {
    const groups = [group('a', 'A', ['conversation:1']), group('b', 'B')];
    const next = deleteCustomGroup(groups, 'a');
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe('b');
  });

  it('toggles collapsed', () => {
    const groups = [group('a', 'A')];
    expect(toggleGroupCollapsed(groups, 'a')[0].collapsed).toBe(true);
    expect(toggleGroupCollapsed(groups, 'a')[0].collapsed).toBe(true);
  });

  it('leaves unrelated groups untouched when toggling collapsed', () => {
    const groups = [group('a', 'A'), group('b', 'B', [], true)];
    const next = toggleGroupCollapsed(groups, 'a');
    expect(next[0].collapsed).toBe(true);
    expect(next[1].collapsed).toBe(true);
  });
});

describe('customGroupHelpers - membership', () => {
  const groups = [group('a', 'A', ['conversation:1']), group('b', 'B')];

  it('detects group membership by kind', () => {
    expect(isItemInAnyGroup(groups, 'conversation', '1')).toBe(true);
    expect(isItemInAnyGroup(groups, 'conversation', '2')).toBe(false);
    expect(isItemInAnyGroup(groups, 'team', '1')).toBe(false);
  });

  it('finds the group holding an item', () => {
    expect(findGroupForItem(groups, 'conversation', '1')).toBe('a');
    expect(findGroupForItem(groups, 'conversation', '2')).toBeNull();
    expect(findGroupForItem(groups, 'team', '1')).toBeNull();
  });
});

describe('customGroupHelpers - moving items', () => {
  it('moves an item into a group (appended)', () => {
    const groups = [group('a', 'A', ['conversation:1'])];
    const next = moveItemToGroup(groups, 'conversation', '2', 'a');
    expect(next[0].itemIds).toEqual(['conversation:1', 'conversation:2']);
  });

  it('moving to an unknown group is a no-op', () => {
    const groups = [group('a', 'A', ['conversation:1'])];
    expect(moveItemToGroup(groups, 'conversation', '2', 'nope')).toEqual(groups);
  });

  it('moves an item across groups (no duplicates)', () => {
    const groups = [group('a', 'A', ['conversation:1']), group('b', 'B', ['conversation:2'])];
    const next = moveItemToGroup(groups, 'conversation', '1', 'b');
    expect(next[0].itemIds).toEqual([]);
    expect(next[1].itemIds).toEqual(['conversation:2', 'conversation:1']);
  });

  it('removes an item from all groups with a null target', () => {
    const groups = [group('a', 'A', ['conversation:1']), group('b', 'B', ['conversation:1', 'conversation:2'])];
    const next = moveItemToGroup(groups, 'conversation', '1', null);
    expect(next[0].itemIds).toEqual([]);
    expect(next[1].itemIds).toEqual(['conversation:2']);
  });

  it('moveItemToGroupAt inserts at the requested index', () => {
    const groups = [group('a', 'A', ['conversation:1']), group('b', 'B', ['conversation:3'])];
    const next = moveItemToGroupAt(groups, 'conversation', '2', 'b', 0);
    expect(next[1].itemIds).toEqual(['conversation:2', 'conversation:3']);
  });

  it('moveItemToGroupAt clamps out-of-range indices', () => {
    const groups = [group('b', 'B', ['conversation:3'])];
    expect(moveItemToGroupAt(groups, 'conversation', '2', 'b', 99)[0].itemIds).toEqual([
      'conversation:3',
      'conversation:2',
    ]);
    expect(moveItemToGroupAt(groups, 'conversation', '2', 'b', -5)[0].itemIds).toEqual([
      'conversation:2',
      'conversation:3',
    ]);
  });

  it('moveItemToGroupAt removes the item from its source group first', () => {
    const groups = [group('a', 'A', ['conversation:1']), group('b', 'B', ['conversation:3'])];
    const next = moveItemToGroupAt(groups, 'conversation', '1', 'b', 1);
    expect(next[0].itemIds).toEqual([]);
    expect(next[1].itemIds).toEqual(['conversation:3', 'conversation:1']);
  });

  it('moveItemToGroupAt with a null target removes the item everywhere', () => {
    const groups = [group('a', 'A', ['conversation:1']), group('b', 'B', ['conversation:1', 'conversation:2'])];
    const next = moveItemToGroupAt(groups, 'conversation', '1', null, 0);
    expect(next[0].itemIds).toEqual([]);
    expect(next[1].itemIds).toEqual(['conversation:2']);
  });
});

describe('customGroupHelpers - ordering', () => {
  it('reorders items within a group', () => {
    const groups = [group('a', 'A', ['conversation:1', 'conversation:2', 'conversation:3'])];
    const next = reorderGroupItems(groups, 'a', ['conversation:3', 'conversation:1', 'conversation:2']);
    expect(next[0].itemIds).toEqual(['conversation:3', 'conversation:1', 'conversation:2']);
  });

  it('reorderGroupItems leaves other groups untouched', () => {
    const groups = [group('a', 'A', ['conversation:1']), group('b', 'B', ['conversation:2'])];
    const next = reorderGroupItems(groups, 'nope', ['conversation:9']);
    expect(next).toEqual(groups);
  });

  it('reorders the group list', () => {
    const groups = [group('a', 'A'), group('b', 'B'), group('c', 'C')];
    const next = reorderGroups(groups, ['c', 'a', 'b']);
    expect(next.map((g) => g.id)).toEqual(['c', 'a', 'b']);
  });

  it('reorderGroups skips unknown ids and appends leftovers', () => {
    const groups = [group('a', 'A'), group('b', 'B'), group('c', 'C')];
    expect(reorderGroups(groups, ['nope', 'c']).map((g) => g.id)).toEqual(['c', 'a', 'b']);
    expect(reorderGroups(groups, ['a']).map((g) => g.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('customGroupHelpers - normalization', () => {
  it('normalizes malformed input', () => {
    const raw = [
      { id: 'a', name: 'A', itemIds: ['conversation:1', 'conversation:1'], collapsed: true },
      { id: 'a', name: 'Duplicate', itemIds: [] },
      { id: '', name: 'NoId', itemIds: [] },
    ] as unknown as SidebarCustomGroup[];
    const next = normalizeCustomGroups(raw);
    expect(next).toHaveLength(1);
    expect(next[0].name).toBe('A');
    expect(next[0].itemIds).toEqual(['conversation:1']);
  });

  it('normalizes entries with blank names, non-array/non-string/unparsable item ids', () => {
    const raw = [
      42,
      null,
      { id: 'b', name: '   ', itemIds: [] },
      { id: 'c', name: 'C', itemIds: 'not-an-array' },
      { id: 'd', name: 'D', itemIds: [42] },
      { id: 'e', name: 'E', itemIds: ['bogus:'] },
      { id: 'f', name: 'F', itemIds: ['conversation:7'] },
    ] as unknown as SidebarCustomGroup[];
    const next = normalizeCustomGroups(raw);
    expect(next).toHaveLength(4);
    expect(next.map((g) => g.id)).toEqual(['c', 'd', 'e', 'f']);
    expect(next[0]).toMatchObject({ name: 'C', itemIds: [] });
    expect(next[3]).toMatchObject({ id: 'f', name: 'F', itemIds: ['conversation:7'] });
  });

  it('returns an empty list for undefined', () => {
    expect(normalizeCustomGroups(undefined)).toEqual([]);
  });
});

describe('customGroupHelpers - move-to-group menu keys', () => {
  it('builds and parses menu keys', () => {
    expect(makeMoveToGroupKey('g1')).toBe(`${MOVE_TO_GROUP_PREFIX}g1`);
    expect(makeMoveToGroupKey(null)).toBe(MOVE_TO_GROUP_PREFIX);
    expect(parseMoveToGroupKey(`${MOVE_TO_GROUP_PREFIX}g1`)).toBe('g1');
    expect(parseMoveToGroupKey(MOVE_TO_GROUP_PREFIX)).toBeNull();
    expect(parseMoveToGroupKey('pin')).toBeNull();
  });
});
