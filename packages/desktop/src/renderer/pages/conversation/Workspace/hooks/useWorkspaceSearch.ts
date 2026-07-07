/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IDirOrFile } from '@/common/adapter/ipcBridge';
import useDebounce from '@/renderer/hooks/ui/useDebounce';
import type { RefInputType } from '@arco-design/web-react/es/Input/interface';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorkspaceSearchMode } from './useWorkspaceTree';

export type WorkspaceSearchScope = 'workspace' | 'currentFolder';

export type WorkspaceSearchStats = {
  fileCount: number;
  contentBlockCount: number;
};

type UseWorkspaceSearchParams = {
  workspace: string;
  loadWorkspace: (path: string, search?: string, searchMode?: WorkspaceSearchMode) => Promise<IDirOrFile[]>;
};

const collectSearchStats = (nodes: IDirOrFile[]): WorkspaceSearchStats => {
  let fileCount = 0;
  let contentBlockCount = 0;

  const visit = (node: IDirOrFile) => {
    if (node.isFile) {
      fileCount += 1;
      if (node.searchContentMatchCount != null) {
        contentBlockCount += node.searchContentMatchCount;
      } else if (node.searchMatchKind === 'content') {
        contentBlockCount += 1;
      }
    }
    node.children?.forEach(visit);
  };

  nodes.forEach(visit);
  return { fileCount, contentBlockCount };
};

/**
 * Manages workspace search state, debounced search callback, focus behavior,
 * and host file selector state (WebUI).
 */
export function useWorkspaceSearch({ workspace, loadWorkspace }: UseWorkspaceSearchParams) {
  const [searchText, setSearchText] = useState('');
  const [showSearch, setShowSearch] = useState(true);
  const [searchScope, setSearchScope] = useState<WorkspaceSearchScope>('workspace');
  const [searchMode, setSearchMode] = useState<WorkspaceSearchMode>('all');
  const [searchFolderPath, setSearchFolderPath] = useState(workspace);
  const [searchFolderLabel, setSearchFolderLabel] = useState('');
  const [searchStats, setSearchStats] = useState<WorkspaceSearchStats | null>(null);
  const searchInputRef = useRef<RefInputType | null>(null);

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

  const runSearch = useCallback(
    (value: string, scope: WorkspaceSearchScope, mode: WorkspaceSearchMode, folderPath = searchFolderPath) => {
      const trimmedValue = value.trim();
      const path = scope === 'currentFolder' ? folderPath : workspace;
      void loadWorkspace(path, value, mode).then((files) => {
        setShowSearch(files.length > 0 && files[0]?.children?.length > 0);
        setSearchStats(trimmedValue ? collectSearchStats(files) : null);
      });
    },
    [loadWorkspace, searchFolderPath, workspace]
  );

  // Debounced search handler
  const onSearch = useDebounce(
    (value: string) => {
      runSearch(value, searchScope, searchMode);
    },
    200,
    [runSearch, searchMode, searchScope]
  );

  const updateSearchScope = useCallback(
    (scope: WorkspaceSearchScope) => {
      setSearchScope(scope);
      if (searchText) {
        runSearch(searchText, scope, searchMode);
      }
    },
    [runSearch, searchMode, searchText]
  );

  const updateSearchMode = useCallback(
    (mode: WorkspaceSearchMode) => {
      setSearchMode(mode);
      if (searchText) {
        runSearch(searchText, searchScope, mode);
      }
    },
    [runSearch, searchScope, searchText]
  );

  useEffect(() => {
    setSearchFolderPath(workspace);
    setSearchFolderLabel('');
    setSearchScope('workspace');
    setSearchStats(null);
  }, [workspace]);

  const clearSearch = useCallback(() => {
    setSearchText('');
    setSearchStats(null);
  }, []);

  const selectSearchFolder = useCallback(
    (folderPath: string, folderLabel: string) => {
      setSearchFolderPath(folderPath);
      setSearchFolderLabel(folderLabel);
      setSearchScope('currentFolder');
      if (searchText) {
        runSearch(searchText, 'currentFolder', searchMode, folderPath);
      }
    },
    [runSearch, searchMode, searchText]
  );

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
    searchScope,
    setSearchScope: updateSearchScope,
    searchFolderLabel,
    selectSearchFolder,
    searchStats,
    clearSearch,
    searchMode,
    setSearchMode: updateSearchMode,
    searchInputRef,
    onSearch,
    showHostFileSelector,
    setShowHostFileSelector,
    handleHostFileSelected,
  };
}
