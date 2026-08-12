/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import { resourceKey, type ScmResource } from '@/renderer/pages/conversation/SourceControl/scmModel';
import {
  allDirKeys,
  buildScmTree,
  type ScmTreeDir,
  type ScmTreeFile,
  type ScmTreeNode,
} from '@/renderer/pages/conversation/SourceControl/scmTree';

const res = (path: string): ScmResource => ({
  file: { pe_id: 'pe1', relative_path: path },
  repo_relative_path: path,
  state: 'modified',
});

const dir = (n: ScmTreeNode): ScmTreeDir => {
  if (n.kind !== 'dir') throw new Error(`expected dir, got ${n.kind}`);
  return n;
};
const file = (n: ScmTreeNode): ScmTreeFile => {
  if (n.kind !== 'file') throw new Error(`expected file, got ${n.kind}`);
  return n;
};

describe('buildScmTree', () => {
  it('nests files under their directory segments', () => {
    const tree = buildScmTree([res('src/a.ts'), res('src/b.ts')]);
    expect(tree).toHaveLength(1);
    const src = dir(tree[0]);
    expect(src.label).toBe('src');
    expect(src.key).toBe('src');
    expect(src.children.map((c) => c.label)).toEqual(['a.ts', 'b.ts']);
  });

  it('orders directories before files, each alphabetical and case-insensitive', () => {
    const tree = buildScmTree([res('z.ts'), res('B/x.ts'), res('a/y.ts'), res('A.ts')]);
    // dirs first (a, B — case-insensitive), then files (A.ts, z.ts).
    expect(tree.map((n) => `${n.kind}:${n.label}`)).toEqual(['dir:a', 'dir:B', 'file:A.ts', 'file:z.ts']);
  });

  it('compacts single-child directory chains into one node (VS Code compact folders)', () => {
    const tree = buildScmTree([res('a/b/c/deep.ts')]);
    expect(tree).toHaveLength(1);
    const node = dir(tree[0]);
    expect(node.label).toBe('a / b / c'); // merged display
    expect(node.key).toBe('a/b/c'); // real full path for expand identity
    expect(node.children).toHaveLength(1);
    expect(file(node.children[0]).label).toBe('deep.ts');
  });

  it('stops compacting where a directory branches (a file of its own OR multiple children)', () => {
    const tree = buildScmTree([res('a/b/one.ts'), res('a/b/c/two.ts')]);
    // `a` folds into `b` (single child until b), but `b` has a file AND a subdir → stop.
    const ab = dir(tree[0]);
    expect(ab.label).toBe('a / b');
    expect(ab.key).toBe('a/b');
    // b's children: dir `c` then file `one.ts`.
    expect(ab.children.map((c) => `${c.kind}:${c.label}`)).toEqual(['dir:c', 'file:one.ts']);
  });

  it('can disable compaction (one node per real directory segment)', () => {
    const tree = buildScmTree([res('a/b/c/deep.ts')], false);
    const a = dir(tree[0]);
    expect(a.label).toBe('a');
    const b = dir(a.children[0]);
    expect(b.label).toBe('b');
    const c = dir(b.children[0]);
    expect(c.label).toBe('c');
    expect(file(c.children[0]).label).toBe('deep.ts');
  });

  it('keeps root-level files as leaves with the resource identity the list uses', () => {
    const r = res('README.md');
    const tree = buildScmTree([r]);
    expect(file(tree[0]).key).toBe(resourceKey(r));
    expect(file(tree[0]).resource).toBe(r);
  });

  it('is deterministic regardless of input order', () => {
    const paths = ['src/z.ts', 'docs/readme.md', 'src/a.ts', 'src/nested/x.ts'];
    const forward = buildScmTree(paths.map(res));
    const reversed = buildScmTree([...paths].toReversed().map(res));
    const shape = (ns: ScmTreeNode[]): unknown =>
      ns.map((n) => (n.kind === 'dir' ? { d: n.label, c: shape(n.children) } : { f: n.label }));
    expect(shape(forward)).toEqual(shape(reversed));
  });
});

describe('allDirKeys', () => {
  it('returns every directory key in pre-order (parent before child)', () => {
    const tree = buildScmTree([res('a/b/x.ts'), res('a/c.ts')], false);
    // a → (a/b, a) ; a/b under a. Pre-order: a, a/b.
    expect(allDirKeys(tree)).toEqual(['a', 'a/b']);
  });

  it('returns the compacted key for a folded chain, not each segment', () => {
    const tree = buildScmTree([res('a/b/c/deep.ts')]);
    expect(allDirKeys(tree)).toEqual(['a/b/c']);
  });

  it('is empty for a flat list of root files', () => {
    expect(allDirKeys(buildScmTree([res('a.ts'), res('b.ts')]))).toEqual([]);
  });
});
