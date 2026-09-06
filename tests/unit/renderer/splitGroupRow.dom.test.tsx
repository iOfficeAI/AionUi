/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The split-group block in the sidebar: a labelled container with one row per
 * member, and three distinct clicks — the block opens the group, a member row
 * opens it with that member focused, the remove button takes only that member
 * out. The container has to read as one group at a glance, so its header line,
 * its accent bar and its tint are part of the contract.
 *
 * A member row is a browser tab: its icon slot becomes the remove button while
 * the pointer or the keyboard is on it, and its grab handle keeps a slot of its
 * own so a working row is still draggable — the gesture that takes it out of
 * the group.
 */

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DndContext } from '@dnd-kit/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TChatConversation } from '@/common/config/storage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (options && typeof options.name === 'string') return `${key}:${options.name}`;
      if (options && typeof options.count === 'number') return `${key}:${options.count}`;
      return key;
    },
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

import { ConversationRowMenu } from '@/renderer/pages/conversation/GroupedHistory/ConversationRow';
import SplitGroupRow from '@/renderer/pages/conversation/GroupedHistory/SplitGroupRow';
import type { ConversationRowProps } from '@/renderer/pages/conversation/GroupedHistory/types';
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

/** The pointer arriving on a member row, which is what reveals its remove button. */
const engage = (id: string) => fireEvent.mouseEnter(screen.getByTestId(`split-group-member-${id}`));
const disengage = (id: string) => fireEvent.mouseLeave(screen.getByTestId(`split-group-member-${id}`));

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

  it('heads the block with the split label and the member count', () => {
    renderPill();
    const label = screen.getByTestId('split-group-label-g1');
    expect(label.textContent).toBe('conversation.splitGroup.blockLabel:3');
  });

  it('counts only the members it actually shows', () => {
    cleanup();
    renderPill({ group: { id: 'g1', members: [member('a', 0), member('b', 1)] } });
    expect(screen.getByTestId('split-group-label-g1').textContent).toBe('conversation.splitGroup.blockLabel:2');
  });

  it('drops the header line in the collapsed rail, where there is no room for it', () => {
    cleanup();
    renderPill({ collapsed: true });
    expect(screen.queryByTestId('split-group-label-g1')).toBeNull();
    expect(screen.getByTestId('leading-icon-a')).toBeInTheDocument();
  });

  it('draws the accent bar and a tinted container, and deepens the tint when the group is open', () => {
    renderPill();
    const block = screen.getByTestId('split-group-row-g1');
    expect(block.querySelector('span[aria-hidden="true"].w-2px')).not.toBeNull();
    expect(block.className).toContain('bg-fill-2');
    cleanup();
    renderPill({ selected: true });
    const open = screen.getByTestId('split-group-row-g1');
    expect(open.className).toContain('bg-[rgba(var(--primary-6),0.10)]');
    // The old look boxed the open group in with a heavy grey fill.
    expect(open.className).not.toContain('bg-fill-3');
  });

  it('keeps the icon slot to itself until the row is engaged, then swaps it for the remove button', () => {
    renderPill();
    expect(screen.queryAllByTestId(/^split-group-remove-/)).toHaveLength(0);

    engage('a');
    const remove = screen.getByTestId('split-group-remove-a');
    expect(remove).toHaveAttribute('aria-label', 'conversation.splitGroup.removeMember:Conversation a');
    // Only the engaged row swaps: the block is not a row of × buttons.
    expect(screen.getAllByTestId(/^split-group-remove-/)).toHaveLength(1);
    // The icon it replaced is still mounted, just out of sight.
    expect(screen.getByTestId('leading-icon-a').parentElement?.className).toContain('opacity-0');

    disengage('a');
    expect(screen.queryByTestId('split-group-remove-a')).toBeNull();
    expect(screen.getByTestId('leading-icon-a').parentElement?.className).not.toContain('opacity-0');
  });

  it('swaps the slot for a row that is working too, and keeps its grab handle', () => {
    renderPill();
    // Member b is the generating one.
    expect(screen.getByTestId('leading-icon-b')).toHaveAttribute('data-generating', 'true');
    expect(screen.getByTestId('split-group-drag-handle-b')).toBeInTheDocument();

    engage('b');
    expect(screen.getByTestId('split-group-remove-b')).toBeInTheDocument();
    // The handle has a slot of its own, so it never contends with the spinner.
    expect(screen.getByTestId('split-group-drag-handle-b')).toBeInTheDocument();
  });

  it('reveals the remove button for the keyboard too, and hides it again on the way out', () => {
    renderPill();
    const row = screen.getByTestId('split-group-member-c');
    fireEvent.focus(row);
    expect(screen.getByTestId('split-group-remove-c')).toBeInTheDocument();
    fireEvent.blur(row, { relatedTarget: document.body });
    expect(screen.queryByTestId('split-group-remove-c')).toBeNull();
  });

  it('gives every member a grab handle, so any of them can be dragged out', () => {
    renderPill();
    expect(screen.getAllByTestId(/^split-group-drag-handle-/)).toHaveLength(3);
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
    engage('c');
    fireEvent.click(screen.getByTestId('split-group-remove-c'));
    expect(onRemoveMember).toHaveBeenCalledTimes(1);
    expect(onRemoveMember).toHaveBeenCalledWith(group, 'c');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('hides the remove buttons and ignores clicks while batch-selecting', () => {
    const { onOpen } = renderPill({ batchMode: true });
    engage('b');
    expect(screen.queryAllByTestId(/^split-group-remove-/)).toHaveLength(0);
    fireEvent.click(screen.getByTestId('split-group-row-g1'));
    fireEvent.click(screen.getByTestId('leading-icon-b'));
    fireEvent.keyDown(screen.getByTestId('leading-icon-b').parentElement as HTMLElement, { key: 'Enter' });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('hides the remove buttons and the handles in the collapsed rail, where there is no room', () => {
    renderPill({ collapsed: true });
    engage('a');
    expect(screen.queryAllByTestId(/^split-group-remove-/)).toHaveLength(0);
    expect(screen.queryAllByTestId(/^split-group-drag-handle-/)).toHaveLength(0);
  });
});

/**
 * A member row's right-click menu is the plain row's menu plus one item that
 * only a member has any use for. Everything else a conversation can do it can
 * still do from inside a split group.
 */
describe('SplitGroupRow member menu', () => {
  const menuProps = (conversation: TChatConversation, menuVisible: boolean): ConversationRowProps =>
    ({
      conversation,
      isGenerating: false,
      isWaitingConfirmation: false,
      hasUnread: false,
      isManualUnread: false,
      collapsed: false,
      tooltipEnabled: false,
      batchMode: false,
      checked: false,
      selected: false,
      menuVisible,
      onToggleChecked: vi.fn(),
      onConversationClick: vi.fn(),
      onOpenMenu: vi.fn(),
      onMenuVisibleChange: vi.fn(),
      onEditStart: vi.fn(),
      onCreateCronTask: vi.fn(),
      onArchive: vi.fn(),
      onTogglePin: vi.fn(),
      onToggleManualUnread: vi.fn(),
      getJobStatus: () => 'none',
    }) as ConversationRowProps;

  it('offers "remove from split" alongside the usual row actions, and removes that member', async () => {
    const { onRemoveMember, onOpen } = renderPill({
      getMemberRowProps: (conversation) => menuProps(conversation, conversation.id === 'b'),
    });
    expect(await screen.findByText('conversation.history.rename')).toBeInTheDocument();
    fireEvent.click(screen.getByText('conversation.splitGroup.removeFromSplit'));
    expect(onRemoveMember).toHaveBeenCalledWith(group, 'b');
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("leaves the item out of a plain row's menu, which has no group to leave", async () => {
    render(<ConversationRowMenu {...menuProps(member('z', 0), true)} />);
    expect(await screen.findByText('conversation.history.rename')).toBeInTheDocument();
    expect(screen.queryByText('conversation.splitGroup.removeFromSplit')).toBeNull();
  });
});

/**
 * A split group can be named. The header carries the name and the size
 * together, falls back to the size alone while it is unnamed, and offers the
 * rename two ways: a pencil that appears with the pointer, and its own
 * right-click menu.
 */
describe('SplitGroupRow rename', () => {
  const namedGroup: SplitGroup = { ...group, name: 'Research' };

  it('falls back to the size alone while the group is unnamed', () => {
    renderPill({ onRenameGroup: vi.fn() });
    expect(screen.getByTestId('split-group-label-g1').textContent).toContain('conversation.splitGroup.blockLabel:3');
  });

  it('shows the name and the size together once the group is named', () => {
    renderPill({ group: namedGroup, onRenameGroup: vi.fn() });
    expect(screen.getByTestId('split-group-label-g1').textContent).toContain(
      'conversation.splitGroup.blockLabelNamed:Research'
    );
  });

  it('offers no pencil at all when renaming is not wired up', () => {
    renderPill();
    expect(screen.queryByTestId('split-group-rename-g1')).toBeNull();
  });

  it('opens the rename box on the current name and saves the new one', async () => {
    const onRenameGroup = vi.fn(async () => true);
    const { onOpen } = renderPill({ group: namedGroup, onRenameGroup });
    fireEvent.click(screen.getByTestId('split-group-rename-g1'));

    const input = (await screen.findByTestId(`split-group-rename-input-g1`)) as HTMLInputElement;
    expect(input.value).toBe('Research');
    // Sixty characters is the ceiling: past that a name stops being a label.
    expect(input.maxLength).toBe(60);

    fireEvent.change(input, { target: { value: 'Weekly review' } });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 });
    expect(onRenameGroup).toHaveBeenCalledWith(namedGroup, 'Weekly review');
    // Renaming from the header must not open the group behind the box.
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('hands an emptied box straight through, so the name can be cleared', async () => {
    const onRenameGroup = vi.fn(async () => true);
    renderPill({ group: namedGroup, onRenameGroup });
    fireEvent.click(screen.getByTestId('split-group-rename-g1'));
    const input = await screen.findByTestId('split-group-rename-input-g1');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 });
    expect(onRenameGroup).toHaveBeenCalledWith(namedGroup, '   ');
  });

  it('closes the box once the name is stored', async () => {
    const onRenameGroup = vi.fn(async () => true);
    renderPill({ group: namedGroup, onRenameGroup });
    fireEvent.click(screen.getByTestId('split-group-rename-g1'));
    const input = await screen.findByTestId('split-group-rename-input-g1');
    fireEvent.change(input, { target: { value: 'Weekly review' } });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 });
    await waitFor(() => expect((screen.getByTestId('split-group-rename-input-g1') as HTMLInputElement).value).toBe(''));
  });

  it('keeps the box open with the typed name when the write is refused', async () => {
    const onRenameGroup = vi.fn(async () => false);
    renderPill({ group: namedGroup, onRenameGroup });
    fireEvent.click(screen.getByTestId('split-group-rename-g1'));
    const input = await screen.findByTestId('split-group-rename-input-g1');
    fireEvent.change(input, { target: { value: 'Weekly review' } });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 });
    await waitFor(() => expect(onRenameGroup).toHaveBeenCalledTimes(1));
    // Nothing was stored, so nothing is forgotten: the name is still there to
    // try again with.
    expect((screen.getByTestId('split-group-rename-input-g1') as HTMLInputElement).value).toBe('Weekly review');
  });

  it('ignores the Enter that confirms an IME composition', async () => {
    const onRenameGroup = vi.fn(async () => true);
    renderPill({ group: namedGroup, onRenameGroup });
    fireEvent.click(screen.getByTestId('split-group-rename-g1'));
    const input = await screen.findByTestId('split-group-rename-input-g1');
    fireEvent.change(input, { target: { value: '研究' } });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13, isComposing: true });
    expect(onRenameGroup).not.toHaveBeenCalled();
    // The Enter after the composition is the one that means "save".
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 });
    expect(onRenameGroup).toHaveBeenCalledWith(namedGroup, '研究');
  });

  it('renames through an Arco control, not a hand-rolled one', () => {
    renderPill({ group: namedGroup, onRenameGroup: vi.fn(async () => true) });
    const pencil = screen.getByTestId('split-group-rename-g1');
    expect(pencil.tagName).toBe('BUTTON');
    expect(pencil.className).toContain('arco-btn');
  });

  it('pins the pencil open where the pointer cannot hover', () => {
    const original = window.matchMedia;
    // A touch-capable desktop is not "mobile", and a hover-reveal control
    // there is a control nobody can uncover.
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: (query: string) => ({ matches: query.includes('hover: none'), media: query }),
    });
    try {
      renderPill({ group: namedGroup, onRenameGroup: vi.fn(async () => true) });
      expect(screen.getByTestId('split-group-rename-g1').className).toContain('opacity-100');
      expect(screen.getByTestId('split-group-rename-g1').className).not.toContain('opacity-0');
    } finally {
      Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: original });
    }
  });

  it('leaves the pencil to hover where the pointer can hover', () => {
    renderPill({ group: namedGroup, onRenameGroup: vi.fn(async () => true) });
    expect(screen.getByTestId('split-group-rename-g1').className).toContain('opacity-0');
  });
});

