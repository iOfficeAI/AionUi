import type { TChatConversation } from '@/common/config/storage';

type ConversationExtra = TChatConversation['extra'] | undefined;

function getNonEmptyTeamId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

/** Returns the owning team for a team member conversation (`team_id`). */
export function getTeamMemberId(extra: ConversationExtra): string | undefined {
  return getNonEmptyTeamId((extra as { team_id?: unknown } | undefined)?.team_id);
}

/** Returns the associated team for a promoted source conversation (`teamId`). */
export function getPromotedSourceTeamId(extra: ConversationExtra): string | undefined {
  return getNonEmptyTeamId((extra as { teamId?: unknown } | undefined)?.teamId);
}

export function isTeamMemberConversation(conversation: TChatConversation): boolean {
  return Boolean(getTeamMemberId(conversation.extra));
}

export function isPromotedTeamSourceConversation(conversation: TChatConversation): boolean {
  return Boolean(getPromotedSourceTeamId(conversation.extra));
}

export function isTeamRelatedConversation(conversation: TChatConversation | undefined): boolean {
  return Boolean(conversation && (getTeamMemberId(conversation.extra) || getPromotedSourceTeamId(conversation.extra)));
}
