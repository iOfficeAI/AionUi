/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Who a split group's members are, read from the backend. The active list
 * (`GET /api/conversations`) drops archived rows while they keep their tag, so
 * a census that asked only that list would count a group short and dissolve it
 * over a member it simply could not see.
 */

import { describe, expect, it, vi } from 'vitest';

const getUserConversations = vi.fn();
const sidebarGet = vi.fn();
const sidebarItems = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    database: { getUserConversations: { invoke: (...args: unknown[]) => getUserConversations(...args) } },
    sidebar: {
      get: { invoke: (...args: unknown[]) => sidebarGet(...args) },
      items: { invoke: (...args: unknown[]) => sidebarItems(...args) },
    },
  },
}));

import type { TChatConversation } from '@/common/config/storage';
import { readSplitGroupCensus } from '@/renderer/pages/conversation/GroupedHistory/utils/splitGroupCensus';

const row = (id: string, group_id?: string, order = 0): TChatConversation =>
  ({
    id,
    name: id,
    type: 'acp',
    created_at: 1,
    modified_at: 1,
    extra: { split_group: group_id ? { id: group_id, order } : null },
  }) as TChatConversation;

const conversationItem = (conversation: TChatConversation) => ({ type: 'conversation' as const, conversation });

const noArchive = { groups: [], has_more_groups: false };

describe('readSplitGroupCensus', () => {
  it('counts an archived member the active list no longer returns', async () => {
    getUserConversations.mockResolvedValue({ items: [row('a', 'g', 0), row('c', 'g', 2)], total: 2, has_more: false });
    sidebarGet.mockResolvedValue({
      groups: [{ scope: { type: 'chats' }, items: [conversationItem(row('b', 'g', 1))], has_more: false }],
      has_more_groups: false,
    });

    const census = await readSplitGroupCensus('g');

    expect(census.members.map((member) => member.id).toSorted()).toEqual(['a', 'b', 'c']);
    expect(census.complete).toBe(true);
  });

  it('leaves out conversations carrying another group tag, or none', async () => {
    getUserConversations.mockResolvedValue({
      items: [row('a', 'g'), row('b', 'other'), row('c')],
      total: 3,
      has_more: false,
    });
    sidebarGet.mockResolvedValue(noArchive);

    expect((await readSplitGroupCensus('g')).members.map((member) => member.id)).toEqual(['a']);
  });

  it('follows the archive cursor to the end of a group', async () => {
    getUserConversations.mockResolvedValue({ items: [], total: 0, has_more: false });
    sidebarGet.mockResolvedValue({
      groups: [
        {
          scope: { type: 'project', project_id: 'p1', name: 'P' },
          items: [conversationItem(row('a', 'g', 0))],
          has_more: true,
          next_cursor: 'cursor-1',
        },
      ],
      has_more_groups: false,
    });
    sidebarItems.mockResolvedValue({ items: [conversationItem(row('b', 'g', 1))], has_more: false });

    const census = await readSplitGroupCensus('g');

    expect(sidebarItems).toHaveBeenCalledWith({
      scope: 'project:p1',
      cursor: 'cursor-1',
      limit: 100,
      archived: true,
    });
    expect(census.members.map((member) => member.id)).toEqual(['a', 'b']);
    expect(census.complete).toBe(true);
  });

  it('reports an incomplete read when a slice is cut off, so no count is trusted', async () => {
    getUserConversations.mockResolvedValue({ items: [row('a', 'g')], total: 1, has_more: true });
    sidebarGet.mockResolvedValue(noArchive);
    expect((await readSplitGroupCensus('g')).complete).toBe(false);

    getUserConversations.mockResolvedValue({ items: [row('a', 'g')], total: 1, has_more: false });
    sidebarGet.mockResolvedValue({ groups: [], has_more_groups: true });
    expect((await readSplitGroupCensus('g')).complete).toBe(false);
  });

  it('propagates a failed active read instead of reporting an empty group', async () => {
    getUserConversations.mockRejectedValue(new Error('list offline'));
    sidebarGet.mockResolvedValue(noArchive);
    await expect(readSplitGroupCensus('g')).rejects.toThrow('list offline');
  });

  it('keeps counting the active members when the archive will not answer, but never calls it complete', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      getUserConversations.mockResolvedValue({ items: [row('a', 'g')], total: 1, has_more: false });
      sidebarGet.mockRejectedValue(new Error('archive offline'));
      const census = await readSplitGroupCensus('g');
      expect(census.members.map((member) => member.id)).toEqual(['a']);
      expect(census.complete).toBe(false);
    } finally {
      error.mockRestore();
    }
  });

  it('treats an answer that is not a list as a read it could not make', async () => {
    getUserConversations.mockResolvedValue(undefined);
    sidebarGet.mockResolvedValue(noArchive);
    expect(await readSplitGroupCensus('g')).toEqual({ members: [], complete: false });

    getUserConversations.mockResolvedValue({ items: [], total: 0, has_more: false });
    sidebarGet.mockResolvedValue(undefined);
    expect(await readSplitGroupCensus('g')).toEqual({ members: [], complete: false });
  });
});
