/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pure tree-building for the Changes section's "view as tree" mode (VS Code SCM
 * parity). No React, no store: it turns one group's flat resource list into a
 * directory tree, which the view renders recursively. "View as list" needs none
 * of this — it renders the flat list directly — so this module is only pulled in
 * by the tree path.
 *
 * Two shape choices mirror VS Code:
 *
 *  - **Compact folders**: a chain of directories with a single child directory and
 *    no files of its own is merged into one node (`a / b / c`), so deep single-child
 *    paths do not waste a row each. This is display-only — the merged node's key
 *    still encodes the full path, so expand state and identity stay per-real-path.
 *  - **Directories before files, each alphabetical**: stable, case-insensitive, and
 *    independent of the wire order (which is per-status-frame and not sorted).
 *
 * A resource's tree path is its `repo_relative_path` (falling back to the pe-relative
 * path), the same source `resourceName`/`resourceDir` use — so tree and list agree on
 * where a row lives.
 */

import type { ScmResource } from './scmModel';
import { resourceKey } from './scmModel';

/** A directory node: has children (dirs and/or files), never a resource of its own. */
export type ScmTreeDir = {
  kind: 'dir';
  /**
   * Stable identity + expand key: the full repo-relative directory path this node
   * represents (for a compact node, the deepest segment's full path). Unique within
   * a group, so it doubles as the React key and the persisted expand key.
   */
  key: string;
  /** Display label: the last segment, or `a/b/c` for a compact-merged chain. */
  label: string;
  children: ScmTreeNode[];
};

/** A leaf node wrapping exactly one resource row. */
export type ScmTreeFile = {
  kind: 'file';
  /** `resourceKey(resource)` — same identity the list uses, so selection agrees. */
  key: string;
  /** Display label: the file's basename. */
  label: string;
  resource: ScmResource;
};

export type ScmTreeNode = ScmTreeDir | ScmTreeFile;

/** The path a resource occupies in the tree (repo-relative, `/`-separated). */
const treePath = (resource: ScmResource): string => resource.repo_relative_path || resource.file.relative_path;

// Mutable builder node used only while assembling; converted to the immutable
// `ScmTreeNode` shape on the way out so callers never see the scaffolding.
type BuildDir = {
  segment: string;
  children: Map<string, BuildDir>;
  files: ScmTreeFile[];
};

const newBuildDir = (segment: string): BuildDir => ({ segment, children: new Map(), files: [] });

/**
 * Build the directory tree for one group's resources.
 *
 * `compactFolders` (default true) merges single-child directory chains VS Code-style.
 * Ordering is directories-first, each side case-insensitively alphabetical, so the
 * output is deterministic regardless of the wire's per-frame order.
 */
export const buildScmTree = (resources: ScmResource[], compactFolders = true): ScmTreeNode[] => {
  const root = newBuildDir('');
  for (const resource of resources) {
    const path = treePath(resource);
    const segments = path.split('/').filter((s) => s.length > 0);
    const fileName = segments.pop() ?? path;
    let dir = root;
    for (const segment of segments) {
      let next = dir.children.get(segment);
      if (!next) {
        next = newBuildDir(segment);
        dir.children.set(segment, next);
      }
      dir = next;
    }
    dir.files.push({ kind: 'file', key: resourceKey(resource), label: fileName, resource });
  }
  return emitChildren(root, '', compactFolders);
};

/** Emit a build dir's children as sorted immutable nodes under `prefix`. */
const emitChildren = (dir: BuildDir, prefix: string, compact: boolean): ScmTreeNode[] => {
  const dirNodes: ScmTreeDir[] = [];
  for (const child of dir.children.values()) {
    dirNodes.push(emitDir(child, prefix, compact));
  }
  const sortedDirs = dirNodes.toSorted((a, b) => collate(a.label, b.label));
  const sortedFiles = dir.files.toSorted((a, b) => collate(a.label, b.label));
  return [...sortedDirs, ...sortedFiles];
};

/**
 * Emit one directory node, applying compaction: while this node has exactly one
 * child directory and no files of its own, fold that child in and join the labels
 * with ` / `. The node's `key` is always the full real path of its deepest folded
 * segment, so expand state keys on the real directory, not the display label.
 */
const emitDir = (dir: BuildDir, prefix: string, compact: boolean): ScmTreeDir => {
  let fullPath = prefix ? `${prefix}/${dir.segment}` : dir.segment;
  let label = dir.segment;
  let current = dir;
  if (compact) {
    while (current.files.length === 0 && current.children.size === 1) {
      const [only] = current.children.values();
      current = only;
      fullPath = `${fullPath}/${current.segment}`;
      label = `${label} / ${current.segment}`;
    }
  }
  return { kind: 'dir', key: fullPath, label, children: emitChildren(current, fullPath, compact) };
};

/** Case-insensitive, locale-aware label compare for stable ordering. */
const collate = (a: string, b: string): number => a.localeCompare(b, undefined, { sensitivity: 'base' });

/**
 * All directory keys in a tree — used to expand-all by default (VS Code opens the
 * change tree fully expanded). Order is parent-before-child (pre-order).
 */
export const allDirKeys = (nodes: ScmTreeNode[]): string[] => {
  const keys: string[] = [];
  const walk = (ns: ScmTreeNode[]): void => {
    for (const n of ns) {
      if (n.kind === 'dir') {
        keys.push(n.key);
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return keys;
};
