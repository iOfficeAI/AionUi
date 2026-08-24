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
import { act, fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/renderer/pages/conversation/explorer/monitorTransport', () => ({ initExplorerRuntime: () => ({}) }));
// Pin platform so the modifier→op mapping is deterministic: macOS ⇒ Option (Alt)
// is the copy modifier. isElectronDesktop is false here (jsdom, no shell).
vi.mock('@/renderer/utils/platform', () => ({ isMacOS: () => true, isElectronDesktop: () => false }));

import type { DirRef, Entry, PeKey } from '@/renderer/pages/conversation/explorer/explorerModel';
import { PE_REF_DRAG_MIME, peKey, refToKey } from '@/renderer/pages/conversation/explorer/explorerModel';
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

describe('ExplorerPanel full-row click target', () => {
  it('spans the whole row via blockNode + a full-width title span', async () => {
    configureExplorerStore(makePort({ [peKey('pe1', '')]: [dir('sub'), file('a.ts')] }));
    const { container } = render(
      <ExplorerPanel projectId='p1' roots={[{ pe_id: 'pe1', title: 'app', role: 'workspace' }]} />
    );
    await screen.findByText('a.ts');

    // blockNode ⇒ arco tags EVERY node title with `-title-block` (flex: 1), so the
    // click/expand target (arco's .arco-tree-node-title) fills the row instead of
    // hugging the label. Without blockNode this class is absent.
    const titles = container.querySelectorAll('.arco-tree-node-title');
    expect(titles.length).toBeGreaterThan(0);
    titles.forEach((el) => expect(el.className).toContain('arco-tree-node-title-block'));

    // Our rendered title span fills that wrapper (`w-full`) so the right-click
    // context-menu trigger and drop highlight also cover the whole row.
    expect(screen.getByText('a.ts').closest('span[class*="w-full"]')).toBeTruthy();
  });
});

// A DataTransfer stub: jsdom's is inert (setData/getData no-ops, no `types`), so
// a full internal drag needs a backing store shared across the drag sequence —
// the same object rides dragStart (writes) → dragOver (reads types) → drop (reads
// data), exactly as the browser hands one DataTransfer to all three events.
const makeDataTransfer = () => {
  const store = new Map<string, string>();
  return {
    dropEffect: 'none',
    effectAllowed: 'none',
    setData: (type: string, val: string) => void store.set(type, val),
    getData: (type: string) => store.get(type) ?? '',
    get types() {
      return Array.from(store.keys());
    },
    files: [] as unknown as FileList,
  };
};

// Fire a drag event with a real DataTransfer + modifier. `fireEvent.dragOver(el,
// { altKey })` cannot set altKey — it is a readonly accessor on MouseEvent's
// prototype, so testing-library's Object.assign is silently ignored. Constructing
// the MouseEvent directly makes the constructor honor altKey, and dataTransfer is
// attached with defineProperty (Event has no such accessor to block it).
const fireDrag = (
  node: Element,
  type: string,
  opts: { dataTransfer: ReturnType<typeof makeDataTransfer>; altKey?: boolean }
) => {
  const ev = new MouseEvent(type, { bubbles: true, cancelable: true, altKey: opts.altKey ?? false });
  Object.defineProperty(ev, 'dataTransfer', { value: opts.dataTransfer, configurable: true });
  fireEvent(node, ev);
};

describe('ExplorerPanel internal drag transfer (source B/C)', () => {
  const renderTree = (onTransfer: ReturnType<typeof vi.fn>) => {
    configureExplorerStore(
      makePort({
        [peKey('pe1', '')]: [dir('sub'), file('a.ts')],
        [peKey('pe1', 'sub')]: [],
      })
    );
    render(
      <ExplorerPanel
        projectId='p1'
        roots={[{ pe_id: 'pe1', title: 'app', role: 'workspace' }]}
        onTransfer={onTransfer}
      />
    );
  };

  it('replays dragStart → dragOver → drop for a same-pe move (default, no modifier)', async () => {
    const onTransfer = vi.fn();
    renderTree(onTransfer);
    await screen.findByText('a.ts');

    const dt = makeDataTransfer();
    // Drag the file 'a.ts' onto the dir 'sub'.
    fireDrag(screen.getByText('a.ts'), 'dragstart', { dataTransfer: dt });
    // The custom MIME carries the dragged node's identity.
    expect(JSON.parse(dt.getData(PE_REF_DRAG_MIME))).toMatchObject({
      pe_id: 'pe1',
      relative_path: 'a.ts',
      isDir: false,
    });

    fireDrag(screen.getByText('sub'), 'dragover', { dataTransfer: dt });
    expect(dt.dropEffect).toBe('move'); // same pe, no modifier → move

    fireDrag(screen.getByText('sub'), 'drop', { dataTransfer: dt });
    expect(onTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ pe_id: 'pe1', relative_path: 'a.ts', isDir: false }),
      'pe1',
      'sub',
      'move'
    );
  });

  it('flips to copy when the Option (Alt) modifier is held on macOS', async () => {
    const onTransfer = vi.fn();
    renderTree(onTransfer);
    await screen.findByText('a.ts');

    const dt = makeDataTransfer();
    fireDrag(screen.getByText('a.ts'), 'dragstart', { dataTransfer: dt });
    fireDrag(screen.getByText('sub'), 'dragover', { dataTransfer: dt, altKey: true });
    expect(dt.dropEffect).toBe('copy');
    fireDrag(screen.getByText('sub'), 'drop', { dataTransfer: dt, altKey: true });
    expect(onTransfer).toHaveBeenCalledWith(expect.objectContaining({ relative_path: 'a.ts' }), 'pe1', 'sub', 'copy');
  });

  it('blocks a drop onto the source itself: dropEffect none, no transfer fires', async () => {
    const onTransfer = vi.fn();
    renderTree(onTransfer);
    await screen.findByText('sub');

    const dt = makeDataTransfer();
    // Drag the dir 'sub' onto itself.
    fireDrag(screen.getByText('sub'), 'dragstart', { dataTransfer: dt });
    fireDrag(screen.getByText('sub'), 'dragover', { dataTransfer: dt });
    expect(dt.dropEffect).toBe('none');
    fireDrag(screen.getByText('sub'), 'drop', { dataTransfer: dt });
    expect(onTransfer).not.toHaveBeenCalled();
  });

  it('does not make the pe root draggable (it is a binding, not an entry)', async () => {
    const onTransfer = vi.fn();
    renderTree(onTransfer);
    const rootTitle = (await screen.findByText('app')).closest('span[draggable]');
    expect(rootTitle).toBeNull();
  });
});

