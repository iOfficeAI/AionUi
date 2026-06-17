import type { TChatConversation } from '@/common/config/storage';

/**
 * Resolve the effective runtime backend for a conversation.
 *
 * New assistant-led flows should pass the assistant backend explicitly when it
 * is known. Legacy conversations may still fall back to `extra.backend`.
 */
export function resolveConversationBackend(
  conversation: TChatConversation | undefined,
  presetAssistantBackend?: string
): string | undefined {
  const explicitAssistantBackend = presetAssistantBackend?.trim();
  if (explicitAssistantBackend) {
    return explicitAssistantBackend;
  }

  if (!conversation) return undefined;

  if (conversation.type === 'acp') {
    return conversation.extra?.backend;
  }

  if (conversation.type === 'openclaw-gateway') {
    return conversation.extra?.backend || 'openclaw-gateway';
  }

  if (conversation.type === 'remote') {
    return 'remote';
  }

  return conversation.type;
}
