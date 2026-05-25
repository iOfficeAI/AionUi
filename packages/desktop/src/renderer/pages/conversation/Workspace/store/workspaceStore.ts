/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IDirOrFile, WorkspaceChange } from '@/common/adapter/ipcBridge';
import { useSyncExternalStore } from 'react';

export interface SelectedNode {
  relativePath: string;
  fullPath: string;
}

export interface WorkspaceState {
  workspace: string;
  conversationId: string;
  files: IDirOrFile[];
  loading: boolean;
  treeKey: number;
  expandedKeys: string[];
  selected: string[];
  selectedNode: SelectedNode | null;
  // Subscribed dirs are part of state so resubscribe-on-reconnect can read them
  // synchronously without coupling to the watcher hook.
  treeSubscribedDirs: Set<string>;
  previewSubscribedDirs: Set<string>;
}

const initialState = (workspace: string, conversationId: string): WorkspaceState => ({
  workspace,
  conversationId,
  files: [],
  loading: false,
  treeKey: 0,
  expandedKeys: [],
  selected: [],
  selectedNode: null,
  treeSubscribedDirs: new Set(),
  previewSubscribedDirs: new Set(),
});

type Listener = () => void;

export class WorkspaceStore {
  private state: WorkspaceState;
  private listeners = new Set<Listener>();

  constructor(workspace: string, conversationId: string) {
    this.state = initialState(workspace, conversationId);
  }

  getState = (): WorkspaceState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private set(next: WorkspaceState): void {
    if (next === this.state) return;
    this.state = next;
    for (const l of this.listeners) l();
  }

  // ---------------------------------------------------------------------------
  // Atomic mutations
  // ---------------------------------------------------------------------------

  reset(workspace: string, conversationId: string): void {
    this.set(initialState(workspace, conversationId));
  }

  setLoading(loading: boolean): void {
    if (this.state.loading === loading) return;
    this.set({ ...this.state, loading });
  }

  setFiles(files: IDirOrFile[]): void {
    this.set({ ...this.state, files });
  }

  setExpandedKeys(expandedKeys: string[]): void {
    this.set({ ...this.state, expandedKeys });
  }

  setSelected(selected: string[]): void {
    this.set({ ...this.state, selected });
  }

  setSelectedNode(selectedNode: SelectedNode | null): void {
    this.set({ ...this.state, selectedNode });
  }

  setTreeKey(treeKey: number): void {
    this.set({ ...this.state, treeKey });
  }

  // ---------------------------------------------------------------------------
  // Subscription bookkeeping (no ws side effects — caller decides)
  // ---------------------------------------------------------------------------

  addTreeSubscribedDirs(dirs: string[]): void {
    if (dirs.length === 0) return;
    const next = new Set(this.state.treeSubscribedDirs);
    for (const d of dirs) next.add(d);
    this.set({ ...this.state, treeSubscribedDirs: next });
  }

  removeTreeSubscribedDirs(dirs: string[]): void {
    if (dirs.length === 0) return;
    const next = new Set(this.state.treeSubscribedDirs);
    for (const d of dirs) {
      next.delete(d);
      // Cascade: descendants of a collapsed dir are also unsubscribed.
      for (const sub of next) {
        if (sub.startsWith(d + '/')) next.delete(sub);
      }
    }
    this.set({ ...this.state, treeSubscribedDirs: next });
  }

  addPreviewSubscribedDir(dir: string): void {
    if (this.state.previewSubscribedDirs.has(dir)) return;
    const next = new Set(this.state.previewSubscribedDirs);
    next.add(dir);
    this.set({ ...this.state, previewSubscribedDirs: next });
  }

  removePreviewSubscribedDir(dir: string): void {
    if (!this.state.previewSubscribedDirs.has(dir)) return;
    const next = new Set(this.state.previewSubscribedDirs);
    next.delete(dir);
    this.set({ ...this.state, previewSubscribedDirs: next });
  }

  isAnySubscribed(dir: string): boolean {
    return this.state.treeSubscribedDirs.has(dir) || this.state.previewSubscribedDirs.has(dir);
  }

  // ---------------------------------------------------------------------------
  // Tree mutations (immutable updates so React re-renders the right subtree)
  // ---------------------------------------------------------------------------

  replaceFiles(files: IDirOrFile[]): void {
    this.setFiles(files);
  }

  replaceChildren(parentRelPath: string, newChildren: IDirOrFile[]): void {
    // Both functions return the original `tree` reference when nothing matched —
    // this is critical for React shallow equality. If we always returned a new
    // array (e.g. via `tree.map(...)`), parent nodes would never see "I changed"
    // because the deepest changed node's new ref wouldn't bubble up: ancestors
    // would re-wrap themselves around an already-new children array regardless,
    // making the whole tree look "always changed" and forcing a full re-render —
    // OR worse, if we keyed off `length` only, the bubble-up would stop at any
    // ancestor whose direct children count didn't shift, leaving stale refs.
    const replace = (tree: IDirOrFile[]): IDirOrFile[] => {
      let changed = false;
      const result: IDirOrFile[] = [];
      for (const node of tree) {
        if (node.relativePath === parentRelPath && node.isDir) {
          changed = true;
          result.push({ ...node, children: newChildren });
          continue;
        }
        if (node.children && node.children.length > 0) {
          const updated = replace(node.children);
          if (updated !== node.children) {
            changed = true;
            result.push({ ...node, children: updated });
            continue;
          }
        }
        result.push(node);
      }
      return changed ? result : tree;
    };
    const next = replace(this.state.files);
    if (next !== this.state.files) {
      this.set({ ...this.state, files: next });
    }
  }

  removeNodes(pathsToDelete: Set<string>): void {
    if (pathsToDelete.size === 0) return;
    // See `replaceChildren` — same propagation discipline. Without this, removing
    // `src/docs` would mark `src` as a new ref but the root would compare its
    // children length and short-circuit back to its old ref, leaving Arco Tree
    // rendering stale data even though the store fired a new `files` array.
    const filter = (tree: IDirOrFile[]): IDirOrFile[] => {
      let changed = false;
      const result: IDirOrFile[] = [];
      for (const node of tree) {
        if (pathsToDelete.has(node.relativePath)) {
          changed = true;
          continue;
        }
        if (node.children && node.children.length > 0) {
          const updated = filter(node.children);
          if (updated !== node.children) {
            changed = true;
            result.push({ ...node, children: updated });
            continue;
          }
        }
        result.push(node);
      }
      return changed ? result : tree;
    };
    const next = filter(this.state.files);
    if (next !== this.state.files) {
      this.set({ ...this.state, files: next });
    }
  }
}

// Pure helper used by store consumers for the modify branch of applyChanges.
export function pathExistsInTree(tree: IDirOrFile[], relativePath: string): boolean {
  for (const node of tree) {
    if (node.relativePath === relativePath) return true;
    if (node.children && node.children.length > 0 && pathExistsInTree(node.children, relativePath)) {
      return true;
    }
  }
  return false;
}

// Re-export change type for convenience.
export type { WorkspaceChange };

// ---------------------------------------------------------------------------
// React hook bindings
// ---------------------------------------------------------------------------

export function useWorkspaceStore<T>(store: WorkspaceStore, selector: (s: WorkspaceState) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState())
  );
}
