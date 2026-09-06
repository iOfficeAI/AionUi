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

const { layoutState } = vi.hoisted(() => ({ layoutState: { isMobile: false } }));
vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: layoutState.isMobile }),
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
  hasUnread: false,
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
  onCreateCronTask: vi.fn(),
  onDelete: vi.fn(),
  onTogglePin: vi.fn(),
  getJobStatus: () => 'none',
};

const renderRow = (overrides: Partial<ConversationRowProps> = {}) =>
  render(
    <DndContext>
      <SortableContext items={[pinnedConversation.id]} strategy={verticalListSortingStrategy}>
        <SortableConversationRow {...rowProps} {...overrides} />
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

  it('still offers the drag handle while the conversation is generating', () => {
    // The spinner used to take the handle's slot outright, so a working
    // conversation could not be grabbed at all.
    const view = renderRow({ isGenerating: true });
    expect(view.getByTestId('conversation-drag-handle-conv-1')).toBeInTheDocument();
    expect(view.getByTestId('conversation-busy-badge-conv-1')).toBeInTheDocument();
  });

  it('still offers the drag handle while the conversation waits on the user', () => {
    const view = renderRow({ isWaitingConfirmation: true });
    expect(view.getByTestId('conversation-drag-handle-conv-1')).toBeInTheDocument();
    expect(view.getByTestId('conversation-busy-badge-conv-1')).toBeInTheDocument();
  });

  it('leaves an idle row without a busy badge', () => {
    const view = renderRow();
    expect(view.queryByTestId('conversation-busy-badge-conv-1')).toBeNull();
  });

  it('still shows the handle it was handed in a narrow window', () => {
    // Whether the row drags is the list's decision; once handed a handle, the
    // row must not hide it on width, or a drag source is left with no activator.
    layoutState.isMobile = true;
    try {
      const view = renderRow({ isGenerating: true });
      expect(view.getByTestId('conversation-drag-handle-conv-1')).toBeInTheDocument();
      expect(view.getByTestId('conversation-busy-badge-conv-1')).toBeInTheDocument();
    } finally {
      layoutState.isMobile = false;
    }
  });
});
