export const CHAT_ATTACH_FILE_EVENT = 'aionui:chat-attach-file';
export const CHAT_OPEN_CONVERSATION_SEARCH_EVENT = 'aionui:chat-open-conversation-search';
export const CHAT_OPEN_MODEL_SELECTOR_EVENT = 'aionui:chat-open-model-selector';
export const CHAT_SELECT_WORKSPACE_EVENT = 'aionui:chat-select-workspace';
export const COMMAND_PALETTE_OPEN_EVENT = 'aionui:command-palette-open';

export function dispatchChatAttachFileEvent() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CHAT_ATTACH_FILE_EVENT));
}

export function dispatchChatOpenConversationSearchEvent() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CHAT_OPEN_CONVERSATION_SEARCH_EVENT));
}

export function dispatchChatOpenModelSelectorEvent() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CHAT_OPEN_MODEL_SELECTOR_EVENT));
}

export function dispatchChatSelectWorkspaceEvent() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CHAT_SELECT_WORKSPACE_EVENT));
}

export function dispatchCommandPaletteOpenEvent() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(COMMAND_PALETTE_OPEN_EVENT));
}
