/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

const conversationContextMock = vi.fn(() => ({ conversation_id: 'p1', type: 'acp' }));
vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  useConversationContextSafe: () => conversationContextMock(),
}));

vi.mock('@/renderer/pages/conversation/Preview/context/PreviewContext', () => ({
  useOptionalPreviewContext: () => null,
}));

vi.mock('@/renderer/utils/platform', () => ({
  openExternalUrl: vi.fn(),
}));

import SelectionReplyButton from '@/renderer/pages/conversation/Messages/components/SelectionReplyButton';
import { SideConversationControlProvider } from '@/renderer/pages/conversation/components/SideConversationPanel/SideConversationControlContext';
import type { TMessage } from '@/common/chat/chatLib';

const messages = [{ id: 'm1', position: 'left' }] as unknown as TMessage[];

/**
 * Seed a fake DOM selection anchored inside a `#message-m1` element so the
 * mouseup handler resolves the quote source message. jsdom selections are
 * inert, so document.getSelection is stubbed wholesale.
 */
function stubSelection(text: string, host: HTMLElement) {
  const textNode = document.createTextNode(text);
  host.appendChild(textNode);
  const selection = {
    isCollapsed: false,
    removeAllRanges: vi.fn(),
    toString: () => text,
    anchorNode: textNode,
    focusNode: textNode,
    getRangeAt: () => ({
      getBoundingClientRect: () => ({ top: 100, bottom: 120, left: 100, width: 40 }),
    }),
  };
  return vi.spyOn(document, 'getSelection').mockReturnValue(selection as unknown as Selection);
}

describe('SelectionReplyButton ask-in-side', () => {
  let host: HTMLElement;
  let selectSpy: ReturnType<typeof stubSelection>;

  beforeEach(() => {
    conversationContextMock.mockReturnValue({ conversation_id: 'p1', type: 'acp' });
    host = document.createElement('div');
    host.id = 'message-m1';
    document.body.appendChild(host);
    selectSpy = stubSelection('selected snippet', host);
  });
  afterEach(() => {
    selectSpy.mockRestore();
    host.remove();
  });

  it('offers ask-in-side when the surface enables it and quotes the selection', async () => {
    const onAskInSide = vi.fn();
    render(
      <SideConversationControlProvider value={{ enableSide: true, onAskInSide }}>
        <SelectionReplyButton messages={messages} />
      </SideConversationControlProvider>
    );

    fireEvent.mouseUp(document.body);
    await waitFor(() => {
      expect(screen.getByText('conversation.sideConversation.askInSide')).toBeTruthy();
    });

    fireEvent.mouseDown(screen.getByText('conversation.sideConversation.askInSide'));
    expect(onAskInSide).toHaveBeenCalledWith({
      messageId: 'm1',
      content: 'selected snippet',
      position: 'left',
    });
  });

  it('hides the ask-in-side entry inside a side thread composer', async () => {
    conversationContextMock.mockReturnValue({ conversation_id: 'c1', type: 'acp', isSideConversation: true });
    render(
      <SideConversationControlProvider value={{ enableSide: true, onAskInSide: vi.fn() }}>
        <SelectionReplyButton messages={messages} />
      </SideConversationControlProvider>
    );

    fireEvent.mouseUp(document.body);
    // Reply stays; the side entry is suppressed.
    await waitFor(() => {
      expect(screen.queryByText('conversation.sideConversation.askInSide')).toBeFalsy();
    });
  });

  it('hides the ask-in-side entry when the surface has no side control', async () => {
    render(<SelectionReplyButton messages={messages} />);

    fireEvent.mouseUp(document.body);
    await waitFor(() => {
      expect(screen.queryByText('conversation.sideConversation.askInSide')).toBeFalsy();
    });
  });
});
