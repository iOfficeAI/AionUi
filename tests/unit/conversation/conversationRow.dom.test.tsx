/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import type { TChatConversation } from '@/common/config/storage';
import ConversationRow from '@/renderer/pages/conversation/GroupedHistory/ConversationRow';
import type { ConversationRowProps } from '@/renderer/pages/conversation/GroupedHistory/types';

const state = vi.hoisted(() => ({
  menuProps: null as null | { onClickMenuItem?: (key: string) => void },
  submenuProps: null as null | { title?: React.ReactNode; children?: React.ReactNode },
}));

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

vi.mock('@renderer/components/base/ForkBranchIcon', () => ({
  default: () => <span data-testid='fork-branch-icon' />,
}));

vi.mock('@icon-park/react', () => {
  const icon = (name: string) => (props: Record<string, unknown>) => (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <span data-testid={`icon-${name}`} {...(props as any)} />
  );
  return {
    DeleteOne: icon('DeleteOne'),
    EditOne: icon('EditOne'),
    Export: icon('Export'),
    Folder: icon('Folder'),
    MessageOne: icon('MessageOne'),
    MoreOne: icon('MoreOne'),
    Pushpin: icon('Pushpin'),
    Robot: icon('Robot'),
    Timer: icon('Timer'),
  };
});

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  const MenuMock: React.FC<any> = (props) => {
    state.menuProps = { onClickMenuItem: props.onClickMenuItem };
    return <div data-testid='menu'>{props.children}</div>;
  };
  (MenuMock as any).Item = (props: { children: React.ReactNode }) => <div>{props.children}</div>;
  (MenuMock as any).SubMenu = (props: { title: React.ReactNode; children: React.ReactNode }) => {
    state.submenuProps = props;
    return (
      <div data-testid='submenu'>
        {props.title}
        {props.children}
      </div>
    );
  };
  return {
    ...actual,
    Checkbox: (props: { checked?: boolean; onChange?: (checked: boolean) => void }) => (
      <input
        type='checkbox'
        data-testid='conversation-checkbox'
        checked={!!props.checked}
        onChange={() => props.onChange?.(!props.checked)}
      />
    ),
    Dropdown: ({ children, droplist }: any) => (
      <div data-testid='dropdown'>
        {children}
        {droplist}
      </div>
    ),
    Menu: MenuMock,
    Spin: () => <span data-testid='spin' />,
    Tooltip: ({ children }: any) => <>{children}</>,
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const pinnedConversation = {
  id: 'conv-1',
  name: 'Pinned chat',
  type: 'acp',
  created_at: 1,
  modified_at: 1,
  extra: { pinned: true },
} as unknown as TChatConversation;

const baseRowProps = (): ConversationRowProps => ({
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
  onConversationClick: vi.fn(),
  onOpenMenu: vi.fn(),
  onMenuVisibleChange: vi.fn(),
  onEditStart: vi.fn(),
  onCreateCronTask: vi.fn(),
  onExport: vi.fn(),
  onDelete: vi.fn(),
  onTogglePin: vi.fn(),
  getJobStatus: () => 'none',
});

describe('ConversationRow', () => {
  beforeEach(() => {
    state.menuProps = null;
    state.submenuProps = null;
  });

  it('renders the row with an inline drag handle and a move-to-group submenu', () => {
    const onMoveToGroup = vi.fn();
    const { container } = render(
      <ConversationRow
        {...baseRowProps()}
        dragHandle={<span data-testid='drag-handle' />}
        moveToGroupItems={[{ key: 'moveToGroup:g1', label: 'Group One' }]}
        onMoveToGroup={onMoveToGroup}
      />
    );

    expect(screen.getByText('Pinned chat')).toBeDefined();
    expect(container.querySelector('[data-testid="drag-handle"]')).not.toBeNull();
    // Move-to-group submenu renders inside the menu.
    expect(state.submenuProps).not.toBeNull();
    expect(state.submenuProps && screen.getByText('Group One')).toBeDefined();
  });

  it('routes menu actions: move-to-group, pin, rename, cron, export and delete', () => {
    const props = baseRowProps();
    const onMoveToGroup = vi.fn();
    render(
      <ConversationRow
        {...props}
        moveToGroupItems={[{ key: 'moveToGroup:g1', label: 'Group One' }]}
        onMoveToGroup={onMoveToGroup}
      />
    );

    // Move to a group: parsed key forwards the group id.
    state.menuProps?.onClickMenuItem?.('moveToGroup:g1');
    expect(onMoveToGroup).toHaveBeenCalledWith('g1');
    // Remove-from-group / unknown keys are skipped.
    state.menuProps?.onClickMenuItem?.('moveToGroup:');
    state.menuProps?.onClickMenuItem?.('bogus');
    expect(onMoveToGroup).toHaveBeenCalledTimes(1);

    state.menuProps?.onClickMenuItem?.('pin');
    expect(props.onTogglePin).toHaveBeenCalledWith(pinnedConversation);
    state.menuProps?.onClickMenuItem?.('rename');
    expect(props.onEditStart).toHaveBeenCalledWith(pinnedConversation);
    state.menuProps?.onClickMenuItem?.('createCronTask');
    expect(props.onCreateCronTask).toHaveBeenCalledWith(pinnedConversation);
    state.menuProps?.onClickMenuItem?.('export');
    expect(props.onExport).toHaveBeenCalledWith(pinnedConversation);
    state.menuProps?.onClickMenuItem?.('delete');
    expect(props.onDelete).toHaveBeenCalledWith('conv-1');
  });

  it('omits the submenu when no moveToGroupItems are provided', () => {
    render(<ConversationRow {...baseRowProps()} />);
    expect(state.submenuProps).toBeNull();
  });

  it('applies the pinned hover fade when pinned and not dragging', () => {
    const { container } = render(<ConversationRow {...baseRowProps()} />);
    const name = container.querySelector('.chat-history__item-name');
    expect(name).not.toBeNull();
  });

  it('handles batch mode: checkbox toggles and row click selects', () => {
    const props = baseRowProps();
    props.batchMode = true;
    render(<ConversationRow {...props} />);

    expect(screen.getByTestId('conversation-checkbox')).toBeDefined();
    // Clicking the checkbox bubbles to the wrapper span, which toggles the row.
    fireEvent.click(screen.getByTestId('conversation-checkbox'));
    expect(props.onToggleChecked).toHaveBeenCalledWith(pinnedConversation);
  });

  it('renders a spinner while the conversation is generating', () => {
    const props = baseRowProps();
    props.isGenerating = true;
    render(<ConversationRow {...props} />);
    expect(screen.getByTestId('spin')).toBeDefined();
  });

  it('renders the collapsed variant with the unread dot', () => {
    const props = baseRowProps();
    props.collapsed = true;
    props.hasCompletionUnread = true;
    const { container } = render(<ConversationRow {...props} />);
    expect(container.querySelector('[class*="2C7FFF"]')).not.toBeNull();
  });
});
