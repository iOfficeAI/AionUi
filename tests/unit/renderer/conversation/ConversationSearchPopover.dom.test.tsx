/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ConversationSearchPopover from '@/renderer/pages/conversation/GroupedHistory/ConversationSearchPopover';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light', fontScale: 1 }),
}));

vi.mock('@/renderer/hooks/agent/usePresetAssistantInfo', () => ({
  usePresetAssistantInfo: () => ({ info: undefined }),
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  useAgentLogos: () => ({}),
}));

vi.mock('@/renderer/pages/conversation/utils/conversationAssistantIdentity', () => ({
  resolveConversationLeadingMark: () => ({ kind: 'message', label: 'Message', value: '' }),
}));

vi.mock('@/renderer/components/base', () => ({
  AionSearchInput: ({
    value,
    onChange,
    onClear,
  }: {
    value: string;
    onChange: (value: string) => void;
    onClear: () => void;
  }) => (
    <input
      data-testid='conversation-search-input'
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClear();
      }}
    />
  ),
}));

vi.mock('@/renderer/components/base/AionModal', () => ({
  default: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => (
    <div data-testid='conversation-search-modal' style={{ display: visible ? 'block' : 'none' }}>
      {children}
    </div>
  ),
}));

const { searchMock } = vi.hoisted(() => ({ searchMock: vi.fn() }));

vi.mock('@/common', () => ({
  ipcBridge: {
    database: {
      searchConversationMessages: {
        invoke: searchMock,
      },
    },
  },
}));

describe('ConversationSearchPopover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchMock.mockResolvedValue({ items: [], has_more: false });
  });

  it('filters out team member conversations from search results', async () => {
    searchMock.mockResolvedValue({
      items: [
        {
          message_id: 'msg-1',
          message_created_at: 1,
          preview_text: 'hello world',
          conversation: { id: 'conv-normal', name: 'Normal', extra: {} },
        },
        {
          message_id: 'msg-2',
          message_created_at: 2,
          preview_text: 'team message',
          conversation: { id: 'conv-team', name: 'Team Member', extra: { team_id: 'team-1' } },
        },
      ],
      has_more: false,
    });

    render(<ConversationSearchPopover />);
    fireEvent.click(screen.getByLabelText('conversation.historySearch.tooltip'));
    expect(screen.getByTestId('conversation-search-modal')).toBeVisible();

    const input = screen.getByTestId('conversation-search-input');
    fireEvent.change(input, { target: { value: 'test' } });

    await waitFor(() => expect(searchMock).toHaveBeenCalled());

    expect(screen.getByText('Normal')).toBeInTheDocument();
    expect(screen.queryByText('Team Member')).not.toBeInTheDocument();
  });

  it('renders all results when no team member conversations are present', async () => {
    searchMock.mockResolvedValue({
      items: [
        {
          message_id: 'msg-1',
          message_created_at: 1,
          preview_text: 'hello world',
          conversation: { id: 'conv-normal', name: 'Normal', extra: {} },
        },
      ],
      has_more: false,
    });

    render(<ConversationSearchPopover />);
    fireEvent.click(screen.getByLabelText('conversation.historySearch.tooltip'));

    const input = screen.getByTestId('conversation-search-input');
    fireEvent.change(input, { target: { value: 'test' } });

    await waitFor(() => expect(searchMock).toHaveBeenCalled());

    expect(screen.getByText('Normal')).toBeInTheDocument();
  });
});
