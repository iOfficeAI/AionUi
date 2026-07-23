/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import type { GroupedHistoryResult } from '@/renderer/pages/conversation/GroupedHistory/types';
import {
  getRecentConversations,
  moveQuickSwitcherSelection,
} from '@/renderer/pages/conversation/GroupedHistory/utils/conversationQuickSwitcher';
import { describe, expect, it } from 'vitest';

const conversation = (id: string, modifiedAt: number): TChatConversation =>
  ({
    id,
    name: id,
    type: 'acp',
    created_at: modifiedAt,
    modified_at: modifiedAt,
    extra: { backend: 'aioncore' },
  }) as TChatConversation;

describe('getRecentConversations', () => {
  it('orders visible conversations by activity across pinned and workspace groups', () => {
    const oldest = conversation('oldest', 10);
    const newest = conversation('newest', 30);
    const middle = conversation('middle', 20);
    const groupedHistory: GroupedHistoryResult = {
      pinnedConversations: [oldest],
      timelineSections: [
        {
          timeline: 'recent',
          items: [
            { type: 'conversation', time: 30, conversation: newest },
            {
              type: 'workspace',
              time: 20,
              workspaceGroup: {
                workspace: '/repo',
                display_name: 'repo',
                conversations: [middle],
              },
            },
          ],
        },
      ],
    };

    expect(getRecentConversations(groupedHistory).map((item) => item.id)).toEqual(['newest', 'middle', 'oldest']);
  });

  it('deduplicates conversations and applies the requested limit', () => {
    const newest = conversation('newest', 30);
    const older = conversation('older', 20);
    const groupedHistory: GroupedHistoryResult = {
      pinnedConversations: [newest],
      timelineSections: [
        {
          timeline: 'recent',
          items: [
            { type: 'conversation', time: 30, conversation: newest },
            { type: 'conversation', time: 20, conversation: older },
          ],
        },
      ],
    };

    expect(getRecentConversations(groupedHistory, 1)).toEqual([newest]);
  });

  it('returns no conversations when the limit is not positive', () => {
    expect(getRecentConversations({ pinnedConversations: [], timelineSections: [] }, 0)).toEqual([]);
  });
});

describe('moveQuickSwitcherSelection', () => {
  it('wraps from the first item to the last item', () => {
    expect(moveQuickSwitcherSelection(0, -1, 3)).toBe(2);
  });

  it('wraps from the last item to the first item', () => {
    expect(moveQuickSwitcherSelection(2, 1, 3)).toBe(0);
  });

  it('returns no selection when there are no items', () => {
    expect(moveQuickSwitcherSelection(0, 1, 0)).toBe(-1);
  });
});
