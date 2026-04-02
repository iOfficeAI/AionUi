/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import {
  buildGroupedHistory,
  getConversationPinnedAt,
  isCronJobConversation,
  isConversationPinned,
  groupConversationsByWorkspace,
} from '@/renderer/pages/conversation/GroupedHistory/utils/groupingHelpers';

// Mock dependencies
vi.mock('@/renderer/utils/chat/timeline', () => ({
  getActivityTime: (conv: TChatConversation) => conv.updatedAt || conv.createdAt,
}));

vi.mock('@/renderer/utils/workspace/workspace', () => ({
  getWorkspaceDisplayName: (workspace: string) => `Display: ${workspace}`,
}));

vi.mock('@/renderer/utils/workspace/workspaceHistory', () => ({
  getWorkspaceUpdateTime: (_workspace: string) => 0,
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/utils/sortOrderHelpers', () => ({
  getConversationSortOrder: (conv: TChatConversation) => {
    const extra = conv.extra as { sortOrder?: number } | undefined;
    return extra?.sortOrder;
  },
}));

// Mock translation function used in tests
const mockT = (key: string) => key;

describe('isCronJobConversation', () => {
  it('returns true when extra.cronJobId exists', () => {
    const conversation: TChatConversation = {
      id: 'conv-1',
      title: 'Test',
      createdAt: 1000,
      updatedAt: 1000,
      extra: { cronJobId: 'job-123' },
      userMsgCount: 0,
    };
    expect(isCronJobConversation(conversation)).toBe(true);
  });

  it('returns false when extra.cronJobId is undefined', () => {
    const conversation: TChatConversation = {
      id: 'conv-2',
      title: 'Test',
      createdAt: 1000,
      updatedAt: 1000,
      extra: {},
      userMsgCount: 0,
    };
    expect(isCronJobConversation(conversation)).toBe(false);
  });

  it('returns false when extra is undefined', () => {
    const conversation: TChatConversation = {
      id: 'conv-3',
      title: 'Test',
      createdAt: 1000,
      updatedAt: 1000,
      userMsgCount: 0,
    };
    expect(isCronJobConversation(conversation)).toBe(false);
  });

  it('returns false when extra.cronJobId is empty string', () => {
    const conversation: TChatConversation = {
      id: 'conv-4',
      title: 'Test',
      createdAt: 1000,
      updatedAt: 1000,
      extra: { cronJobId: '' },
      userMsgCount: 0,
    };
    expect(isCronJobConversation(conversation)).toBe(false);
  });
});

describe('isConversationPinned', () => {
  it('returns true when extra.pinned is true', () => {
    const conversation: TChatConversation = {
      id: 'conv-1',
      title: 'Test',
      createdAt: 1000,
      updatedAt: 1000,
      extra: { pinned: true },
      userMsgCount: 0,
    };
    expect(isConversationPinned(conversation)).toBe(true);
  });

  it('returns false when extra.pinned is false', () => {
    const conversation: TChatConversation = {
      id: 'conv-2',
      title: 'Test',
      createdAt: 1000,
      updatedAt: 1000,
      extra: { pinned: false },
      userMsgCount: 0,
    };
    expect(isConversationPinned(conversation)).toBe(false);
  });

  it('returns false when extra.pinned is undefined', () => {
    const conversation: TChatConversation = {
      id: 'conv-3',
      title: 'Test',
      createdAt: 1000,
      updatedAt: 1000,
      extra: {},
      userMsgCount: 0,
    };
    expect(isConversationPinned(conversation)).toBe(false);
  });

  it('returns false when extra is undefined', () => {
    const conversation: TChatConversation = {
      id: 'conv-4',
      title: 'Test',
      createdAt: 1000,
      updatedAt: 1000,
      userMsgCount: 0,
    };
    expect(isConversationPinned(conversation)).toBe(false);
  });
});

