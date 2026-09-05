/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The split-group pill in the sidebar: one leading icon per member, one × per
 * member, and three distinct clicks — the pill opens the group, an icon opens
 * it with that member focused, a × removes only that member.
 */

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TChatConversation } from '@/common/config/storage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && typeof options.name === 'string' ? `${key}:${options.name}` : key,
  }),
}));
vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false, siderCollapsed: false, setSiderCollapsed: () => {} }),
}));
vi.mock('@/renderer/pages/conversation/GroupedHistory/ConversationLeadingIcon', () => ({
  default: ({ conversation, isGenerating }: { conversation: TChatConversation; isGenerating?: boolean }) => (
    <span data-testid={`leading-icon-${conversation.id}`} data-generating={isGenerating ? 'true' : 'false'} />
  ),
}));

import SplitGroupRow from '@/renderer/pages/conversation/GroupedHistory/SplitGroupRow';
import type { SplitGroup } from '@/renderer/pages/conversation/GroupedHistory/utils/splitGroupHelpers';

const member = (id: string, order: number): TChatConversation =>
  ({
    id,
    name: `Conversation ${id}`,
    type: 'acp',
    created_at: 1,
    modified_at: 1,
    extra: { split_group: { id: 'g1', order } },
  }) as TChatConversation;

const group: SplitGroup = { id: 'g1', members: [member('a', 0), member('b', 1), member('c', 2)] };

const renderPill = (overrides: Partial<React.ComponentProps<typeof SplitGroupRow>> = {}) => {
  const onOpen = vi.fn();
  const onRemoveMember = vi.fn();
  render(
    <DndContext>
      <SplitGroupRow
        group={group}
        collapsed={false}
        tooltipEnabled={false}
        batchMode={false}
        selected={false}
        isGenerating={(id) => id === 'b'}
        isWaitingConfirmation={() => false}
        hasUnread={(id) => id === 'c'}
        getJobStatus={() => 'none'}
        onOpen={onOpen}
        onRemoveMember={onRemoveMember}
        {...overrides}
      />
    </DndContext>
  );
  return { onOpen, onRemoveMember };
};

afterEach(() => {
  cleanup();
});

describe('SplitGroupRow', () => {
  it('renders one leading icon per member, in column order', () => {
    renderPill();
    const icons = screen.getAllByTestId(/^leading-icon-/);
    expect(icons.map((icon) => icon.getAttribute('data-testid'))).toEqual([
      'leading-icon-a',
      'leading-icon-b',
      'leading-icon-c',
    ]);
  });

  it("renders every member's full title, one row per member", () => {
    renderPill();
    expect(screen.getByTestId('split-group-title-a').textContent).toBe('Conversation a');
    expect(screen.getByTestId('split-group-title-b').textContent).toBe('Conversation b');
    expect(screen.getByTestId('split-group-title-c').textContent).toBe('Conversation c');
    expect(screen.getAllByTestId(/^split-group-member-[abc]$/)).toHaveLength(3);
  });

  it('renders both titles for a two-member group', () => {
    const pair: SplitGroup = { id: 'g1', members: [member('a', 0), member('b', 1)] };
    renderPill({ group: pair });
    expect(screen.getByText('Conversation a')).toBeInTheDocument();
    expect(screen.getByText('Conversation b')).toBeInTheDocument();
  });

  it('keeps the icons but drops the titles in the collapsed rail', () => {
    renderPill({ collapsed: true });
    expect(screen.getAllByTestId(/^leading-icon-/)).toHaveLength(3);
    expect(screen.queryAllByTestId(/^split-group-title-/)).toHaveLength(0);
  });

  it('renders one × per member, each naming its member', () => {
    renderPill();
    expect(screen.getByTestId('split-group-remove-a')).toHaveAttribute(
      'aria-label',
      'conversation.splitGroup.removeMember:Conversation a'
    );
    expect(screen.getAllByTestId(/^split-group-remove-/)).toHaveLength(3);
  });

  it('passes each member its own live state', () => {
    renderPill();
    expect(screen.getByTestId('leading-icon-b')).toHaveAttribute('data-generating', 'true');
    expect(screen.getByTestId('leading-icon-a')).toHaveAttribute('data-generating', 'false');
    expect(screen.getByTestId('split-group-member-unread-c')).toBeInTheDocument();
    expect(screen.queryByTestId('split-group-member-unread-a')).toBeNull();
  });

  it('opens the group when the pill body is clicked', () => {
    const { onOpen } = renderPill();
    fireEvent.click(screen.getByTestId('split-group-row-g1'));
    expect(onOpen).toHaveBeenCalledWith(group);
  });

  it('opens the group with that member focused when its row is clicked, without opening twice', () => {
    const { onOpen } = renderPill();
    fireEvent.click(screen.getByTestId('split-group-title-b'));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith(group, 'b');
  });

  it('removes only the clicked member and does not open the group', () => {
    const { onOpen, onRemoveMember } = renderPill();
    fireEvent.click(screen.getByTestId('split-group-remove-c'));
    expect(onRemoveMember).toHaveBeenCalledTimes(1);
    expect(onRemoveMember).toHaveBeenCalledWith(group, 'c');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('hides the × buttons and ignores clicks while batch-selecting', () => {
    const { onOpen } = renderPill({ batchMode: true });
    expect(screen.queryAllByTestId(/^split-group-remove-/)).toHaveLength(0);
    fireEvent.click(screen.getByTestId('split-group-row-g1'));
    fireEvent.click(screen.getByTestId('leading-icon-b'));
    fireEvent.keyDown(screen.getByTestId('leading-icon-b').parentElement as HTMLElement, { key: 'Enter' });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('hides the × buttons in the collapsed rail', () => {
    renderPill({ collapsed: true });
    expect(screen.queryAllByTestId(/^split-group-remove-/)).toHaveLength(0);
  });
});
