/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import SiderItem from '@/renderer/components/layout/Sider/SiderItem';
import TeamRow from '@/renderer/pages/conversation/GroupedHistory/TeamRow';

const state = vi.hoisted(() => ({
  menuProps: null as null | { onClickMenuItem?: (key: string) => void },
  submenuProps: null as null | { title?: React.ReactNode; children?: React.ReactNode; key?: string },
}));

vi.mock('@icon-park/react', () => {
  const icon = (name: string) => (props: Record<string, unknown>) => (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <span data-testid={`icon-${name}`} {...(props as any)} />
  );
  return {
    DeleteOne: icon('DeleteOne'),
    EditOne: icon('EditOne'),
    Folder: icon('Folder'),
    MoreOne: icon('MoreOne'),
    Peoples: icon('Peoples'),
    Pushpin: icon('Pushpin'),
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

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

const baseTeamProps = () => ({
  team_id: 'team-1',
  name: 'Team Alpha',
  pinned: true,
  selected: false,
  badgeCount: 3,
  isRunning: false,
  collapsed: false,
  onClick: vi.fn(),
  onPin: vi.fn(),
  onRename: vi.fn(),
  onDelete: vi.fn(),
});

describe('TeamRow', () => {
  beforeEach(() => {
    state.menuProps = null;
    state.submenuProps = null;
  });

  it('renders an expanded row with drag handle, badge and move-to-group submenu', () => {
    const props = baseTeamProps();
    const onMoveToGroup = vi.fn();
    const { container } = render(
      <TeamRow
        {...props}
        dragHandle={<span data-testid='drag-handle' />}
        moveToGroupItems={[{ key: 'move:g1', label: 'Group One' }]}
        onMoveToGroup={onMoveToGroup}
      />
    );

    expect(screen.getByText('Team Alpha')).toBeDefined();
    expect(container.querySelector('[data-testid="drag-handle"]')).not.toBeNull();
    expect(screen.getByTestId('team-icon-team-1')).toBeDefined();
    // Badge renders.
    expect(container.textContent).toContain('3');
    // Submenu is built and passed through to the menu.
    expect(state.submenuProps).not.toBeNull();
    expect(state.submenuProps && screen.getByText('Group One')).toBeDefined();
  });

  it('routes menu actions: pin, rename, delete and move-to-group', () => {
    const props = baseTeamProps();
    const onMoveToGroup = vi.fn();
    render(
      <TeamRow
        {...props}
        moveToGroupItems={[
          { key: 'moveToGroup:g1', label: 'Group One' },
          { key: 'moveToGroup:', label: 'Remove from group' },
        ]}
        onMoveToGroup={onMoveToGroup}
      />
    );

    state.menuProps?.onClickMenuItem?.('pin');
    expect(props.onPin).toHaveBeenCalledTimes(1);
    state.menuProps?.onClickMenuItem?.('rename');
    expect(props.onRename).toHaveBeenCalledTimes(1);
    state.menuProps?.onClickMenuItem?.('delete');
    expect(props.onDelete).toHaveBeenCalledTimes(1);
    // Move to a group: parsed key forwards the group id.
    state.menuProps?.onClickMenuItem?.('moveToGroup:g1');
    expect(onMoveToGroup).toHaveBeenCalledWith('g1');
    // "Remove from group" parses to null, which the handler intentionally skips.
    state.menuProps?.onClickMenuItem?.('moveToGroup:');
    // Unknown keys are ignored too.
    state.menuProps?.onClickMenuItem?.('bogus');
    expect(onMoveToGroup).toHaveBeenCalledTimes(1);
    expect(props.onPin).toHaveBeenCalledTimes(1);
  });

  it('renders the pin toggle through SiderItem', () => {
    const props = baseTeamProps();
    render(<TeamRow {...props} />);

    fireEvent.click(screen.getByTestId('team-row-pin-team-1'));
    expect(props.onPin).toHaveBeenCalledTimes(1);
  });

  it('omits the submenu when moveToGroupItems is empty', () => {
    render(<TeamRow {...baseTeamProps()} moveToGroupItems={[]} />);
    expect(state.submenuProps).toBeNull();
    render(<TeamRow {...baseTeamProps()} />);
    expect(state.submenuProps).toBeNull();
  });

  it('renders a spinner for a running team', () => {
    const props = baseTeamProps();
    props.isRunning = true;
    render(<TeamRow {...props} />);
    expect(screen.getByTestId('team-spinner-team-1')).toBeDefined();
  });

  it('renders the collapsed variant with badge and running spinner', () => {
    const props = baseTeamProps();
    render(<TeamRow {...props} collapsed />);
    expect(screen.getByTestId('collapsed-team-item-team-1')).toBeDefined();
    expect(screen.getByTestId('collapsed-team-icon-team-1')).toBeDefined();
    expect(screen.getByText('3')).toBeDefined();

    props.isRunning = true;
    render(<TeamRow {...props} collapsed />);
    expect(screen.getByTestId('collapsed-team-spinner-team-1')).toBeDefined();
  });
});

describe('SiderItem', () => {
  beforeEach(() => {
    state.menuProps = null;
    state.submenuProps = null;
  });

  const baseSiderProps = () => ({
    icon: <span data-testid='sider-icon' />,
    name: 'Sidebar Row',
    onMenuAction: vi.fn(),
  });

  it('renders a pushpin overlay for a pinned row without a pin action', () => {
    render(<SiderItem {...baseSiderProps()} pinned menuItems={[{ key: 'a', icon: <span />, label: 'A' }]} />);
    // Pushpin overlay renders because hasActions && pinned && !pinAction.
    expect(screen.getByTestId('icon-Pushpin')).toBeDefined();
  });

  it('renders the drag handle instead of the pushpin overlay', () => {
    const { container } = render(
      <SiderItem
        {...baseSiderProps()}
        pinned
        dragHandle={<span data-testid='drag-handle' />}
        menuItems={[{ key: 'a', icon: <span />, label: 'A' }]}
      />
    );
    expect(container.querySelector('[data-testid="drag-handle"]')).not.toBeNull();
    expect(screen.queryByTestId('icon-Pushpin')).toBeNull();
  });

  it('renders the pin action toggle and fires onToggle', () => {
    const onToggle = vi.fn();
    render(
      <SiderItem
        {...baseSiderProps()}
        pinned
        pinAction={{ pinned: true, onToggle, pinLabel: 'Pin', unpinLabel: 'Unpin', testId: 'sider-pin' }}
      />
    );
    fireEvent.click(screen.getByTestId('sider-pin'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('renders menu items and forwards actions', () => {
    const onMenuAction = vi.fn();
    render(
      <SiderItem
        {...baseSiderProps()}
        menuItems={[{ key: 'delete', icon: <span />, label: 'Delete', danger: true }]}
        onMenuAction={onMenuAction}
      />
    );
    expect(screen.getByText('Delete')).toBeDefined();
    state.menuProps?.onClickMenuItem?.('delete');
    expect(onMenuAction).toHaveBeenCalledWith('delete');
  });

  it('renders and routes a move-to-group submenu', () => {
    const onMenuAction = vi.fn();
    render(
      <SiderItem
        {...baseSiderProps()}
        menuItems={[{ key: 'pin', icon: <span />, label: 'Pin' }]}
        submenu={{
          key: 'moveToGroup',
          label: 'Move to group',
          icon: <span data-testid='submenu-icon' />,
          items: [{ key: 'move:g1', icon: <span />, label: 'Group One' }],
        }}
        onMenuAction={onMenuAction}
      />
    );
    expect(state.submenuProps).not.toBeNull();
    expect(screen.getByText('Move to group')).toBeDefined();
    expect(screen.getByText('Group One')).toBeDefined();
    state.menuProps?.onClickMenuItem?.('moveToGroup:g1');
    expect(onMenuAction).toHaveBeenCalledWith('moveToGroup:g1');
  });
});
