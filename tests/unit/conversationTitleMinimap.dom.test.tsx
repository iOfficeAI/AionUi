/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ConversationTitleMinimap from '../../src/renderer/pages/conversation/components/ConversationTitleMinimap';

const minimapMocks = vi.hoisted(() => ({
  getConversationMessages: vi.fn(),
  dispatchChatMessageJump: vi.fn(),
}));

vi.mock('../../src/common', () => ({
  ipcBridge: {
    database: {
      getConversationMessages: {
        invoke: minimapMocks.getConversationMessages,
      },
    },
  },
}));

vi.mock('../../src/renderer/utils/chatMinimapEvents', () => ({
  dispatchChatMessageJump: minimapMocks.dispatchChatMessageJump,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      (
        ({
          'conversation.minimap.searchAria': 'Search conversation',
          'conversation.minimap.searchHint': 'Click here to search keywords',
          'conversation.minimap.empty': 'No Q&A turns yet',
          'conversation.minimap.noMatch': 'No matching content found',
        }) as Record<string, string>
      )[key] ??
      options?.defaultValue ??
      key,
  }),
}));

const mockMessages = [
  {
    id: 'q1',
    conversation_id: 'conversation-1',
    type: 'text',
    content: { content: 'How are you?' },
    position: 'right',
  },
  {
    id: 'a1',
    conversation_id: 'conversation-1',
    type: 'text',
    content: { content: 'Doing well.' },
    position: 'left',
  },
];

const setElectronAPI = (value?: object) => {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value,
  });
};

const openSearchInput = async () => {
  render(<ConversationTitleMinimap conversationId='conversation-1' />);

  // Click the trigger (span[role=button]) to open the minimap panel
  const trigger = screen.getByLabelText('Search conversation', { selector: 'span[role="button"]' });
  fireEvent.click(trigger);

  fireEvent.focus(await screen.findByRole('textbox', { name: 'Search conversation' }));

  await waitFor(() => {
    expect(screen.getByRole('textbox', { name: 'Search conversation' })).not.toHaveAttribute('readonly');
  });

  return screen.getByRole('textbox', { name: 'Search conversation' });
};

describe('ConversationTitleMinimap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    minimapMocks.getConversationMessages.mockResolvedValue(mockMessages);
    setElectronAPI(undefined);
  });

  it('exits search mode on blur when the keyword is empty', async () => {
    const input = await openSearchInput();

    input.focus();
    expect(input).toHaveFocus();

    await act(async () => {
      input.blur();
    });

    await waitFor(() => {
      expect(input).not.toHaveFocus();
    });

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Search conversation' })).toHaveAttribute('readonly');
    });

    expect(screen.getByRole('textbox', { name: 'Search conversation' })).toHaveAttribute(
      'placeholder',
      'Click here to search keywords'
    );
  });

  it('keeps search mode open during IME composition blur', async () => {
    const input = await openSearchInput();

    input.focus();
    expect(input).toHaveFocus();

    fireEvent.compositionStart(input);
    fireEvent.blur(input);

    const activeInput = screen.getByRole('textbox', { name: 'Search conversation' });
    await waitFor(() => {
      expect(activeInput).not.toHaveAttribute('readonly');
    });

    activeInput.focus();
    fireEvent.compositionEnd(activeInput);

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Search conversation' })).not.toHaveAttribute('readonly');
    });
  });

  it('closes the minimap after an outside click finishes IME composition', async () => {
    const input = await openSearchInput();

    fireEvent.compositionStart(input);
    fireEvent.mouseDown(document.body);

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Search conversation' })).not.toHaveAttribute('readonly');
    });

    fireEvent.compositionEnd(input);

    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: 'Search conversation' })).not.toBeInTheDocument();
    });
  });

  it('does not open the minimap on Cmd/Ctrl+Shift+F', async () => {
    setElectronAPI({});

    render(<ConversationTitleMinimap conversationId='conversation-1' />);

    await act(async () => {
      fireEvent.keyDown(document, { key: 'F', ctrlKey: true, shiftKey: true });
    });

    expect(screen.queryByRole('textbox', { name: 'Search conversation' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Search conversation', { selector: 'span[role="button"]' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });

  it('does not render the trigger button when hideTrigger=true', () => {
    render(<ConversationTitleMinimap conversationId='conversation-1' hideTrigger />);

    expect(screen.queryByLabelText('Search conversation', { selector: 'span[role="button"]' })).not.toBeInTheDocument();
  });

  it('registers Cmd+F listener when hideTrigger=true (no trigger DOM element)', async () => {
    setElectronAPI({});

    render(<ConversationTitleMinimap conversationId='conversation-1' hideTrigger />);

    expect(screen.queryByLabelText('Search conversation', { selector: 'span[role="button"]' })).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(document, { key: 'f', metaKey: true });
    });

    expect(await screen.findByRole('textbox', { name: 'Search conversation' })).toBeInTheDocument();
  });
});
