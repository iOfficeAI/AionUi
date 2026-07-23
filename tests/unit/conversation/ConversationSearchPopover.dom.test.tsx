/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  search: vi.fn(),
  groupedHistory: {
    pinnedConversations: [] as unknown[],
    timelineSections: [] as unknown[],
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    database: {
      searchConversationMessages: {
        invoke: (...args: unknown[]) => mocks.search(...args),
      },
    },
  },
}));

vi.mock('@/renderer/hooks/context/ConversationHistoryContext', () => ({
  useConversationHistoryContext: () => ({ groupedHistory: mocks.groupedHistory }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/renderer/components/base/AionModal', () => ({
  default: ({ children, visible }: { children: React.ReactNode; visible: boolean }) =>
    visible ? <div data-testid='conversation-search-modal'>{children}</div> : null,
}));

vi.mock('@/renderer/components/base', () => ({
  AionSearchInput: ({
    inputProps,
    onChange,
    placeholder,
    value,
  }: {
    inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
    onChange: (value: string) => void;
    placeholder?: string;
    value: string;
  }) => (
    <input
      {...inputProps}
      data-testid='conversation-search-input'
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

vi.mock('@/renderer/hooks/agent/usePresetAssistantInfo', () => ({
  usePresetAssistantInfo: () => ({ info: null }),
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  useAgentLogos: () => ({}),
}));

vi.mock('@/renderer/pages/conversation/utils/conversationAssistantIdentity', () => ({
  resolveConversationLeadingMark: () => ({ kind: 'default' }),
}));

vi.mock('@/renderer/utils/ui/focus', () => ({
  blockMobileInputFocus: vi.fn(),
  blurActiveElement: vi.fn(),
}));

vi.mock('@icon-park/react', () => ({
  Close: () => <span />,
  MessageOne: () => <span />,
  Robot: () => <span />,
  Search: () => <span />,
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({
    children,
    long: _long,
    type: _type,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & { long?: boolean }) => (
    <button type='button' {...props}>
      {children}
    </button>
  ),
  Empty: ({ description }: { description?: React.ReactNode }) => <div>{description}</div>,
  Spin: () => <div>loading</div>,
  Typography: {
    Paragraph: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  },
}));

import ConversationSearchPopover from '@/renderer/pages/conversation/GroupedHistory/ConversationSearchPopover';

const conversation = (id: string, modifiedAt: number) => ({
  id,
  name: id,
  type: 'acp',
  created_at: modifiedAt,
  modified_at: modifiedAt,
  extra: { backend: 'aioncore' },
});

const renderSearch = () => {
  render(
    <ConversationSearchPopover
      renderTrigger={({ onClick }) => (
        <button type='button' onClick={onClick}>
          Open search
        </button>
      )}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Open search' }));
};

describe('ConversationSearchPopover quick switcher', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.navigate.mockReset();
    mocks.search.mockReset();
    mocks.search.mockResolvedValue({ items: [], has_more: false });
    mocks.groupedHistory = {
      pinnedConversations: [conversation('older', 10)],
      timelineSections: [
        {
          timeline: 'recent',
          items: [{ type: 'conversation', time: 20, conversation: conversation('newer', 20) }],
        },
      ],
    };
  });

  it('shows recent conversations by activity and opens the active row with Enter', async () => {
    renderSearch();

    const options = await screen.findAllByRole('option');
    expect(options[0]).toHaveTextContent('newer');
    expect(options[1]).toHaveTextContent('older');

    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });

    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith('/conversation/newer', {
        state: { fromConversationSearch: true },
      })
    );
  });

  it('wraps upward from the first recent conversation to the last', async () => {
    renderSearch();
    const input = screen.getByRole('combobox');

    await waitFor(() => expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true'));
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/conversation/older', expect.anything()));
  });

  it('keeps mouse hover synchronized with keyboard selection', async () => {
    renderSearch();
    const options = await screen.findAllByRole('option');

    fireEvent.mouseEnter(options[1]);

    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    expect(options[0]).toHaveAttribute('aria-selected', 'false');
  });

  it('starts the typed search instead of opening a recent conversation when Enter beats the debounce', async () => {
    renderSearch();
    const input = screen.getByRole('combobox');
    await waitFor(() => expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true'));

    fireEvent.change(input, { target: { value: 'needle' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mocks.navigate).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(mocks.search).toHaveBeenCalledWith({
        keyword: 'needle',
        page: 0,
        page_size: 20,
      })
    );
  });

  it('starts a search from a saved keyword alongside recent conversations', async () => {
    localStorage.setItem('conversation.historySearch.recentKeywords', JSON.stringify(['saved search']));
    renderSearch();

    fireEvent.click(await screen.findByRole('button', { name: 'saved search' }));
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });

    await waitFor(() =>
      expect(mocks.search).toHaveBeenCalledWith({
        keyword: 'saved search',
        page: 0,
        page_size: 20,
      })
    );
  });

  it('resets selection for typed results and preserves target-message navigation', async () => {
    mocks.search.mockResolvedValueOnce({
      items: [
        {
          conversation: conversation('matched', 30),
          message_id: 'message-1',
          message_created_at: 30,
          preview_text: 'needle in the message',
        },
      ],
      has_more: false,
    });
    renderSearch();
    const input = screen.getByRole('combobox');

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.change(input, { target: { value: 'needle' } });

    await waitFor(() => expect(mocks.search).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('option')).toHaveAttribute('aria-selected', 'true'));
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() =>
      expect(mocks.navigate).toHaveBeenCalledWith('/conversation/matched', {
        state: {
          targetMessageId: 'message-1',
          fromConversationSearch: true,
        },
      })
    );
  });

  it('does not navigate from a composing Enter key event', async () => {
    renderSearch();

    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter', isComposing: true });

    await waitFor(() => expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true'));
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('closes without navigating when Escape is pressed', async () => {
    renderSearch();

    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Escape' });

    await waitFor(() => expect(screen.queryByTestId('conversation-search-modal')).not.toBeInTheDocument());
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('shows the empty search state and does not navigate when search fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.search.mockRejectedValueOnce(new Error('search failed'));
    renderSearch();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'missing' } });

    expect(await screen.findByText('conversation.historySearch.empty')).toBeInTheDocument();
    expect(mocks.navigate).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
