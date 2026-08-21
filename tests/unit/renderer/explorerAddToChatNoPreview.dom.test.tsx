/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Regression guard for the "add-to-chat menu item also opened the file preview"
 * bug: arco renders the context-menu droplist as a React child of the Dropdown,
 * which arco nests inside the tree node's onClick(select) span, so a menu-item
 * click bubbled (React portals propagate through the React tree) into the node's
 * select handler → onOpenFile → preview. Fix = stopPropagation on the droplist.
 *
 * arco's Dropdown contextMenu + portal DOES mount under jsdom, and React's
 * synthetic-event bubbling through the portal reproduces here — so this test is a
 * real guard: without the droplist stopPropagation, clicking the menu item would
 * bubble into the node's select handler and call onOpenFile.
 */

import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/renderer/pages/conversation/explorer/monitorTransport', () => ({ initExplorerRuntime: () => ({}) }));
vi.mock('@/renderer/utils/platform', () => ({ isElectronDesktop: () => false }));

import type { DirRef, Entry, PeKey } from '@/renderer/pages/conversation/explorer/explorerModel';
import { peKey, refToKey } from '@/renderer/pages/conversation/explorer/explorerModel';
import type { MonitorPort } from '@/renderer/pages/conversation/explorer/explorerStore';
import {
  configureExplorerStore,
  resetExplorerStoreForTest,
} from '@/renderer/pages/conversation/explorer/explorerStore';
import { ExplorerPanel } from '@/renderer/pages/conversation/explorer/ExplorerPanel';

const makePort = (snapshots: Record<PeKey, Entry[]>): MonitorPort => ({
  subscribe: async (refs: DirRef[]) => ({
    snapshots: refs.map((r) => ({ target: r, entries: snapshots[refToKey(r)] ?? [] })),
  }),
  remount: async (refs: DirRef[]) => ({
    snapshots: refs.map((r) => ({ target: r, entries: snapshots[refToKey(r)] ?? [] })),
  }),
  unsubscribe: () => {},
});

beforeEach(() => {
  resetExplorerStoreForTest();
  localStorage.clear();
});
afterEach(() => cleanup());

describe('ExplorerPanel add-to-chat does not open preview', () => {
  const renderPanel = (onOpenFile: () => void, onAddToChat: () => void) => {
    configureExplorerStore(makePort({ [peKey('pe1', '')]: [{ name: 'a.ts', kind: 'file' } as Entry] }));
    render(
      <ExplorerPanel
        projectId='p1'
        roots={[{ pe_id: 'pe1', title: 'app', role: 'workspace' }]}
        onOpenFile={onOpenFile}
        onAddToChat={onAddToChat}
      />
    );
  };

  it('fires onAddToChat but NOT onOpenFile when the add-to-chat menu item is clicked', async () => {
    const onOpenFile = vi.fn();
    const onAddToChat = vi.fn();
    renderPanel(onOpenFile, onAddToChat);

    const fileTitle = await screen.findByText('a.ts');
    fireEvent.contextMenu(fileTitle);
    const menuItem = await screen.findByText('conversation.explorer.contextMenu.addToChat');
    fireEvent.click(menuItem);

    expect(onAddToChat).toHaveBeenCalledWith('pe1', 'a.ts', 'a.ts', true);
    // The bug: the menu-item click bubbled into the node's select → onOpenFile
    // → preview. The droplist stopPropagation must prevent that.
    expect(onOpenFile).not.toHaveBeenCalled();
  });

  it('still opens preview when the file node itself is selected (left click)', async () => {
    const onOpenFile = vi.fn();
    const onAddToChat = vi.fn();
    renderPanel(onOpenFile, onAddToChat);

    fireEvent.click(await screen.findByText('a.ts'));
    expect(onOpenFile).toHaveBeenCalledWith('pe1', 'a.ts');
  });

  it('offers the same add-to-chat action from the WebUI more button', async () => {
    const onOpenFile = vi.fn();
    const onAddToChat = vi.fn();
    renderPanel(onOpenFile, onAddToChat);

    await screen.findByText('a.ts');
    const moreButtons = screen.getAllByLabelText('common.more');
    const moreButton = moreButtons.at(-1);

    expect(moreButton).toBeDefined();
    fireEvent.click(moreButton!);
    fireEvent.click(await screen.findByText('conversation.explorer.contextMenu.addToChat'));

    expect(onAddToChat).toHaveBeenCalledWith('pe1', 'a.ts', 'a.ts', true);
    expect(onOpenFile).not.toHaveBeenCalled();
  });

  /**
   * Guard for the "context-menu rows are too wide/tall" bug: arco only applies
   * its compact `arco-dropdown-menu-*` styling when <Menu> is a DIRECT child of
   * the Dropdown droplist. An earlier fix wrapped <Menu> in a <div> to
   * stopPropagation, which silently downgraded the menu to arco's tall
   * sidebar-navigation look (40px rows, 12px side padding) instead of the compact
   * context-menu look used by the conversation list. stopPropagation now lives in
   * onClickMenuItem so no wrapper is needed. This test fails if a wrapper returns.
   */
  it('renders the droplist as a compact arco dropdown-menu (no wrapper element)', async () => {
    const onOpenFile = vi.fn();
    const onAddToChat = vi.fn();
    renderPanel(onOpenFile, onAddToChat);

    fireEvent.contextMenu(await screen.findByText('a.ts'));
    const menuItem = await screen.findByText('conversation.explorer.contextMenu.addToChat');
    const menu = menuItem.closest('[role="menu"]');

    expect(menu).not.toBeNull();
    expect(menu?.className).toContain('arco-dropdown-menu');
  });
});
