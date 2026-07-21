/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IDirOrFile, IWorkspaceFlatFile } from '@/common/adapter/ipcBridge';
import {
  applyFreshListings,
  buildSearchTree,
  collectExpandedDirs,
} from '@/renderer/pages/conversation/Workspace/utils/treeHelpers';
import { describe, expect, it } from 'vitest';

const dir = (relativePath: string, children: IDirOrFile[] = []): IDirOrFile => ({
  name: relativePath.split('/').pop() || relativePath,
  fullPath: `/ws/${relativePath}`,
  relativePath,
  isDir: true,
  isFile: false,
  children,
});

const file = (relativePath: string): IDirOrFile => ({
  name: relativePath.split('/').pop() || relativePath,
  fullPath: `/ws/${relativePath}`,
  relativePath,
  isDir: false,
  isFile: true,
});

describe('collectExpandedDirs', () => {
  it('returns only expanded directory nodes (root included), skipping files', () => {
    const tree = [
      dir('', [dir('src', [file('src/a.ts'), dir('src/deep', [file('src/deep/b.ts')])]), file('readme.md')]),
    ];
    const expanded = ['', 'src', 'src/deep', 'src/a.ts'];
    const result = collectExpandedDirs(tree, expanded);
    const paths = result.map((r) => r.relativePath).toSorted();
    expect(paths).toEqual(['', 'src', 'src/deep']);
  });

  it('ignores expanded keys whose node is not in the tree', () => {
    const tree = [dir('', [dir('src')])];
    const result = collectExpandedDirs(tree, ['', 'src', 'ghost/path']);
    expect(result.map((r) => r.relativePath).toSorted()).toEqual(['', 'src']);
  });
});

describe('applyFreshListings', () => {
  it('adds a newly created file into an expanded folder without collapsing others', () => {
    const tree = [
      dir('', [
        dir('src', [file('src/old.ts')]),
        dir('docs', [file('docs/guide.md')]), // collapsed subtree kept as-is
      ]),
    ];
    const fresh = new Map<string, IDirOrFile[]>();
    // Root listing unchanged (still has src + docs).
    fresh.set('', [dir('src'), dir('docs')]);
    // src now has old.ts + new.ts.
    fresh.set('src', [file('src/old.ts'), file('src/new.ts')]);

    const result = applyFreshListings(tree, fresh);
    const root = result[0];
    const src = root.children!.find((c) => c.relativePath === 'src')!;
    const docs = root.children!.find((c) => c.relativePath === 'docs')!;

    expect(src.children!.map((c) => c.relativePath).toSorted()).toEqual(['src/new.ts', 'src/old.ts']);
    // docs was not re-fetched → its previously-loaded children are preserved.
    expect(docs.children!.map((c) => c.relativePath)).toEqual(['docs/guide.md']);
  });

  it('drops a deleted file from a re-fetched folder', () => {
    const tree = [dir('', [dir('src', [file('src/a.ts'), file('src/gone.ts')])])];
    const fresh = new Map<string, IDirOrFile[]>();
    fresh.set('', [dir('src')]);
    fresh.set('src', [file('src/a.ts')]); // gone.ts removed on disk
    const result = applyFreshListings(tree, fresh);
    const src = result[0].children!.find((c) => c.relativePath === 'src')!;
    expect(src.children!.map((c) => c.relativePath)).toEqual(['src/a.ts']);
  });

  it('carries over already-loaded children of a subdir that reappears in a fresh listing', () => {
    const tree = [dir('', [dir('src', [dir('src/deep', [file('src/deep/b.ts')])])])];
    const fresh = new Map<string, IDirOrFile[]>();
    fresh.set('', [dir('src')]);
    // src re-fetched; its child dir "deep" comes back with empty children,
    // but we already loaded its contents — they must be carried over.
    fresh.set('src', [dir('src/deep')]);
    const result = applyFreshListings(tree, fresh);
    const deep = result[0].children![0].children![0];
    expect(deep.relativePath).toBe('src/deep');
    expect(deep.children!.map((c) => c.relativePath)).toEqual(['src/deep/b.ts']);
  });

  it('leaves directories not present in the fresh map untouched', () => {
    const tree = [dir('', [dir('a', [file('a/x.ts')])])];
    const fresh = new Map<string, IDirOrFile[]>(); // nothing re-fetched
    const result = applyFreshListings(tree, fresh);
    expect(result).toEqual(tree);
  });
});

describe('buildSearchTree', () => {
  const flat: IWorkspaceFlatFile[] = [
    { name: 'readme.md', fullPath: '/ws/readme.md', relativePath: 'readme.md' },
    { name: 'index.ts', fullPath: '/ws/src/index.ts', relativePath: 'src/index.ts' },
    { name: 'button.tsx', fullPath: '/ws/src/ui/button.tsx', relativePath: 'src/ui/button.tsx' },
    { name: 'helper.ts', fullPath: '/ws/src/ui/deep/helper.ts', relativePath: 'src/ui/deep/helper.ts' },
  ];

  it('finds a deeply nested file by name and rebuilds the branch to it', () => {
    const { tree, expandedKeys } = buildSearchTree(flat, '/ws', 'button');
    const root = tree[0];
    expect(root.relativePath).toBe('');
    // Path src → ui → button.tsx reconstructed.
    const src = root.children!.find((c) => c.relativePath === 'src')!;
    const ui = src.children!.find((c) => c.relativePath === 'src/ui')!;
    const match = ui.children!.find((c) => c.relativePath === 'src/ui/button.tsx')!;
    expect(match.isFile).toBe(true);
    // Branch dirs auto-expanded so the match is visible.
    expect(expandedKeys).toEqual(expect.arrayContaining(['', 'src', 'src/ui']));
  });

  it('matches on any path segment (folder name surfaces files inside)', () => {
    const { tree } = buildSearchTree(flat, '/ws', 'ui');
    const src = tree[0].children!.find((c) => c.relativePath === 'src')!;
    const ui = src.children!.find((c) => c.relativePath === 'src/ui')!;
    // Both files under ui/ match on the "ui" segment.
    const rels = ui.children!.map((c) => c.relativePath).toSorted();
    expect(rels).toContain('src/ui/button.tsx');
  });

  it('is case-insensitive', () => {
    const { tree } = buildSearchTree(flat, '/ws', 'BUTTON');
    const found = JSON.stringify(tree).includes('button.tsx');
    expect(found).toBe(true);
  });

  it('returns an empty root (only root, no children) when nothing matches', () => {
    const { tree } = buildSearchTree(flat, '/ws', 'zzz-nomatch');
    expect(tree[0].children).toEqual([]);
  });

  it('returns the bare root with empty term', () => {
    const { tree, expandedKeys } = buildSearchTree(flat, '/ws', '   ');
    expect(tree[0].children).toEqual([]);
    expect(expandedKeys).toEqual(['']);
  });
});
