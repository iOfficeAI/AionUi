/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Wires the editor's reveal-in-tree event into the workspace file tree.
 *
 * The editor and the file tree live in different subtrees
 * (`EditorPanel` vs `Workspace/index.tsx`) and may be mounted or
 * unmounted independently. They communicate via a window CustomEvent
 * (`editor.reveal.path`) dispatched by the editor when the user
 * activates a buffer; this hook subscribes to that event, normalizes
 * the path against the workspace, and pushes it into the tree's
 * selection + expanded-keys state.
 *
 * The hook is intentionally thin: all path math and event typing live
 * in `editorReveal.ts`. The tree only needs to do two things on a
 * reveal — select the file and expand its parent chain.
 */

import { useEffect } from 'react';
import {
  EDITOR_REVEAL_PATH_EVENT,
  isEditorRevealPathEvent,
  relativePathFromWorkspace,
} from '@/renderer/pages/conversation/Editor';

type UseEditorRevealInTreeOptions = {
  /** The workspace root the tree is currently scoped to. Events for other
   * workspaces are ignored so the tree never reveals a path from a
   * sibling conversation. */
  workspace: string | undefined;
  /** Setter for the tree's selected keys (POSIX relative paths). */
  setSelected: (keys: string[]) => void;
  /** Setter for the tree's expanded-keys list. We union the new reveal's
   * parent chain into the existing set so the user doesn't lose their
   * manual collapses. */
  setExpandedKeys: (keys: string[]) => void;
  /** Ref to the live expanded directory keys — union parent chain on reveal. */
  expandedKeysRef?: { current: string[] };
};

/**
 * Compute the parent directory chain (POSIX, workspace-relative) for a
 * workspace-relative file path. Returns the directories from the
 * topmost down to (but not including) the file itself. For a path of
 * `src/components/Foo.tsx` this yields `['src', 'src/components']`.
 */
const parentChain = (relativePath: string): string[] => {
  const normalized = relativePath.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  // Drop the filename; we only want directories.
  if (parts.length <= 1) return [];
  const parents: string[] = [];
  for (let i = 1; i < parts.length; i += 1) {
    parents.push(parts.slice(0, i).join('/'));
  }
  return parents;
};

/**
 * Subscribe to editor reveal events and apply them to the tree. Returns
 * nothing — the side effect is the state updates on the tree.
 */
export const useEditorRevealInTree = ({
  workspace,
  setSelected,
  setExpandedKeys,
  expandedKeysRef,
}: UseEditorRevealInTreeOptions): void => {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (event: Event): void => {
      if (!isEditorRevealPathEvent(event)) return;
      const detail = event.detail;
      // Filter to events for OUR workspace. Reveal requests from
      // unrelated workspaces (e.g. another conversation mounted in a
      // different pane) must not jump our tree around.
      if (!workspace) return;
      if (detail.workspace && detail.workspace !== workspace) return;

      const relative = detail.relativePath ?? relativePathFromWorkspace(detail.workspace, detail.filePath);
      if (!relative) return;

      // Select the file. Tree `selected` is an array of relative paths
      // (Arco uses the same key we set in `fieldNames.key`).
      setSelected([relative]);

      // Expand the parent directories so the selected file is visible.
      // We union with the existing selection (so we don't clobber a
      // multi-select the user already made) and the existing expanded
      // keys (so unrelated expanded directories stay open).
      const parents = parentChain(relative);
      if (parents.length === 0) return;
      const prevExpanded = expandedKeysRef?.current ?? [];
      setExpandedKeys(Array.from(new Set([...prevExpanded, ...parents])));
    };
    window.addEventListener(EDITOR_REVEAL_PATH_EVENT, handler);
    return () => window.removeEventListener(EDITOR_REVEAL_PATH_EVENT, handler);
  }, [workspace, setSelected, setExpandedKeys, expandedKeysRef]);
};
