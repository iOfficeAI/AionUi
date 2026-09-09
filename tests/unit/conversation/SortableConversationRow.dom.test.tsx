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

import SortableConversationRow, {
  DragHandle,
} from '@/renderer/pages/conversation/GroupedHistory/SortableConversationRow';
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
const setNoRef = () => {};

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

  it('swallows only the click that ends a drag, and lets a plain click on the handle open the row', () => {
    const onClick = vi.fn();
    const handle = (isDragging: boolean) => (
      <div onClick={onClick}>
        <DragHandle
          conversation_id='conv-1'
          label='drag'
          isDragging={isDragging}
          setActivatorNodeRef={setNoRef}
          attributes={{} as never}
          listeners={{}}
        />
      </div>
    );
    const view = render(handle(false));
    fireEvent.click(view.getByTestId('conversation-drag-handle-conv-1'));
    expect(onClick).toHaveBeenCalledTimes(1);
    // A drag happens, then the pointer lets go over the handle: that click is not the row's.
    view.rerender(handle(true));
    view.rerender(handle(false));
    fireEvent.click(view.getByTestId('conversation-drag-handle-conv-1'));
    expect(onClick).toHaveBeenCalledTimes(1);
    // And the next plain click is the row's again.
    fireEvent.click(view.getByTestId('conversation-drag-handle-conv-1'));
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('opens the conversation from a plain click on the drag handle, which lies over the icon', () => {
    // In the collapsed rail the icon is the whole row; a tap there must open.
    renderRow();
    fireEvent.click(screen.getByTestId('conversation-drag-handle-conv-1'));
    expect(onConversationClick).toHaveBeenCalledTimes(1);
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

/**
 * The droppable wrapper sits between the row and its siblings, so it has to
 * carry the list's row spacing: otherwise rows touch and there is no gap for a
 * group member to be dropped into.
 */
describe('droppable wrappers keep the row spacing', () => {
  it('gives the sortable wrapper the sibling-margin rule', () => {
    renderRow();
    const wrapper = screen.getByTestId('conversation-drag-handle-conv-1').closest('.chat-history__item')?.parentElement;
    expect(wrapper?.className).toContain('conversation-item');
    expect(wrapper?.className).toContain('mt-2px');
  });
});
