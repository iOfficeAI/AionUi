/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Back-compatible façade over the focused-conversation store.
 *
 * The current project id used to live here as a module singleton, a sibling of
 * the active conversation id. Both now live in
 * {@link ../hooks/focusedConversationStore} so a single subscription covers
 * "what the user is working in". The names below are kept because the Layout
 * Explorer host, the preview launcher and the search roots all read them.
 */

export {
  getFocusedProject as getCurrentProject,
  resetFocusedConversationStoreForTest as resetCurrentProjectForTest,
  setFocusedProject as setCurrentProject,
  subscribeFocusedProject as subscribeCurrentProject,
  useFocusedProjectId as useCurrentProject,
} from '@/renderer/pages/conversation/hooks/focusedConversationStore';
