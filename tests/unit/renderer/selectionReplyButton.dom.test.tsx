import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TMessage } from '@/common/chat/chatLib';
import SelectionReplyButton from '@/renderer/pages/conversation/Messages/components/SelectionReplyButton';
import { emitter } from '@/renderer/utils/emitter';

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    emit: vi.fn(),
  },
}));

vi.mock('@icon-park/react', () => ({
  Quote: () => <span data-testid='quote-icon' />,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

const message = {
  id: 'msg-1',
  msg_id: 'msg-1',
  conversation_id: 'conv-1',
  type: 'text',
  position: 'left',
  content: { content: 'Selected reply content' },
} as TMessage;

describe('SelectionReplyButton', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows an accessible reply button for selected message text and emits reply data', async () => {
    const removeAllRanges = vi.fn();
    render(
      <>
        <div id='message-msg-1'>Selected reply content</div>
        <SelectionReplyButton messages={[message]} />
      </>
    );

    const messageElement = document.getElementById('message-msg-1')!;
    const anchor = messageElement.firstChild!;
    const getSelection = vi.spyOn(document, 'getSelection').mockReturnValue({
      isCollapsed: false,
      anchorNode: anchor,
      toString: () => 'Selected reply content',
      getRangeAt: () => ({
        getBoundingClientRect: () => ({
          top: 120,
          bottom: 140,
          left: 80,
          width: 160,
        }),
      }),
      removeAllRanges,
    } as unknown as Selection);
    vi.spyOn(window, 'getSelection').mockImplementation(() => getSelection());

    fireEvent.mouseUp(messageElement);

    const button = await screen.findByRole('button', { name: 'Reply' });
    expect(button).toHaveAttribute('title', 'Reply');

    fireEvent.mouseDown(button);

    await waitFor(() => {
      expect(emitter.emit).toHaveBeenCalledWith('sendbox.reply', {
        messageId: 'msg-1',
        content: 'Selected reply content',
        position: 'left',
      });
    });
    expect(removeAllRanges).toHaveBeenCalledTimes(1);
  });
});
