/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import {
  buildGroupedHistory,
  isTeamMemberConversation,
} from '@/renderer/pages/conversation/GroupedHistory/utils/groupingHelpers';
import { describe, expect, it, vi } from 'vitest';

const makeConv = (id: string, extra: TChatConversation['extra'] = {}): TChatConversation =>
  ({
    id,
    type: 'acp',
    name: id,
    created_at: 1,
    modified_at: 1,
    extra,
    model: {},
  }) as TChatConversation;

const t = vi.fn((key: string) => key);

describe('groupingHelpers ad-hoc team filtering', () => {
  it('identifies team member conversations by extra.team_id', () => {
    expect(isTeamMemberConversation(makeConv('conv-1', { team_id: 'team-1' }))).toBe(true);
  });

  it('treats promoted source conversations (extra.teamId) as visible', () => {
    expect(isTeamMemberConversation(makeConv('conv-1', { teamId: 'team-1' }))).toBe(false);
  });

  it('treats standalone conversations as visible', () => {
    expect(isTeamMemberConversation(makeConv('conv-1'))).toBe(false);
    expect(isTeamMemberConversation(makeConv('conv-1', {}))).toBe(false);
  });

  it('keeps promoted sources in grouped history while filtering member conversations', () => {
    const conversations = [
      makeConv('source', { teamId: 'team-1' }),
      makeConv('member', { team_id: 'team-1' }),
      makeConv('normal'),
    ];

    const result = buildGroupedHistory(conversations, t);
    const visibleIds = result.pinnedConversations
      .map((c) => c.id)
      .concat(
        result.timelineSections.flatMap((s) =>
          s.items.map((i) => (i.type === 'conversation' ? i.conversation.id : i.workspaceGroup.workspace))
        )
      );

    expect(visibleIds).toContain('source');
    expect(visibleIds).toContain('normal');
    expect(visibleIds).not.toContain('member');
  });
});
