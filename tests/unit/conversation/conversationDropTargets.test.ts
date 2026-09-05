/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import {
  chatAreaDropId,
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

  it('never divides by a zero height', () => {
    expect(resolveDropIntent({ targetTop: 0, targetHeight: 0, pointerY: 0, canReorder: true })).toBe('onto');
  });
});

describe('resolveConversationDropAction', () => {
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

  it('ignores a drop onto a group the row already belongs to', () => {
    expect(
      resolveConversationDropAction({
        dragged_id: 'm1',
        target: { kind: 'split_group', group_id: 'g1' },
        intent: 'onto',
        groups,
        pinnedIds: [],
      })
    ).toEqual({ type: 'none', reason: 'dragged-grouped' });
  });

  it('refuses to move a grouped conversation into another group', () => {
    expect(
      resolveConversationDropAction({ dragged_id: 'm1', target: row('z'), intent: 'onto', groups, pinnedIds: [] })
    ).toEqual({ type: 'none', reason: 'dragged-grouped' });
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

describe('droppable ids', () => {
  it('keeps pill and chat-area ids apart from conversation row ids', () => {
    expect(splitGroupDropId('g1')).not.toBe('g1');
    expect(chatAreaDropId('c1')).not.toBe('c1');
    expect(chatAreaDropId('c1')).not.toBe(splitGroupDropId('c1'));
  });
});
