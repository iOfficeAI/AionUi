import type { TChatConversation } from '@/common/config/storage';
import {
  getPromotedSourceTeamId,
  getTeamMemberId,
  isPromotedTeamSourceConversation,
  isTeamMemberConversation,
  isTeamRelatedConversation,
} from '@/renderer/pages/conversation/utils/conversationTeamOwnership';
import { describe, expect, it } from 'vitest';

const conversation = (extra: TChatConversation['extra'] = {}): TChatConversation => ({ extra }) as TChatConversation;

describe('conversationTeamOwnership', () => {
  it('identifies a team member from the team_id field', () => {
    const value = conversation({ team_id: 'team-member' });

    expect(getTeamMemberId(value.extra)).toBe('team-member');
    expect(isTeamMemberConversation(value)).toBe(true);
  });

  it('identifies a promoted source from the teamId field', () => {
    const value = conversation({ teamId: 'team-source' });

    expect(getPromotedSourceTeamId(value.extra)).toBe('team-source');
    expect(isPromotedTeamSourceConversation(value)).toBe(true);
  });

  it('treats either ownership form as team-related', () => {
    expect(isTeamRelatedConversation(conversation({ team_id: 'team-member' }))).toBe(true);
    expect(isTeamRelatedConversation(conversation({ teamId: 'team-source' }))).toBe(true);
  });

  it('rejects missing or whitespace-only ownership fields', () => {
    expect(isTeamRelatedConversation(conversation({ team_id: ' ' }))).toBe(false);
    expect(isTeamRelatedConversation(undefined)).toBe(false);
  });
});