// A dropped OS file. Electron 32+ (this app runs 37) removed `File.path`, so the
// dropped item's absolute path is NOT on the File object — it must come from the
// preload `window.electronAPI.getPathForFile` bridge. These tests reproduce the
// Finder-drag-does-nothing bug: with no bridge and no legacy `.path`, the import
// fires with zero paths; with the bridge wired, the real path flows through.
const droppedFile = (name: string): File => ({ name, size: 1, type: '', lastModified: 0 }) as unknown as File;

describe('ExplorerPanel OS-external import (source A / Finder drag)', () => {
  const renderTree = (onImportFiles: ReturnType<typeof vi.fn>) => {
    configureExplorerStore(
      makePort({
        [peKey('pe1', '')]: [dir('sub'), file('a.ts')],
        [peKey('pe1', 'sub')]: [],
      })
    );
    render(
      <ExplorerPanel
        projectId='p1'
        roots={[{ pe_id: 'pe1', title: 'app', role: 'workspace' }]}
        onImportFiles={onImportFiles}
      />
    );
  };

  afterEach(() => {
    delete (window as Window & { electronAPI?: unknown }).electronAPI;
  });

  it('resolves the dropped-file absolute path via getPathForFile and imports it (Electron 37 fix)', async () => {
    const getPathForFile = vi.fn((f: File) => `/Users/me/Desktop/${f.name}`);
    (window as Window & { electronAPI?: { getPathForFile: (f: File) => string } }).electronAPI = { getPathForFile };
    const onImportFiles = vi.fn();
    renderTree(onImportFiles);
    await screen.findByText('sub');

    const dt = makeDataTransfer();
    dt.files = [droppedFile('report.pdf')] as unknown as FileList;
    // OS-external drop: no custom MIME, just files. Drop onto the 'sub' dir.
    fireDrag(screen.getByText('sub'), 'drop', { dataTransfer: dt });

    expect(getPathForFile).toHaveBeenCalledTimes(1);
    expect(onImportFiles).toHaveBeenCalledWith('pe1', 'sub', ['/Users/me/Desktop/report.pdf']);
  });

  it('imports nothing when neither the bridge nor legacy File.path yields a path (the pre-fix bug)', async () => {
    // No window.electronAPI bridge + Electron 37 File has no `.path` ⇒ zero paths
    // ⇒ onImportFiles must not fire. This is exactly what made Finder drag do nothing.
    const onImportFiles = vi.fn();
    renderTree(onImportFiles);
    await screen.findByText('sub');

    const dt = makeDataTransfer();
    dt.files = [droppedFile('report.pdf')] as unknown as FileList;
    fireDrag(screen.getByText('sub'), 'drop', { dataTransfer: dt });

    expect(onImportFiles).not.toHaveBeenCalled();
  });
});
