/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
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
  name: 'Unread source',
  type: 'acp',
  created_at: 1,
  modified_at: 1,
  extra: { backend: 'claude' },
  model: {},
} as TChatConversation;

const makeProps = (overrides: Partial<ConversationRowProps> = {}): ConversationRowProps => ({
  conversation,
  isGenerating: false,
  hasUnread: false,
  isManualUnread: false,
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
  onToggleManualUnread: vi.fn(),
  getJobStatus: () => 'none',
  ...overrides,
});

describe('conversation mark-as-unread menu item', () => {
  it('offers "Mark as unread" when the conversation is not manually unread', async () => {
    render(<ConversationRow {...makeProps({ isManualUnread: false })} />);

    const item = await screen.findByText('conversation.history.markAsUnread');
    expect(item).toBeInTheDocument();
    expect(screen.queryByText('conversation.history.markAsRead')).not.toBeInTheDocument();
  });

  it('offers "Mark as read" when the conversation is manually unread', async () => {
    render(<ConversationRow {...makeProps({ isManualUnread: true })} />);

    const item = await screen.findByText('conversation.history.markAsRead');
    expect(item).toBeInTheDocument();
    expect(screen.queryByText('conversation.history.markAsUnread')).not.toBeInTheDocument();
  });

  it('invokes onToggleManualUnread with the conversation on click', async () => {
    const onToggleManualUnread = vi.fn();
    render(<ConversationRow {...makeProps({ onToggleManualUnread })} />);

    const item = await screen.findByText('conversation.history.markAsUnread');
    fireEvent.click(item);
    await waitFor(() => expect(onToggleManualUnread).toHaveBeenCalledWith(conversation));
  });

  it('keeps the unread actions hidden while batch selection is active', () => {
    render(<ConversationRow {...makeProps({ batchMode: true, menuVisible: false })} />);

    expect(screen.queryByText('conversation.history.markAsUnread')).not.toBeInTheDocument();
    expect(screen.queryByText('conversation.history.markAsRead')).not.toBeInTheDocument();
  });
});
