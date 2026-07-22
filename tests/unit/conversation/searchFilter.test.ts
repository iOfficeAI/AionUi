/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import type { IMessageSearchItem } from '@/common/types/team/database';
import { isTeamMemberConversation } from '@/renderer/pages/conversation/GroupedHistory/utils/groupingHelpers';

function filterSearchResults(items: IMessageSearchItem[]): IMessageSearchItem[] {
  return items.filter((item) => !isTeamMemberConversation(item.conversation));
}

const conversation = (id: string, extra: TChatConversation['extra']): TChatConversation =>
  ({
    id,
    name: id,
    type: 'acp',
    created_at: 0,
    modified_at: 0,
    extra,
  }) as TChatConversation;

const searchItem = (conv: TChatConversation): IMessageSearchItem => ({
  conversation: conv,
  message_id: `msg-${conv.id}`,
  message_type: 'text',
  message_created_at: 100,
  preview_text: 'preview',
});

describe('filterSearchResults', () => {
  it('filters out team member conversations from search results', () => {
    const items = [
      searchItem(conversation('conv-1', { backend: 'acp' })),
      searchItem(conversation('team-member', { backend: 'acp', team_id: 'team-1' })),
      searchItem(conversation('conv-2', { backend: 'acp' })),
    ];

    const filtered = filterSearchResults(items);

    expect(filtered).toHaveLength(2);
    expect(filtered.map((i) => i.conversation.id)).toEqual(['conv-1', 'conv-2']);
  });

  it('keeps promoted source conversations visible in search results', () => {
    const items = [
      searchItem(conversation('promoted-source', { backend: 'acp', teamId: 'team-1' })),
    ];

    const filtered = filterSearchResults(items);

    expect(filtered).toHaveLength(1);
    expect(filtered[0].conversation.id).toBe('promoted-source');
  });

  it('filters out only team member conversations when mixed with promoted sources', () => {
    const items = [
      searchItem(conversation('conv-1', { backend: 'acp' })),
      searchItem(conversation('member', { backend: 'acp', team_id: 'team-1' })),
      searchItem(conversation('promoted', { backend: 'acp', teamId: 'team-1' })),
    ];

    const filtered = filterSearchResults(items);

    expect(filtered).toHaveLength(2);
    expect(filtered.map((i) => i.conversation.id)).toEqual(['conv-1', 'promoted']);
  });

  it('returns empty array when all results are team member conversations', () => {
    const items = [
      searchItem(conversation('m1', { backend: 'acp', team_id: 'team-1' })),
      searchItem(conversation('m2', { backend: 'acp', team_id: 'team-2' })),
    ];

    const filtered = filterSearchResults(items);

    expect(filtered).toHaveLength(0);
  });
});
