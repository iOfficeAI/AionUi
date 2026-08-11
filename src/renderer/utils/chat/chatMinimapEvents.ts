export const CHAT_MESSAGE_JUMP_EVENT = 'aionui-chat-message-jump';

export interface ChatMessageJumpDetail {
  conversationId: string;
  messageId?: string;
  msgId?: string;
  align?: 'start' | 'center' | 'end';
  behavior?: 'auto' | 'smooth';
}

export function dispatchChatMessageJump(detail: ChatMessageJumpDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<ChatMessageJumpDetail>(CHAT_MESSAGE_JUMP_EVENT, {
      detail,
    })
  );
}