/**
 * Reaching a member row without a mouse. The remove button already appears on
 * focus; the grab handle and the action menu are the two that did not answer
 * the keyboard at all.
 */
describe('SplitGroupRow keyboard reach', () => {
  const menuProps = (conversation: TChatConversation, menuVisible: boolean): ConversationRowProps =>
    ({
      conversation,
      isGenerating: false,
      isWaitingConfirmation: false,
      hasUnread: false,
      isManualUnread: false,
      collapsed: false,
      tooltipEnabled: false,
      batchMode: false,
      checked: false,
      selected: false,
      menuVisible,
      onToggleChecked: vi.fn(),
      onConversationClick: vi.fn(),
      onOpenMenu: vi.fn(),
      onMenuVisibleChange: vi.fn(),
      onEditStart: vi.fn(),
      onCreateCronTask: vi.fn(),
      onArchive: vi.fn(),
      onTogglePin: vi.fn(),
      onToggleManualUnread: vi.fn(),
      getJobStatus: () => 'none',
    }) as ConversationRowProps;

  it('keeps the grab handle out of the tab order and out of the accessibility tree', () => {
    renderPill();
    const handle = screen.getByTestId('split-group-drag-handle-a');
    // Only a PointerSensor is registered: a tab stop here would do nothing.
    expect(handle).toHaveAttribute('tabindex', '-1');
    expect(handle).toHaveAttribute('aria-hidden', 'true');
  });

  it('does not open the member when a key is pressed on the handle', () => {
    const { onOpen } = renderPill();
    fireEvent.keyDown(screen.getByTestId('split-group-drag-handle-a'), { key: 'Enter' });
    fireEvent.keyDown(screen.getByTestId('split-group-drag-handle-a'), { key: ' ' });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('gives the row a focusable menu button, so the actions are not behind a right-click', () => {
    const onOpenMenu = vi.fn();
    renderPill({
      getMemberRowProps: (conversation) => ({ ...menuProps(conversation, false), onOpenMenu }),
    });
    const button = screen.getByTestId('split-group-member-menu-b');
    expect(button).toHaveAttribute('tabindex', '0');
    expect(button).toHaveAttribute('aria-label', 'conversation.splitGroup.memberActions:Conversation b');

    fireEvent.keyDown(button, { key: 'Enter' });
    expect(onOpenMenu).toHaveBeenCalledTimes(1);
    expect(onOpenMenu.mock.calls[0][0].id).toBe('b');
  });

  it('opens the menu on a click of that button without opening the member', () => {
    const onOpenMenu = vi.fn();
    const { onOpen } = renderPill({
      getMemberRowProps: (conversation) => ({ ...menuProps(conversation, false), onOpenMenu }),
    });
    fireEvent.click(screen.getByTestId('split-group-member-menu-c'));
    expect(onOpenMenu).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('offers no menu button where there is no menu — the collapsed rail and batch mode', () => {
    renderPill({ collapsed: true, getMemberRowProps: (conversation) => menuProps(conversation, false) });
    expect(screen.queryAllByTestId(/^split-group-member-menu-/)).toHaveLength(0);
    cleanup();
    renderPill({ batchMode: true, getMemberRowProps: (conversation) => menuProps(conversation, false) });
    expect(screen.queryAllByTestId(/^split-group-member-menu-/)).toHaveLength(0);
  });
});
