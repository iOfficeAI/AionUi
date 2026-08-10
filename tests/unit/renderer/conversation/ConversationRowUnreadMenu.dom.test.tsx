/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/renderer/hooks/agent/usePresetAssistantInfo', () => ({
  usePresetAssistantInfo: () => ({ info: null }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/pages/conversation/utils/conversationAssistantIdentity', () => ({
  resolveConversationLeadingMark: () => ({ kind: 'default' }),
}));

vi.mock('@/renderer/pages/cron', () => ({
  CronJobIndicator: () => null,
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  useAgentLogos: () => ({}),
}));

vi.mock('@/renderer/utils/ui/siderTooltip', () => ({
  cleanupSiderTooltips: vi.fn(),
  getSiderTooltipProps: () => ({ disabled: true }),
}));

import ConversationRow from '@/renderer/pages/conversation/GroupedHistory/ConversationRow';
import type { ConversationRowProps } from '@/renderer/pages/conversation/GroupedHistory/types';

const conversation = {
  id: 'unread-menu-conversation',
  name: 'Unread toggle source',
  type: 'acp',
  created_at: 1,
  modified_at: 1,
  extra: { backend: 'claude' },
  model: {},
} as TChatConversation;

const makeProps = (overrides: Partial<ConversationRowProps> = {}): ConversationRowProps => ({
  conversation,
  isGenerating: false,
  hasCompletionUnread: false,
  collapsed: false,
  tooltipEnabled: false,
  batchMode: false,
  checked: false,
  selected: false,
  menuVisible: true,
  onToggleChecked: vi.fn(),
  onConversationClick: vi.fn(),
  onOpenMenu: vi.fn(),
  onMenuVisibleChange: vi.fn(),
  onEditStart: vi.fn(),
  onCreateCronTask: vi.fn(),
  onDelete: vi.fn(),
  onTogglePin: vi.fn(),
  onToggleUnread: vi.fn(),
  getJobStatus: () => 'none',
  ...overrides,
});

describe('conversation unread menu item', () => {
  it('shows "Mark as unread" for a read conversation and invokes onToggleUnread on click', async () => {
    const onToggleUnread = vi.fn();
    render(<ConversationRow {...makeProps({ hasCompletionUnread: false, onToggleUnread })} />);

    const unreadItem = await screen.findByText('conversation.history.markAsUnread');
    expect(screen.queryByText('conversation.history.markAsRead')).not.toBeInTheDocument();

    fireEvent.click(unreadItem);
    await waitFor(() => expect(onToggleUnread).toHaveBeenCalledWith(conversation));
  });

  it('shows "Mark as read" for an unread conversation and invokes onToggleUnread on click', async () => {
    const onToggleUnread = vi.fn();
    render(<ConversationRow {...makeProps({ hasCompletionUnread: true, onToggleUnread })} />);

    const readItem = await screen.findByText('conversation.history.markAsRead');
    expect(screen.queryByText('conversation.history.markAsUnread')).not.toBeInTheDocument();

    fireEvent.click(readItem);
    await waitFor(() => expect(onToggleUnread).toHaveBeenCalledWith(conversation));
  });

  it('renders the unread item between Pin and Rename', async () => {
    render(<ConversationRow {...makeProps()} />);

    const pin = await screen.findByText('conversation.history.pin');
    const unreadItem = screen.getByText('conversation.history.markAsUnread');
    const rename = screen.getByText('conversation.history.rename');

    expect(pin.compareDocumentPosition(unreadItem) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(unreadItem.compareDocumentPosition(rename) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('hides the unread item in batch mode', () => {
    render(<ConversationRow {...makeProps({ batchMode: true, menuVisible: false })} />);

    expect(screen.queryByText('conversation.history.markAsUnread')).not.toBeInTheDocument();
    expect(screen.queryByText('conversation.history.markAsRead')).not.toBeInTheDocument();
  });
});
