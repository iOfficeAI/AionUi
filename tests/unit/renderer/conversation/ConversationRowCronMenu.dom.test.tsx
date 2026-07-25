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
  id: 'cron-menu-conversation',
  name: 'Scheduled task source',
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
  getJobStatus: () => 'none',
  ...overrides,
});

describe('conversation scheduled-task menu item', () => {
  it('renders the Timer action between Rename and Delete and invokes it for the selected row', async () => {
    const onCreateCronTask = vi.fn();
    const onEditStart = vi.fn();
    const onDelete = vi.fn();
    render(<ConversationRow {...makeProps({ onCreateCronTask, onDelete, onEditStart })} />);

    const rename = await screen.findByText('conversation.history.rename');
    const createCronTask = screen.getByText('conversation.history.createCronTask');
    const deleteItem = screen.getByText('conversation.history.deleteTitle');

    expect(rename.compareDocumentPosition(createCronTask) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(createCronTask.compareDocumentPosition(deleteItem) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(rename);
    await waitFor(() => expect(onEditStart).toHaveBeenCalledWith(conversation));
    fireEvent.click(deleteItem);
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(conversation.id));
    fireEvent.click(createCronTask);
    await waitFor(() => expect(onCreateCronTask).toHaveBeenCalledWith(conversation));
  });

  it('keeps row actions hidden while batch selection is active', () => {
    render(<ConversationRow {...makeProps({ batchMode: true, menuVisible: false })} />);

    expect(screen.queryByText('conversation.history.createCronTask')).not.toBeInTheDocument();
  });
});
