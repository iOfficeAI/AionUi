/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

import SiderItem from '@/renderer/components/layout/Sider/SiderItem';
import type { SiderMenuItem } from '@/renderer/components/layout/Sider/SiderItem';

const menuItems: SiderMenuItem[] = [
  { key: 'pin', icon: null, label: 'Pin' },
  { key: 'rename', icon: null, label: 'Rename' },
  { key: 'delete', icon: null, label: 'Delete', danger: true },
];

describe('SiderItem right-click context menu', () => {
  it('opens the dropdown menu when the row is right-clicked', () => {
    const onMenuAction = vi.fn();
    render(<SiderItem icon={<span>icon</span>} name='Team A' menuItems={menuItems} onMenuAction={onMenuAction} />);

    expect(screen.queryByText('Pin')).not.toBeInTheDocument();

    fireEvent.contextMenu(screen.getByText('Team A'));
    expect(screen.getByText('Pin')).toBeInTheDocument();
    expect(screen.getByText('Rename')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('does not open a menu when the item has no menuItems', () => {
    render(<SiderItem icon={<span>icon</span>} name='No Menu' />);

    fireEvent.contextMenu(screen.getByText('No Menu'));
    expect(screen.queryByText('Pin')).not.toBeInTheDocument();
  });
});
