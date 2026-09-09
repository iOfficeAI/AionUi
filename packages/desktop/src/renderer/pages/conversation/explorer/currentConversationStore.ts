/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Back-compatible façade over the focused-conversation store.
 *
 * The active conversation id used to live here as a module singleton. It now
 * lives in {@link ../hooks/focusedConversationStore}, which also tracks which
 * conversation views are mounted so more than one can be on screen at a time.
 * The names below are kept because the Explorer, the conversation route and the
 * team route all read them; they are thin aliases, not a second source of truth.
 */

export {
  getFocusedConversation as getCurrentConversation,
  resetFocusedConversationStoreForTest as resetCurrentConversationForTest,
  setFocusedConversation as setCurrentConversation,
  useFocusedConversationId as useCurrentConversation,
} from '@/renderer/pages/conversation/hooks/focusedConversationStore';
