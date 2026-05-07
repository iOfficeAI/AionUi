/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { fromApiPaginatedConversations } from '@/common/adapter/apiModelMapper';
import { buildGroupedHistory } from '@/renderer/pages/conversation/GroupedHistory/utils/groupingHelpers';

vi.mock('@/renderer/utils/chat/timeline', () => ({
  getActivityTime: (conv: { modified_at?: number; created_at?: number }) => conv.modified_at ?? conv.created_at ?? 0,
}));

vi.mock('@/renderer/utils/workspace/workspace', () => ({
  getWorkspaceDisplayName: (workspace: string) => `Display:${workspace}`,
}));

vi.mock('@/renderer/utils/workspace/workspaceHistory', () => ({
  getWorkspaceUpdateTime: () => 0,
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/utils/sortOrderHelpers', () => ({
  getConversationSortOrder: () => undefined,
}));

const mockT = (key: string) => key;

describe('workspace grouping through API mapping', () => {
  it('collapses conversations sharing a user-chosen workspace into one workspace group', () => {
    const apiPage = {
      items: [
        {
          id: 'c1',
          name: 'First',
          type: 'acp',
          model: { provider_id: 'p1', model: 'm1' },
          status: 'pending',
          source: 'aionui',
          pinned: false,
          pinned_at: null,
          channel_chat_id: null,
          created_at: 1000,
          modified_at: 2000,
          extra: { workspace: '/Users/alice/project', is_temporary_workspace: false },
        },
        {
          id: 'c2',
          name: 'Second',
          type: 'acp',
          model: { provider_id: 'p1', model: 'm1' },
          status: 'pending',
          source: 'aionui',
          pinned: false,
          pinned_at: null,
          channel_chat_id: null,
          created_at: 1500,
          modified_at: 2500,
          extra: { workspace: '/Users/alice/project', is_temporary_workspace: false },
        },
      ],
      total: 2,
      has_more: false,
    };

    const mapped = fromApiPaginatedConversations(apiPage);
    const grouped = buildGroupedHistory(mapped.items as never, mockT);
    const items = grouped.timelineSections[0]?.items ?? [];

    expect(grouped.timelineSections).toHaveLength(1);
    expect(items.filter((item) => item.type === 'workspace')).toHaveLength(1);
    expect(items.filter((item) => item.type === 'conversation')).toHaveLength(0);
    expect(items[0].workspaceGroup?.workspace).toBe('/Users/alice/project');
    expect(items[0].workspaceGroup?.conversations.map((conversation) => conversation.id)).toEqual(['c2', 'c1']);
  });

  it('keeps temp-workspace conversations as flat rows', () => {
    const apiPage = {
      items: [
        {
          id: 'c1',
          name: 'Temp',
          type: 'acp',
          model: { provider_id: 'p1', model: 'm1' },
          status: 'pending',
          source: 'aionui',
          pinned: false,
          pinned_at: null,
          channel_chat_id: null,
          created_at: 1000,
          modified_at: 2000,
          extra: {
            workspace: '/srv/aionui-data/conversations/claude-temp-c1',
            is_temporary_workspace: true,
          },
        },
      ],
      total: 1,
      has_more: false,
    };

    const mapped = fromApiPaginatedConversations(apiPage);
    const grouped = buildGroupedHistory(mapped.items as never, mockT);
    const items = grouped.timelineSections[0]?.items ?? [];

    expect(items.filter((item) => item.type === 'workspace')).toHaveLength(0);
    expect(items.filter((item) => item.type === 'conversation')).toHaveLength(1);
  });
});
