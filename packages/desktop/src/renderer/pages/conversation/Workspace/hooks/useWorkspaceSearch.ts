/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IDirOrFile } from '@/common/adapter/ipcBridge';
import useDebounce from '@/renderer/hooks/ui/useDebounce';
import { WORKSPACE_SEARCH_EVENT } from '@/renderer/utils/workspace/workspaceEvents';
import type { RefInputType } from '@arco-design/web-react/es/Input/interface';
import { useCallback, useEffect, useRef, useState } from 'react';

type UseWorkspaceSearchParams = {
  workspace: string;
  loadWorkspace: (path: string, search?: string) => Promise<IDirOrFile[]>;
  onOpenSearch?: () => void;
};

/**
 * Manages workspace search state, debounced search callback, focus behavior,
 * and host file selector state (WebUI).
 */
export function useWorkspaceSearch({ workspace, loadWorkspace, onOpenSearch }: UseWorkspaceSearchParams) {
  const [searchText, setSearchText] = useState('');
  const [showSearch, setShowSearch] = useState(true);
  const searchInputRef = useRef<RefInputType | null>(null);

  // Host file selector state (WebUI: use DirectorySelectionModal instead of native dialog)
  const [showHostFileSelector, setShowHostFileSelector] = useState(false);
  const focusSearchInput = useCallback(() => {
    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus?.();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, []);

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
      previousShowSearchRef.current = showSearch;
      return focusSearchInput();
    }

    previousShowSearchRef.current = showSearch;
  }, [focusSearchInput, showSearch]);

  useEffect(() => {
    const handleWorkspaceSearch = () => {
      onOpenSearch?.();
      setShowSearch(true);
      focusSearchInput();
    };

    window.addEventListener(WORKSPACE_SEARCH_EVENT, handleWorkspaceSearch);
    return () => {
      window.removeEventListener(WORKSPACE_SEARCH_EVENT, handleWorkspaceSearch);
    };
  }, [focusSearchInput, onOpenSearch]);

  // Debounced search handler
  const onSearch = useDebounce(
    (value: string) => {
      void loadWorkspace(workspace, value).then((files) => {
        setShowSearch(files.length > 0 && files[0]?.children?.length > 0);
      });
    },
    200,
    [workspace, loadWorkspace]
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
    searchInputRef,
    onSearch,
    showHostFileSelector,
    setShowHostFileSelector,
    handleHostFileSelected,
  };
}
