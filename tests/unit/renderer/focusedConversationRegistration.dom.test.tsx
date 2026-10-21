/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The registration half of the focused-conversation store: a mounted
 * conversation view announces itself, releases on unmount, and any pointer or
 * focus event inside its subtree claims focus. This is what lets two
 * `<ChatConversation>` instances share one window without stealing each other's
 * Explorer target.
 */

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  getFocusedConversation,
  getMountedConversationIds,
  resetFocusedConversationStoreForTest,
  useFocusedConversationRegistration,
} from '@/renderer/pages/conversation/hooks/focusedConversationStore';

afterEach(() => {
  cleanup();
  resetFocusedConversationStoreForTest();
});

const ConversationView: React.FC<{ conversation_id?: string }> = ({ conversation_id }) => {
  const focusRegistration = useFocusedConversationRegistration(conversation_id);
  return (
    <div data-testid={`view-${conversation_id ?? 'none'}`} {...focusRegistration}>
      <button type='button' data-testid={`send-${conversation_id ?? 'none'}`}>
        send
      </button>
    </div>
  );
};

describe('useFocusedConversationRegistration', () => {
  it('registers on mount and focuses the only mounted conversation', () => {
    render(<ConversationView conversation_id='a' />);
    expect(getMountedConversationIds()).toEqual(['a']);
    expect(getFocusedConversation()).toBe('a');
  });

  it('unregisters on unmount', () => {
    const { unmount } = render(<ConversationView conversation_id='a' />);
    unmount();
    expect(getMountedConversationIds()).toEqual([]);
    expect(getFocusedConversation()).toBeNull();
  });

  it('registers nothing while the conversation is still loading', () => {
    render(<ConversationView />);
    expect(getMountedConversationIds()).toEqual([]);
    expect(getFocusedConversation()).toBeNull();
  });

  it('moves focus to the column a pointer event lands in', () => {
    render(
      <>
        <ConversationView conversation_id='a' />
        <ConversationView conversation_id='b' />
      </>
    );
    expect(getMountedConversationIds()).toEqual(['a', 'b']);
    expect(getFocusedConversation()).toBe('a');

    fireEvent.pointerDown(screen.getByTestId('send-b'));
    expect(getFocusedConversation()).toBe('b');

    fireEvent.pointerDown(screen.getByTestId('send-a'));
    expect(getFocusedConversation()).toBe('a');
  });

  it('moves focus when a nested control is focused by keyboard', () => {
    render(
      <>
        <ConversationView conversation_id='a' />
        <ConversationView conversation_id='b' />
      </>
    );

    fireEvent.focus(screen.getByTestId('send-b'));
    expect(getFocusedConversation()).toBe('b');
  });

  it('re-registers under the new id when the route switches conversation', () => {
    const { rerender } = render(<ConversationView conversation_id='a' />);
    rerender(<ConversationView conversation_id='b' />);

    expect(getMountedConversationIds()).toEqual(['b']);
    expect(getFocusedConversation()).toBe('b');
  });
});
