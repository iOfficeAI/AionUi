/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TMessage } from '@/common/chat/chatLib';

const layoutState = vi.hoisted(() => ({ isMobile: false }));
const sideControlState = vi.hoisted(() => ({
  enableSide: true,
  onAskInSide: vi.fn(),
}));
const conversationContextState = vi.hoisted(() => ({ isSideConversation: false }));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => layoutState,
}));

vi.mock('@/renderer/pages/conversation/context/SideConversationControlContext', () => ({
  useSideConversationControlSafe: () => sideControlState,
}));

vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  useConversationContextSafe: () => conversationContextState,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({
    children,
    onMouseDown,
  }: {
    children?: React.ReactNode;
    onMouseDown?: React.MouseEventHandler<HTMLButtonElement>;
  }) => (
    <button type='button' onMouseDown={onMouseDown}>
      {children}
    </button>
  ),
}));

vi.mock('@icon-park/react', () => ({
  Communication: () => <span data-testid='communication-icon' />,
  Quote: () => <span data-testid='quote-icon' />,
}));

import SelectionReplyButton from '@/renderer/pages/conversation/Messages/components/SelectionReplyButton';
import { emitter } from '@/renderer/utils/emitter';

const message = {
  id: 'm1',
  position: 'left',
} as TMessage;

let originalDocumentGetSelection: typeof document.getSelection;
let originalWindowGetSelection: typeof window.getSelection;

function installSelection(textNode: Text, removeAllRanges = vi.fn()) {
  const selection = {
    isCollapsed: false,
    toString: () => ' selected text ',
    anchorNode: textNode,
    getRangeAt: () => ({
      getBoundingClientRect: () => ({
        top: 52,
        bottom: 72,
        left: 120,
        width: 80,
      }),
    }),
    removeAllRanges,
  } as unknown as Selection;

  Object.defineProperty(document, 'getSelection', {
    configurable: true,
    value: () => selection,
  });
  Object.defineProperty(window, 'getSelection', {
    configurable: true,
    value: () => selection,
  });

  return { removeAllRanges };
}

beforeEach(() => {
  vi.useFakeTimers();
  layoutState.isMobile = false;
  sideControlState.enableSide = true;
  sideControlState.onAskInSide.mockClear();
  conversationContextState.isSideConversation = false;
  emitter.removeAllListeners('sendbox.reply');
  originalDocumentGetSelection = document.getSelection;
  originalWindowGetSelection = window.getSelection;
});

afterEach(() => {
  vi.useRealTimers();
  emitter.removeAllListeners('sendbox.reply');
  Object.defineProperty(document, 'getSelection', {
    configurable: true,
    value: originalDocumentGetSelection,
  });
  Object.defineProperty(window, 'getSelection', {
    configurable: true,
    value: originalWindowGetSelection,
  });
  document.body.innerHTML = '';
});

describe('SelectionReplyButton', () => {
  it('opens reply actions for selected message text and can ask in side', () => {
    const msgEl = document.createElement('div');
    msgEl.id = 'message-m1';
    const textNode = document.createTextNode('selected text');
    msgEl.append(textNode);
    document.body.append(msgEl);
    const { removeAllRanges } = installSelection(textNode);

    render(<SelectionReplyButton messages={[message]} />);
    fireEvent.mouseUp(document);
    act(() => {
      vi.advanceTimersByTime(20);
    });

    fireEvent.mouseDown(screen.getByText('conversation.sideConversation.askInSide'));

    expect(sideControlState.onAskInSide).toHaveBeenCalledWith('selected text');
    expect(removeAllRanges).toHaveBeenCalledTimes(1);
  });

  it('emits reply metadata for the selected message', () => {
    const onReply = vi.fn();
    emitter.on('sendbox.reply', onReply);
    const msgEl = document.createElement('div');
    msgEl.id = 'message-m1';
    const textNode = document.createTextNode('selected text');
    msgEl.append(textNode);
    document.body.append(msgEl);
    installSelection(textNode);

    render(<SelectionReplyButton messages={[message]} />);
    fireEvent.mouseUp(document);
    act(() => {
      vi.advanceTimersByTime(20);
    });

    fireEvent.mouseDown(screen.getByText('common.reply'));

    expect(onReply).toHaveBeenCalledWith({
      messageId: 'm1',
      content: 'selected text',
      position: 'left',
    });
  });

  it('does not install the desktop selection toolbar on mobile', () => {
    layoutState.isMobile = true;
    const msgEl = document.createElement('div');
    msgEl.id = 'message-m1';
    const textNode = document.createTextNode('selected text');
    msgEl.append(textNode);
    document.body.append(msgEl);
    installSelection(textNode);

    render(<SelectionReplyButton messages={[message]} />);
    fireEvent.mouseUp(document);
    act(() => {
      vi.advanceTimersByTime(20);
    });

    expect(screen.queryByText('common.reply')).toBeNull();
    expect(screen.queryByText('conversation.sideConversation.askInSide')).toBeNull();
  });
});
