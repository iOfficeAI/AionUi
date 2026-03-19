/**
 * Module-level Map to pass the initial message from conversation creation
 * to the ChatContext that will be mounted for that conversation.
 * Analogous to desktop's sessionStorage approach.
 */
const pendingInitialMessages = new Map<string, string>();

export function setPendingInitialMessage(conversationId: string, message: string) {
  pendingInitialMessages.set(conversationId, message);
}

export function consumePendingInitialMessage(conversationId: string): string | undefined {
  const message = pendingInitialMessages.get(conversationId);
  if (message !== undefined) {
    pendingInitialMessages.delete(conversationId);
  }
  return message;
}
