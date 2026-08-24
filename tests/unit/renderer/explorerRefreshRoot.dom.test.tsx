/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tripwire for the Explorer "Refresh" context-menu item — a root-only action that
 * re-fetches one pe root's listings. Guards what the pure-model test (which is
 * handed caps directly) and the container test (which mocks the whole panel and
 * drives a hardcoded button) cannot: the real panel's node-type gating and click
 * wiring. Specifically —
 *   - the item is gated to root nodes (`isRoot && Boolean(onRefreshRoot)`), so it
 *     renders on a pe root but must NOT render on a file/dir entry (dropping the
 *     `isRoot` guard would leak it onto every node);
 *   - clicking it routes to `onRefreshRoot` with the root's pe_id;
 *   - it is absent entirely when no `onRefreshRoot` handler is supplied.
 */

import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/renderer/pages/conversation/explorer/monitorTransport', () => ({ initExplorerRuntime: () => ({}) }));
// Refresh is not platform-gated (unlike reveal-in-folder); pin platform only so the
// panel's platform reads are deterministic under jsdom.
vi.mock('@/renderer/utils/platform', () => ({ isMacOS: () => true, isElectronDesktop: () => false }));

import type { DirRef, Entry, PeKey } from '@/renderer/pages/conversation/explorer/explorerModel';
import { peKey, refToKey } from '@/renderer/pages/conversation/explorer/explorerModel';
import type { MonitorPort } from '@/renderer/pages/conversation/explorer/explorerStore';
import {
  configureExplorerStore,
  resetExplorerStoreForTest,
} from '@/renderer/pages/conversation/explorer/explorerStore';
import { ExplorerPanel } from '@/renderer/pages/conversation/explorer/ExplorerPanel';

const REFRESH_LABEL = 'conversation.explorer.contextMenu.refresh';
const COPY_REL_LABEL = 'conversation.explorer.contextMenu.copyRelativePath';

const makePort = (snapshots: Record<PeKey, Entry[]>): MonitorPort => ({
  subscribe: async (refs: DirRef[]) => ({
    snapshots: refs.map((r) => ({ target: r, entries: snapshots[refToKey(r)] ?? [] })),
  }),
  remount: async (refs: DirRef[]) => ({
    snapshots: refs.map((r) => ({ target: r, entries: snapshots[refToKey(r)] ?? [] })),
  }),
  unsubscribe: () => {},
});

// Both handlers are supplied by default so a file node still gets a (copy-relative)
// menu — that lets the "no Refresh on a file" assertion prove the item is absent
// from a present menu, not merely that the whole menu collapsed.
const renderPanel = (onRefreshRoot?: (peId: string) => void) => {
  configureExplorerStore(makePort({ [peKey('pe1', '')]: [{ name: 'a.ts', kind: 'file' } as Entry] }));
  render(
    <ExplorerPanel
      projectId='p1'
      roots={[{ pe_id: 'pe1', title: 'app', role: 'workspace' }]}
      onRefreshRoot={onRefreshRoot}
      onCopyRelativePath={vi.fn()}
    />
  );
};

beforeEach(() => {
  resetExplorerStoreForTest();
  localStorage.clear();
});
afterEach(() => cleanup());

describe('Explorer refresh-root context menu (root-only)', () => {
  it('renders Refresh on a pe root and clicking it calls onRefreshRoot with the pe_id', async () => {
    const onRefreshRoot = vi.fn();
    renderPanel(onRefreshRoot);

    fireEvent.contextMenu(await screen.findByText('app'));
    fireEvent.click(await screen.findByText(REFRESH_LABEL));

    expect(onRefreshRoot).toHaveBeenCalledWith('pe1');
  });

  it('does NOT render Refresh on a non-root (file) node — the isRoot gate hides it', async () => {
    const onRefreshRoot = vi.fn();
    renderPanel(onRefreshRoot);

    // The file node still has a menu (copy-relative-path applies to any node), so
    // the menu is present; Refresh is specifically absent.
    fireEvent.contextMenu(await screen.findByText('a.ts'));
    expect(await screen.findByText(COPY_REL_LABEL)).toBeInTheDocument();
    expect(screen.queryByText(REFRESH_LABEL)).toBeNull();
    expect(onRefreshRoot).not.toHaveBeenCalled();
  });

  it('omits Refresh even on a root when no onRefreshRoot handler is supplied', async () => {
    renderPanel(undefined);

    fireEvent.contextMenu(await screen.findByText('app'));
    expect(await screen.findByText(COPY_REL_LABEL)).toBeInTheDocument();
    expect(screen.queryByText(REFRESH_LABEL)).toBeNull();
  });
});