describe('getConversationPinnedAt', () => {
  it('returns pinnedAt timestamp when available', () => {
    const conversation: TChatConversation = {
      id: 'conv-1',
      title: 'Test',
      createdAt: 1000,
      updatedAt: 1000,
      extra: { pinnedAt: 5000 },
      userMsgCount: 0,
    };
    expect(getConversationPinnedAt(conversation)).toBe(5000);
  });

  it('returns 0 when pinnedAt is undefined', () => {
    const conversation: TChatConversation = {
      id: 'conv-2',
      title: 'Test',
      createdAt: 1000,
      updatedAt: 1000,
      extra: {},
      userMsgCount: 0,
    };
    expect(getConversationPinnedAt(conversation)).toBe(0);
  });

  it('returns 0 when extra is undefined', () => {
    const conversation: TChatConversation = {
      id: 'conv-3',
      title: 'Test',
      createdAt: 1000,
      updatedAt: 1000,
      userMsgCount: 0,
    };
    expect(getConversationPinnedAt(conversation)).toBe(0);
  });

  it('returns 0 when pinnedAt is not a number', () => {
    const conversation: TChatConversation = {
      id: 'conv-4',
      title: 'Test',
      createdAt: 1000,
      updatedAt: 1000,
      extra: { pinnedAt: 'not-a-number' as unknown },
      userMsgCount: 0,
    };
    expect(getConversationPinnedAt(conversation)).toBe(0);
  });
});

describe('groupConversationsByWorkspace', () => {
  it('groups conversations by workspace', () => {
    const conversations: TChatConversation[] = [
      {
        id: 'conv-1',
        title: 'Test 1',
        createdAt: 3000,
        updatedAt: 3000,
        extra: { workspace: '/path/a', customWorkspace: true },
        userMsgCount: 0,
      },
      {
        id: 'conv-2',
        title: 'Test 2',
        createdAt: 2000,
        updatedAt: 2000,
        extra: { workspace: '/path/a', customWorkspace: true },
        userMsgCount: 0,
      },
      {
        id: 'conv-3',
        title: 'Test 3',
        createdAt: 1000,
        updatedAt: 1000,
        extra: { workspace: '/path/b', customWorkspace: true },
        userMsgCount: 0,
      },
    ];

    const result = groupConversationsByWorkspace(conversations, mockT);

    expect(result).toHaveLength(1);
    expect(result[0].timeline).toBe('conversation.history.recents');
    expect(result[0].items).toHaveLength(2);

    // First item should be workspace /path/a (most recent activity)
    const firstItem = result[0].items[0];
    expect(firstItem.type).toBe('workspace');
    expect(firstItem.workspaceGroup?.workspace).toBe('/path/a');
    expect(firstItem.workspaceGroup?.conversations).toHaveLength(2);

    // Second item should be workspace /path/b
    const secondItem = result[0].items[1];
    expect(secondItem.type).toBe('workspace');
    expect(secondItem.workspaceGroup?.workspace).toBe('/path/b');
  });

  it('puts conversations without workspace in timeline', () => {
    const conversations: TChatConversation[] = [
      {
        id: 'conv-1',
        title: 'Test 1',
        createdAt: 3000,
        updatedAt: 3000,
        extra: {},
        userMsgCount: 0,
      },
      {
        id: 'conv-2',
        title: 'Test 2',
        createdAt: 2000,
        updatedAt: 2000,
        userMsgCount: 0,
      },
    ];

    const result = groupConversationsByWorkspace(conversations, mockT);

    expect(result).toHaveLength(1);
    expect(result[0].items).toHaveLength(2);
    expect(result[0].items[0].type).toBe('conversation');
    expect(result[0].items[0].conversation?.id).toBe('conv-1');
    expect(result[0].items[1].type).toBe('conversation');
    expect(result[0].items[1].conversation?.id).toBe('conv-2');
  });

  it('sorts items by time descending', () => {
    const conversations: TChatConversation[] = [
      {
        id: 'conv-1',
        title: 'Test 1',
        createdAt: 1000,
        updatedAt: 1000,
        extra: {},
        userMsgCount: 0,
      },
      {
        id: 'conv-2',
        title: 'Test 2',
        createdAt: 5000,
        updatedAt: 5000,
        extra: { workspace: '/path/a', customWorkspace: true },
        userMsgCount: 0,
      },
      {
        id: 'conv-3',
        title: 'Test 3',
        createdAt: 3000,
        updatedAt: 3000,
        extra: {},
        userMsgCount: 0,
      },
    ];

    const result = groupConversationsByWorkspace(conversations, mockT);

    expect(result[0].items[0].time).toBe(5000); // workspace /path/a
    expect(result[0].items[1].time).toBe(3000); // conv-3
    expect(result[0].items[2].time).toBe(1000); // conv-1
  });

  it('returns empty array when no conversations', () => {
    const result = groupConversationsByWorkspace([], mockT);
    expect(result).toEqual([]);
  });

  it('sorts conversations within workspace groups by activity time', () => {
    const conversations: TChatConversation[] = [
      {
        id: 'conv-1',
        title: 'Test 1',
        createdAt: 1000,
        updatedAt: 1000,
        extra: { workspace: '/path/a', customWorkspace: true },
        userMsgCount: 0,
      },
      {
        id: 'conv-2',
        title: 'Test 2',
        createdAt: 3000,
        updatedAt: 3000,
        extra: { workspace: '/path/a', customWorkspace: true },
        userMsgCount: 0,
      },
      {
        id: 'conv-3',
        title: 'Test 3',
        createdAt: 2000,
        updatedAt: 2000,
        extra: { workspace: '/path/a', customWorkspace: true },
        userMsgCount: 0,
      },
    ];

    const result = groupConversationsByWorkspace(conversations, mockT);

    const workspaceGroup = result[0].items[0].workspaceGroup;
    expect(workspaceGroup?.conversations[0].id).toBe('conv-2'); // 3000
    expect(workspaceGroup?.conversations[1].id).toBe('conv-3'); // 2000
    expect(workspaceGroup?.conversations[2].id).toBe('conv-1'); // 1000
  });

  it('requires both workspace and customWorkspace to group', () => {
    const conversations: TChatConversation[] = [
      {
        id: 'conv-1',
        title: 'Test 1',
        createdAt: 1000,
        updatedAt: 1000,
        extra: { workspace: '/path/a' }, // missing customWorkspace
        userMsgCount: 0,
      },
      {
        id: 'conv-2',
        title: 'Test 2',
        createdAt: 2000,
        updatedAt: 2000,
        extra: { customWorkspace: true }, // missing workspace
        userMsgCount: 0,
      },
    ];

    const result = groupConversationsByWorkspace(conversations, mockT);

    // Both should be treated as without workspace
    expect(result[0].items).toHaveLength(2);
    expect(result[0].items[0].type).toBe('conversation');
    expect(result[0].items[1].type).toBe('conversation');
  });
});

