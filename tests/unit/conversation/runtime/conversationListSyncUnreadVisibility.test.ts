/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The unread badge used to ask "is this the one active conversation id?". With
 * two conversation views on screen that badges the column the user is not
 * clicking in, even though they can read every word of it. The rule is now the
 * mounted set, union the route's active conversation (published before the view
 * finishes loading).
 */

import { afterEach, describe, expect, it } from 'vitest';

import { isConversationOnScreen } from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync';
import {
  registerMountedConversation,
  resetFocusedConversationStoreForTest,
} from '@/renderer/pages/conversation/hooks/focusedConversationStore';

afterEach(() => resetFocusedConversationStoreForTest());

describe('isConversationOnScreen', () => {
  it('counts the route conversation even before its view mounts', () => {
    expect(isConversationOnScreen('conv-a', 'conv-a')).toBe(true);
  });

  it('counts every mounted view, not just the active one', () => {
    registerMountedConversation('conv-a');
    registerMountedConversation('conv-b');

    // conv-b is the second column: visible, so no unread badge, even though the
    // route's active conversation is conv-a.
    expect(isConversationOnScreen('conv-b', 'conv-a')).toBe(true);
  });

  it('is false for a conversation that is neither mounted nor active', () => {
    registerMountedConversation('conv-a');
    expect(isConversationOnScreen('conv-c', 'conv-a')).toBe(false);
  });

  it('goes back to false once the view unmounts', () => {
    const release = registerMountedConversation('conv-b');
    expect(isConversationOnScreen('conv-b', 'conv-a')).toBe(true);

    release();
    expect(isConversationOnScreen('conv-b', 'conv-a')).toBe(false);
  });

  it('is false for everything when nothing is mounted and no route is active', () => {
    expect(isConversationOnScreen('conv-a', null)).toBe(false);
  });
});
