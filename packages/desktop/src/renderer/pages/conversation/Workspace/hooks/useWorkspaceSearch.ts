/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IDirOrFile } from '@/common/adapter/ipcBridge';
import useDebounce from '@/renderer/hooks/ui/useDebounce';
import { useCallback, useEffect, useRef, useState } from 'react';
import { buildSearchTree } from '../utils/treeHelpers';

type UseWorkspaceSearchParams = {
  workspace: string;
  expandedKeys: string[];
  setFiles: React.Dispatch<React.SetStateAction<IDirOrFile[]>>;
  setExpandedKeys: React.Dispatch<React.SetStateAction<string[]>>;
  setTreeKey: React.Dispatch<React.SetStateAction<number>>;
  refreshWorkspace: () => void;
};

/**
 * Manages workspace search state.
 *
 * Search is now performed entirely on the frontend: it pulls the workspace's
 * full recursive file list once (`fs.listWorkspaceFiles`, which the backend
 * already returns as a flat list of every file at any depth) and filters by
 * name/path locally. Matches at ANY nesting level surface, and their parent
 * folders are auto-expanded — fixing the old behavior where only first-level
 * names could be found. Clearing the box restores the normal lazy-loaded tree.
 */
export function useWorkspaceSearch({
  workspace,
  expandedKeys,
  setFiles,
  setExpandedKeys,
  setTreeKey,
  refreshWorkspace,
}: UseWorkspaceSearchParams) {
  const [searchText, setSearchText] = useState('');
  const [showSearch, setShowSearch] = useState(true);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Host file selector state (WebUI: use DirectorySelectionModal instead of native dialog)
  const [showHostFileSelector, setShowHostFileSelector] = useState(false);

  // Only focus search input when user actively opens search, not on conversation switch
  const previousShowSearchRef = useRef<boolean | null>(null);
  useEffect(() => {
    // Skip focus on first render or conversation switch
    if (previousShowSearchRef.current === null) {
      previousShowSearchRef.current = showSearch;
      return;
    }

    // Only focus when transitioning from false to true (user actively opens search)
    if (showSearch && !previousShowSearchRef.current) {
      const timer = window.setTimeout(() => {
        searchInputRef.current?.focus?.();
      }, 0);
      previousShowSearchRef.current = showSearch;
      return () => {
        window.clearTimeout(timer);
      };
    }

    previousShowSearchRef.current = showSearch;
  }, [showSearch]);

  // Snapshot of expandedKeys taken just before a search starts, so clearing
  // the search box restores exactly what was expanded before — not the much
  // larger set that the search results opened.
  const preSearchExpandedKeysRef = useRef<string[] | null>(null);
  const expandedKeysRef = useRef(expandedKeys);
  expandedKeysRef.current = expandedKeys;

  // Ignore stale flat-list responses when the term changes quickly.
  const searchSeqRef = useRef(0);

  const runSearch = useCallback(
    (value: string) => {
      const term = value.trim();
      if (!term) {
        // Restore the normal tree. If we have a pre-search snapshot, restore
        // the expansion state to what it was before the search, then refresh.
        // This avoids triggering a parallel fetch for every dir the search opened.
        searchSeqRef.current++;
        setShowSearch(true);
        if (preSearchExpandedKeysRef.current !== null) {
          setExpandedKeys(preSearchExpandedKeysRef.current);
          preSearchExpandedKeysRef.current = null;
        }
        refreshWorkspace();
        return;
      }
      // Save expansion state before the first search keystroke.
      if (preSearchExpandedKeysRef.current === null) {
        preSearchExpandedKeysRef.current = [...expandedKeysRef.current];
      }
      const seq = ++searchSeqRef.current;
      void ipcBridge.fs.listWorkspaceFiles
        .invoke({ root: workspace })
        .then((flatFiles) => {
          if (seq !== searchSeqRef.current) return;
          const { tree, expandedKeys: searchExpandedKeys } = buildSearchTree(flatFiles, workspace, term);
          setFiles(tree);
          setExpandedKeys(searchExpandedKeys);
          setTreeKey(Math.random());
          // Keep the search box visible even with zero matches so the user can
          // edit the term; the tree area shows the empty state.
          setShowSearch(true);
        })
        .catch((err) => {
          if (seq !== searchSeqRef.current) return;
          console.error('[useWorkspaceSearch] search failed:', err);
        });
    },
    [workspace, setFiles, setExpandedKeys, setTreeKey, refreshWorkspace]
  );

  // Debounced search handler
  const onSearch = useDebounce((value: string) => runSearch(value), 200, [runSearch]);

  // Handle host file selection callback (WebUI)
  const handleHostFileSelected = useCallback(
    (
      paths: string[] | undefined,
      handleFilesToAdd: (files: Array<{ name: string; path: string }>) => Promise<void>
    ) => {
      setShowHostFileSelector(false);
      if (paths && paths.length > 0) {
        void handleFilesToAdd(paths.map((p) => ({ name: p.split('/').pop() || p, path: p })));
      }
    },
    []
  );

  return {
    searchText,
    setSearchText,
    showSearch,
    setShowSearch,
    searchInputRef,
    onSearch,
    showHostFileSelector,
    setShowHostFileSelector,
    handleHostFileSelected,
  };
}
