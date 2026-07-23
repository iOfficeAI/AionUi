/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SiderItem from '@/renderer/components/layout/Sider/SiderItem';

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

describe('SiderItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a disabled menu item when the item has disabled=true', async () => {
    render(
      <SiderItem
        icon={<span data-testid='sider-icon'>icon</span>}
        name='Team'
        menuItems={[
          { key: 'rename', icon: <span>icon</span>, label: 'Rename' },
          { key: 'delete', icon: <span>icon</span>, label: 'Delete', disabled: true },
        ]}
      />
    );

    fireEvent.click(screen.getByTestId('sider-item-menu-trigger'));

    await waitFor(() => {
      const deleteItem = screen.getByText('Delete').closest('[role="menuitem"]');
      expect(deleteItem).toBeInTheDocument();
      expect(deleteItem).toHaveClass('arco-dropdown-menu-disabled');
    });
  });

  it('invokes onMenuAction and closes the menu when a menu item is clicked', async () => {
    const onMenuAction = vi.fn();
    render(
      <SiderItem
        icon={<span data-testid='sider-icon'>icon</span>}
        name='Team'
        menuItems={[{ key: 'rename', icon: <span>icon</span>, label: 'Rename' }]}
        onMenuAction={onMenuAction}
      />
    );

    fireEvent.click(screen.getByTestId('sider-item-menu-trigger'));

    const renameItem = await screen.findByText('Rename');
    fireEvent.click(renameItem);

    await waitFor(() => {
      expect(onMenuAction).toHaveBeenCalledWith('rename');
    });
  });

  it('stops propagation when clicking the action container', () => {
    const onClick = vi.fn();
    render(
      <SiderItem
        icon={<span data-testid='sider-icon'>icon</span>}
        name='Team'
        menuItems={[{ key: 'rename', icon: <span>icon</span>, label: 'Rename' }]}
        onClick={onClick}
      />
    );

    const trigger = screen.getByTestId('sider-item-menu-trigger');
    const container = trigger.parentElement;
    expect(container).not.toBeNull();
    fireEvent.click(container!);

    expect(onClick).not.toHaveBeenCalled();
  });
});
