import type { TChatConversation } from '@/common/config/storage';
import { getConversationOrNull } from './conversationCache';
import { isPromotedTeamSourceConversation } from './conversationTeamOwnership';
import { ensureConversationRuntime } from './ensureConversationRuntime';

/**
 * Returns whether a conversation runtime is owned by an ad-hoc team instead
 * of the standalone conversation lifecycle.
 */
export function isTeamManagedRuntime(conversation: TChatConversation | null): boolean {
  return Boolean(conversation && isPromotedTeamSourceConversation(conversation));
}

/**
 * Ensures a standalone conversation runtime while leaving promoted team
 * conversations to the team lifecycle.
 */
export async function ensureStandaloneConversationRuntime(conversation_id: string): Promise<void> {
  const conversation = await getConversationOrNull(conversation_id);
  if (isTeamManagedRuntime(conversation)) return;
  await ensureConversationRuntime(conversation_id);
}
