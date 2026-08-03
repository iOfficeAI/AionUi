/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Real arco `Tree` interaction tests for ExplorerPanel — the roundtrip that the
 * store-only tests missed: clicking a directory's expand switcher must fire
 * onExpand → store → controlled expandedKeys re-render → children appear. A
 * regression guard for the fatal "dirs render as un-expandable leaves" bug
 * (fixed by providing arco `loadMore`).
 */

import React from 'react';
import { act, render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/renderer/pages/conversation/explorer/monitorTransport', () => ({ initExplorerRuntime: () => ({}) }));

import type { DirRef, Entry, PeKey } from '@/renderer/pages/conversation/explorer/explorerModel';
import { peKey, refToKey } from '@/renderer/pages/conversation/explorer/explorerModel';
import type { MonitorPort } from '@/renderer/pages/conversation/explorer/explorerStore';
import {
  applyMonitorNotification,
  configureExplorerStore,
  resetExplorerStoreForTest,
  select,
  setExpandedKeys,
} from '@/renderer/pages/conversation/explorer/explorerStore';
import { ExplorerPanel } from '@/renderer/pages/conversation/explorer/ExplorerPanel';

const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

const dir = (name: string): Entry => ({ name, kind: 'dir' });
const file = (name: string): Entry => ({ name, kind: 'file' });

const makePort = (snapshots: Record<PeKey, Entry[]>): MonitorPort => ({
  subscribe: async (refs: DirRef[]) => ({
    snapshots: refs.map((r) => ({ target: r, entries: snapshots[refToKey(r)] ?? [] })),
  }),
  unsubscribe: () => {},
});

beforeEach(() => {
  resetExplorerStoreForTest();
  localStorage.clear();
});
afterEach(() => cleanup());

describe('ExplorerPanel arco expand roundtrip', () => {
  it('renders a directory as a non-leaf expandable node (loadMore regression) and expands it via the controlled expandedKeys roundtrip', async () => {
    // NOTE: arco's internal switcher-click wiring is not reproducible under jsdom
    // (fireEvent does not reach it); that click→onExpand path is verified live via
    // agent-browser. Here we assert the two halves jsdom CAN prove with real arco:
    // (1) the loadMore fix makes a dir a non-leaf (expandable), and (2) the
    // controlled `expandedKeys` (what onExpand feeds back through the store)
    // re-renders arco with the dir's children.
    configureExplorerStore(
      makePort({
        [peKey('pe1', '')]: [dir('sub'), file('a.ts')],
        [peKey('pe1', 'sub')]: [file('deep.ts')],
      })
    );
    render(<ExplorerPanel projectId='p1' roots={[{ pe_id: 'pe1', title: 'app', role: 'workspace' }]} />);

    // Root auto-expands → its children appear; 'sub' is expandable, not a leaf.
    expect(await screen.findByText('sub')).toBeInTheDocument();
    expect(screen.getByText('a.ts')).toBeInTheDocument();
    expect(screen.getByText('sub').closest('.arco-tree-node')?.className).not.toContain('is-leaf');
    expect(screen.queryByText('deep.ts')).not.toBeInTheDocument();

    // Drive the same store action onExpand feeds back → controlled expandedKeys
    // updates → arco re-renders with 'sub' expanded and its child visible.
    await act(async () => {
      setExpandedKeys([peKey('pe1', ''), peKey('pe1', 'sub')]);
      await flush();
    });
    expect(await screen.findByText('deep.ts')).toBeInTheDocument();
  });

  it('renders file nodes as leaves (no expand switcher content)', async () => {
    configureExplorerStore(makePort({ [peKey('pe1', '')]: [file('only.ts')] }));
    render(<ExplorerPanel projectId='p1' roots={[{ pe_id: 'pe1', title: 'app', role: 'workspace' }]} />);
    const fileNode = (await screen.findByText('only.ts')).closest('.arco-tree-node');
    expect(fileNode?.className).toContain('is-leaf');
  });
});

describe('ExplorerPanel reveal highlight + scroll-into-view', () => {
  it('opts the tree into the workspace-tree selected-node highlight', async () => {
    configureExplorerStore(makePort({ [peKey('pe1', '')]: [file('a.ts')] }));
    const { container } = render(
      <ExplorerPanel projectId='p1' roots={[{ pe_id: 'pe1', title: 'app', role: 'workspace' }]} />
    );
    await screen.findByText('a.ts');
    // The `workspace-tree` class enables the full-row selected background
    // (arco-override.css → --color-fill-3).
    expect(container.querySelector('.workspace-tree')).toBeTruthy();
  });

  it('scrolls the selected node into view once it is in the DOM', async () => {
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy; // jsdom has no scrollIntoView
    configureExplorerStore(makePort({ [peKey('pe1', '')]: [file('a.ts')] }));
    render(<ExplorerPanel projectId='p1' roots={[{ pe_id: 'pe1', title: 'app', role: 'workspace' }]} />);
    await screen.findByText('a.ts');

    // Reveal-equivalent: select the file → its node gets .arco-tree-node-selected
    // → the effect scrolls it into view.
    await act(async () => {
      select(peKey('pe1', 'a.ts'));
      await flush();
    });
    expect(scrollSpy).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('does not re-scroll when only treeData changes, but re-scrolls on a new selection', async () => {
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;
    configureExplorerStore(makePort({ [peKey('pe1', '')]: [file('a.ts'), file('c.ts')] }));
    render(<ExplorerPanel projectId='p1' roots={[{ pe_id: 'pe1', title: 'app', role: 'workspace' }]} />);
    await screen.findByText('a.ts');

    await act(async () => {
      select(peKey('pe1', 'a.ts'));
      await flush();
    });
    expect(scrollSpy).toHaveBeenCalledTimes(1);

    // treeData changes (sibling added) but the selection is unchanged → the
    // scrolledSelectionRef guard prevents a repeat scroll.
    await act(async () => {
      applyMonitorNotification('fs/delta', {
        target: { pe_id: 'pe1', relative_path: '' },
        changes: [{ op: 'added', name: 'b.ts', kind: 'file' }],
      });
      await flush();
    });
    expect(await screen.findByText('b.ts')).toBeInTheDocument(); // treeData really changed
    expect(scrollSpy).toHaveBeenCalledTimes(1); // not re-scrolled

    // A new selection scrolls again.
    await act(async () => {
      select(peKey('pe1', 'c.ts'));
      await flush();
    });
    expect(scrollSpy).toHaveBeenCalledTimes(2);
  });
});
