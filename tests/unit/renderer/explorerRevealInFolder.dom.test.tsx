/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tripwire for the Explorer "reveal in folder" context-menu item (Electron only).
 *
 * - On Electron desktop the item renders and clicking it calls onRevealInFolder
 *   with the node's pe-ref {pe_id, relative_path} (the front end never builds an
 *   absolute path — the backend resolves the pe-ref and does shell reveal).
 * - On WebUI (non-Electron) the item must NOT render (no local shell / remote).
 *
 * The WebUI-hidden assertion fails if the `isElectronDesktop()` gate is removed
 * (mutation), which would leak the item into the browser build.
 */

import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const platformMock = vi.hoisted(() => ({ isDesktop: true }));

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/renderer/pages/conversation/explorer/monitorTransport', () => ({ initExplorerRuntime: () => ({}) }));
vi.mock('@/renderer/utils/platform', async (orig) => ({
  ...(await orig<typeof import('@/renderer/utils/platform')>()),
  isElectronDesktop: () => platformMock.isDesktop,
}));

import type { DirRef, Entry, PeKey } from '@/renderer/pages/conversation/explorer/explorerModel';
import { peKey, refToKey } from '@/renderer/pages/conversation/explorer/explorerModel';
import type { MonitorPort } from '@/renderer/pages/conversation/explorer/explorerStore';
import {
  configureExplorerStore,
  resetExplorerStoreForTest,
} from '@/renderer/pages/conversation/explorer/explorerStore';
import { ExplorerPanel } from '@/renderer/pages/conversation/explorer/ExplorerPanel';

const REVEAL_LABEL = 'conversation.workspace.contextMenu.openLocation';

const makePort = (snapshots: Record<PeKey, Entry[]>): MonitorPort => ({
  subscribe: async (refs: DirRef[]) => ({
    snapshots: refs.map((r) => ({ target: r, entries: snapshots[refToKey(r)] ?? [] })),
  }),
  remount: async (refs: DirRef[]) => ({
    snapshots: refs.map((r) => ({ target: r, entries: snapshots[refToKey(r)] ?? [] })),
  }),
  unsubscribe: () => {},
});

const renderPanel = (onRevealInFolder?: (peId: string, rel: string) => void, onOpenFile: () => void = vi.fn()) => {
  configureExplorerStore(makePort({ [peKey('pe1', '')]: [{ name: 'a.ts', kind: 'file' } as Entry] }));
  render(
    <ExplorerPanel
      projectId='p1'
      roots={[{ pe_id: 'pe1', title: 'app', role: 'workspace' }]}
      onOpenFile={onOpenFile}
      onRevealInFolder={onRevealInFolder}
    />
  );
};

beforeEach(() => {
  resetExplorerStoreForTest();
  localStorage.clear();
  platformMock.isDesktop = true;
});
afterEach(() => cleanup());

describe('Explorer reveal-in-folder context menu (Electron only)', () => {
  it('on Electron: renders the item and clicking it calls onRevealInFolder with the pe-ref', async () => {
    platformMock.isDesktop = true;
    const onRevealInFolder = vi.fn();
    const onOpenFile = vi.fn();
    renderPanel(onRevealInFolder, onOpenFile);

    fireEvent.contextMenu(await screen.findByText('a.ts'));
    fireEvent.click(await screen.findByText(REVEAL_LABEL));

    expect(onRevealInFolder).toHaveBeenCalledWith('pe1', 'a.ts');
    // Menu-item click must not bubble into the node's select handler.
    expect(onOpenFile).not.toHaveBeenCalled();
  });

  it('on WebUI (non-Electron): the reveal item is NOT rendered', async () => {
    platformMock.isDesktop = false;
    const onRevealInFolder = vi.fn();
    renderPanel(onRevealInFolder);

    fireEvent.contextMenu(await screen.findByText('a.ts'));
    // Give the dropdown a tick to mount, then assert the item is absent.
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(REVEAL_LABEL)).toBeNull();
    expect(onRevealInFolder).not.toHaveBeenCalled();
  });
});