describe('buildGroupedHistory', () => {
  it('separates pinned conversations from normal conversations', () => {
    const conversations: TChatConversation[] = [
      {
        id: 'conv-1',
        title: 'Pinned',
        createdAt: 1000,
        updatedAt: 1000,
        extra: { pinned: true, pinnedAt: 2000 },
        userMsgCount: 0,
      },
      {
        id: 'conv-2',
        title: 'Normal',
        createdAt: 3000,
        updatedAt: 3000,
        extra: {},
        userMsgCount: 0,
      },
    ];

    const result = buildGroupedHistory(conversations, mockT);

    expect(result.pinnedConversations).toHaveLength(1);
    expect(result.pinnedConversations[0].id).toBe('conv-1');
    expect(result.timelineSections[0].items).toHaveLength(1);
    expect(result.timelineSections[0].items[0].conversation?.id).toBe('conv-2');
  });

  it('excludes cron job conversations from normal conversations', () => {
    const conversations: TChatConversation[] = [
      {
        id: 'conv-1',
        title: 'Normal',
        createdAt: 1000,
        updatedAt: 1000,
        extra: {},
        userMsgCount: 0,
      },
      {
        id: 'conv-2',
        title: 'Cron Job',
        createdAt: 2000,
        updatedAt: 2000,
        extra: { cronJobId: 'job-123' },
        userMsgCount: 0,
      },
    ];

    const result = buildGroupedHistory(conversations, mockT);

    expect(result.pinnedConversations).toHaveLength(0);
    expect(result.timelineSections[0].items).toHaveLength(1);
    expect(result.timelineSections[0].items[0].conversation?.id).toBe('conv-1');
  });

  it('sorts pinned conversations by sortOrder first', () => {
    const conversations: TChatConversation[] = [
      {
        id: 'conv-1',
        title: 'Pinned 1',
        createdAt: 1000,
        updatedAt: 1000,
        extra: { pinned: true, pinnedAt: 3000, sortOrder: 2000 },
        userMsgCount: 0,
      },
      {
        id: 'conv-2',
        title: 'Pinned 2',
        createdAt: 2000,
        updatedAt: 2000,
        extra: { pinned: true, pinnedAt: 4000, sortOrder: 1000 },
        userMsgCount: 0,
      },
      {
        id: 'conv-3',
        title: 'Pinned 3',
        createdAt: 3000,
        updatedAt: 3000,
        extra: { pinned: true, pinnedAt: 5000 }, // no sortOrder
        userMsgCount: 0,
      },
    ];

    const result = buildGroupedHistory(conversations, mockT);

    // conv-2 (sortOrder 1000) < conv-1 (sortOrder 2000) < conv-3 (no sortOrder, sorted by pinnedAt)
    expect(result.pinnedConversations[0].id).toBe('conv-2');
    expect(result.pinnedConversations[1].id).toBe('conv-1');
    expect(result.pinnedConversations[2].id).toBe('conv-3');
  });

  it('falls back to pinnedAt when sortOrder is not present', () => {
    const conversations: TChatConversation[] = [
      {
        id: 'conv-1',
        title: 'Pinned 1',
        createdAt: 1000,
        updatedAt: 1000,
        extra: { pinned: true, pinnedAt: 2000 },
        userMsgCount: 0,
      },
      {
        id: 'conv-2',
        title: 'Pinned 2',
        createdAt: 2000,
        updatedAt: 2000,
        extra: { pinned: true, pinnedAt: 3000 },
        userMsgCount: 0,
      },
    ];

    const result = buildGroupedHistory(conversations, mockT);

    // Descending by pinnedAt: conv-2 (3000) before conv-1 (2000)
    expect(result.pinnedConversations[0].id).toBe('conv-2');
    expect(result.pinnedConversations[1].id).toBe('conv-1');
  });

  it('handles mixed pinned, cron job, and normal conversations', () => {
    const conversations: TChatConversation[] = [
      {
        id: 'conv-1',
        title: 'Pinned',
        createdAt: 1000,
        updatedAt: 1000,
        extra: { pinned: true, pinnedAt: 2000 },
        userMsgCount: 0,
      },
      {
        id: 'conv-2',
        title: 'Cron',
        createdAt: 2000,
        updatedAt: 2000,
        extra: { cronJobId: 'job-123' },
        userMsgCount: 0,
      },
      {
        id: 'conv-3',
        title: 'Normal',
        createdAt: 3000,
        updatedAt: 3000,
        extra: {},
        userMsgCount: 0,
      },
      {
        id: 'conv-4',
        title: 'Workspace',
        createdAt: 4000,
        updatedAt: 4000,
        extra: { workspace: '/path/a', customWorkspace: true },
        userMsgCount: 0,
      },
    ];

    const result = buildGroupedHistory(conversations, mockT);

    expect(result.pinnedConversations).toHaveLength(1);
    expect(result.pinnedConversations[0].id).toBe('conv-1');

    // Normal section should have workspace group and normal conversation
    expect(result.timelineSections[0].items).toHaveLength(2);
    expect(result.timelineSections[0].items[0].type).toBe('workspace'); // conv-4 in workspace
    expect(result.timelineSections[0].items[1].type).toBe('conversation'); // conv-3
  });

  it('returns empty arrays when no conversations', () => {
    const result = buildGroupedHistory([], mockT);

    expect(result.pinnedConversations).toEqual([]);
    expect(result.timelineSections).toEqual([]);
  });

  it('handles all conversations being pinned', () => {
    const conversations: TChatConversation[] = [
      {
        id: 'conv-1',
        title: 'Pinned 1',
        createdAt: 1000,
        updatedAt: 1000,
        extra: { pinned: true, pinnedAt: 1000 },
        userMsgCount: 0,
      },
      {
        id: 'conv-2',
        title: 'Pinned 2',
        createdAt: 2000,
        updatedAt: 2000,
        extra: { pinned: true, pinnedAt: 2000 },
        userMsgCount: 0,
      },
    ];

    const result = buildGroupedHistory(conversations, mockT);

    expect(result.pinnedConversations).toHaveLength(2);
    expect(result.timelineSections).toEqual([]);
  });

  it('handles all conversations being cron jobs', () => {
    const conversations: TChatConversation[] = [
      {
        id: 'conv-1',
        title: 'Cron 1',
        createdAt: 1000,
        updatedAt: 1000,
        extra: { cronJobId: 'job-1' },
        userMsgCount: 0,
      },
      {
        id: 'conv-2',
        title: 'Cron 2',
        createdAt: 2000,
        updatedAt: 2000,
        extra: { cronJobId: 'job-2' },
        userMsgCount: 0,
      },
    ];

    const result = buildGroupedHistory(conversations, mockT);

    expect(result.pinnedConversations).toEqual([]);
    expect(result.timelineSections).toEqual([]);
  });
});
