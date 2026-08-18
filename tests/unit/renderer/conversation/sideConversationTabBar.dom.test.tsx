/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import SideConversationTabBar from '@/renderer/pages/conversation/components/SideConversationPanel/SideConversationTabBar';
import type { SideTab } from '@/renderer/pages/conversation/components/SideConversationPanel/useSideConversation';

const tabs: SideTab[] = [
  { childId: 'c1', mode: 'fork', hasTurn: true },
  { childId: 'c2', mode: 'snapshot', hasTurn: false },
];

describe('SideConversationTabBar', () => {
  it('renders one tab button per child plus a new-tab affordance', () => {
    render(
      <SideConversationTabBar tabs={tabs} activeTabId='c2' onSelect={vi.fn()} onCloseTab={vi.fn()} onNewTab={vi.fn()} />
    );

    // Without an i18n provider every tab label renders as the raw key.
    expect(screen.getAllByText('conversation.sideConversation.tabLabel')).toHaveLength(tabs.length);
    expect(screen.getByLabelText('conversation.sideConversation.newTab')).toBeTruthy();
    expect(screen.getAllByLabelText('conversation.sideConversation.closeTab')).toHaveLength(tabs.length);
  });

  it('selects a tab on click', () => {
    const onSelect = vi.fn();
    render(
      <SideConversationTabBar
        tabs={tabs}
        activeTabId='c1'
        onSelect={onSelect}
        onCloseTab={vi.fn()}
        onNewTab={vi.fn()}
      />
    );

    fireEvent.click(screen.getAllByText('conversation.sideConversation.tabLabel')[1]);
    expect(onSelect).toHaveBeenCalledWith('c2');
  });

  it('closes the matching tab from its close affordance', () => {
    const onCloseTab = vi.fn();
    render(
      <SideConversationTabBar
        tabs={tabs}
        activeTabId='c1'
        onSelect={vi.fn()}
        onCloseTab={onCloseTab}
        onNewTab={vi.fn()}
      />
    );

    fireEvent.click(screen.getAllByLabelText('conversation.sideConversation.closeTab')[1]);
    expect(onCloseTab).toHaveBeenCalledWith('c2');
  });

  it('opens a new tab from the trailing button', () => {
    const onNewTab = vi.fn();
    render(
      <SideConversationTabBar
        tabs={tabs}
        activeTabId='c1'
        onSelect={vi.fn()}
        onCloseTab={vi.fn()}
        onNewTab={onNewTab}
      />
    );

    fireEvent.click(screen.getByLabelText('conversation.sideConversation.newTab'));
    expect(onNewTab).toHaveBeenCalledTimes(1);
  });
});
