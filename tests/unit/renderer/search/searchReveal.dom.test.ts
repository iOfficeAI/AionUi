/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Guard for the SearchPanel "click a result = reveal" contract on a SPARSE tree:
 * a hit can sit many levels below the currently-subscribed boundary. Reveal must
 * subscribe the WHOLE missing ancestor chain (one array fs/subscribe, deduped
 * against what's already subscribed) so the hit becomes locatable — not just the
 * single parent directory. This replicates ExplorerContainer.handleRevealHit:
 * `reveal({pe_id, parentRel(rel)})` (expand+subscribe the chain up to the file's
 * parent) + `select(peKey(pe_id, rel))` (highlight the file leaf).
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { DirRef, Entry, PeKey, TreeNode } from '@/renderer/pages/conversation/explorer/explorerModel';
import { parentRel, peKey, refToKey } from '@/renderer/pages/conversation/explorer/explorerModel';
import type { MonitorPort } from '@/renderer/pages/conversation/explorer/explorerStore';
import {
  configureExplorerStore,
  getExplorerSnapshot,
  openProject,
  resetExplorerStoreForTest,
  reveal,
  select,
} from '@/renderer/pages/conversation/explorer/explorerStore';

const flush = async (): Promise<void> => {
  // Drain the microtask queue across several ticks (reconcile → subscribe →
  // snapshot → reproject). Sequential on purpose — Promise.all would not step
  // the queue the same way.
  for (let i = 0; i < 5; i++) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};
const dir = (name: string): Entry => ({ name, kind: 'dir' });
const file = (name: string): Entry => ({ name, kind: 'file' });

function makePort(snapshots: Record<PeKey, Entry[]>): { port: MonitorPort; subscribed: DirRef[][] } {
  const subscribed: DirRef[][] = [];
  return {
    subscribed,
    port: {
      subscribe: async (refs) => {
        subscribed.push(refs);
        return { snapshots: refs.map((r) => ({ target: r, entries: snapshots[refToKey(r)] ?? [] })) };
      },
      remount: async (refs) => ({
        snapshots: refs.map((r) => ({ target: r, entries: snapshots[refToKey(r)] ?? [] })),
      }),
      unsubscribe: () => {},
    },
  };
}

const childNames = (tree: TreeNode[], key: PeKey): string[] | undefined => {
  const find = (nodes: TreeNode[]): TreeNode | undefined => {
    for (const n of nodes) {
      if (n.key === key) return n;
      const hit = n.children ? find(n.children) : undefined;
      if (hit) return hit;
    }
    return undefined;
  };
  return find(tree)?.children?.map((c) => c.title);
};

const PE = 'pe1';
const roots = [{ pe_id: PE, title: 'app' }];

beforeEach(() => {
  resetExplorerStoreForTest();
  localStorage.clear();
});

describe('SearchPanel reveal on a sparse tree', () => {
  it('subscribes the full missing ancestor chain (deduped) and locates a deep hit', async () => {
    // Full path exists on the backend: a/b/c/d/e/f/g.txt.
    const h = makePort({
      [peKey(PE, '')]: [dir('a')],
      [peKey(PE, 'a')]: [dir('b')],
      [peKey(PE, 'a/b')]: [dir('c')],
      [peKey(PE, 'a/b/c')]: [dir('d')],
      [peKey(PE, 'a/b/c/d')]: [dir('e')],
      [peKey(PE, 'a/b/c/d/e')]: [dir('f')],
      [peKey(PE, 'a/b/c/d/e/f')]: [file('g.txt')],
    });
    configureExplorerStore(h.port);
    openProject('proj1', roots);
    await flush();

    // Establish a subscribed boundary partway down: /a/b (as if the user had
    // expanded that far). current = { root, a, a/b }.
    reveal({ pe_id: PE, relative_path: 'a/b' });
    await flush();
    h.subscribed.length = 0; // ignore everything up to the boundary

    // The search hit and the reveal action (exactly handleRevealHit).
    const hitRel = 'a/b/c/d/e/f/g.txt';
    reveal({ pe_id: PE, relative_path: parentRel(hitRel) }); // 'a/b/c/d/e/f'
    select(peKey(PE, hitRel));
    await flush();

    const subscribed = h.subscribed.flat().map(refToKey);
    // The entire missing chain below the boundary is subscribed in one go.
    expect(subscribed).toEqual(
      expect.arrayContaining([
        peKey(PE, 'a/b/c'),
        peKey(PE, 'a/b/c/d'),
        peKey(PE, 'a/b/c/d/e'),
        peKey(PE, 'a/b/c/d/e/f'),
      ])
    );
    // Already-subscribed ancestors are NOT re-subscribed (deduped vs current).
    expect(subscribed).not.toContain(peKey(PE, 'a'));
    expect(subscribed).not.toContain(peKey(PE, 'a/b'));

    const view = getExplorerSnapshot();
    // The hit is selected (highlighted) …
    expect(view.selected).toBe(peKey(PE, hitRel));
    // … and locatable: its parent's listing (now subscribed) contains it.
    expect(childNames(view.treeData, peKey(PE, 'a/b/c/d/e/f'))).toContain('g.txt');
  });
});
