export const CHAT_MESSAGE_JUMP_EVENT = 'aionui-chat-message-jump';

export interface ChatMessageJumpDetail {
  conversation_id: string;
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

/**
 * Request that a conversation's search panel be opened.
 *
 * The panel is owned by the chat header (it anchors under the header and holds
 * the search state), but the anchor rail — a separate subtree on the chat area's
 * left edge — now carries the primary entry point. An event keeps the two
 * decoupled: the rail asks, the header decides, and neither has to reach into
 * the other's tree or lift the panel's state.
 */
export const CHAT_SEARCH_PANEL_OPEN_EVENT = 'aionui-chat-search-panel-open';

export interface ChatSearchPanelOpenDetail {
  conversation_id: string;
}

export function dispatchChatSearchPanelOpen(detail: ChatSearchPanelOpenDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<ChatSearchPanelOpenDetail>(CHAT_SEARCH_PANEL_OPEN_EVENT, {
      detail,
    })
  );
}
