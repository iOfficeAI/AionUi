/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DndContext } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { TChatConversation } from '@/common/config/storage';

vi.mock('@/renderer/hooks/agent/usePresetAssistantInfo', () => ({
  usePresetAssistantInfo: () => ({ info: null }),
}));

vi.mock('@/renderer/utils/model/agentLogo', () => ({
  useAgentLogos: () => ({}),
}));

vi.mock('@/renderer/pages/cron', () => ({
  CronJobIndicator: () => null,
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/pages/conversation/utils/conversationAssistantIdentity', () => ({
  resolveConversationLeadingMark: () => ({ kind: 'default' }),
}));

import SortableConversationRow from '@/renderer/pages/conversation/GroupedHistory/SortableConversationRow';
import type { ConversationRowProps } from '@/renderer/pages/conversation/GroupedHistory/types';

const pinnedConversation = {
  id: 'conv-1',
  name: 'Pinned chat',
  type: 'acp',
  created_at: 1,
  modified_at: 1,
  extra: { pinned: true },
} as unknown as TChatConversation;

const onConversationClick = vi.fn();

const rowProps: ConversationRowProps = {
  conversation: pinnedConversation,
  isGenerating: false,
  hasCompletionUnread: false,
  collapsed: false,
  tooltipEnabled: false,
  batchMode: false,
  checked: false,
  selected: false,
  menuVisible: false,
  onToggleChecked: vi.fn(),
  onConversationClick,
  onOpenMenu: vi.fn(),
  onMenuVisibleChange: vi.fn(),
  onEditStart: vi.fn(),
  onDelete: vi.fn(),
  onTogglePin: vi.fn(),
  getJobStatus: () => 'none',
};

const renderRow = () =>
  render(
    <DndContext>
      <SortableContext items={[pinnedConversation.id]} strategy={verticalListSortingStrategy}>
        <SortableConversationRow {...rowProps} />
      </SortableContext>
    </DndContext>
  );

describe('SortableConversationRow', () => {
  it('renders a drag handle overlaying the leading icon for pinned rows', () => {
    renderRow();
    expect(screen.getByTestId('conversation-drag-handle-conv-1')).toBeInTheDocument();
  });

  it('does not open the conversation when the drag handle is clicked', () => {
    renderRow();
    fireEvent.click(screen.getByTestId('conversation-drag-handle-conv-1'));
    expect(onConversationClick).not.toHaveBeenCalled();
  });
});
