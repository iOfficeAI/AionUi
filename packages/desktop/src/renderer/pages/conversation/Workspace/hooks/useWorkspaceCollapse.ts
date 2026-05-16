/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { STORAGE_KEYS } from '@/common/config/storageKeys';
import { useEffect, useState } from 'react';

/**
 * Manages workspace tree collapse state with localStorage persistence.
 * The collapse state is global (not per-workspace) and persists across sessions.
 */
export function useWorkspaceCollapse() {
  const [isWorkspaceCollapsed, setIsWorkspaceCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.WORKSPACE_TREE_COLLAPSE);
      if (stored) {
        return stored === 'true';
      }
    } catch {
      // Ignore errors
    }
    return false; // Default to expanded
  });

  // Persist collapse state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.WORKSPACE_TREE_COLLAPSE, String(isWorkspaceCollapsed));
    } catch {
      // Ignore errors
    }
  }, [isWorkspaceCollapsed]);

  return { isWorkspaceCollapsed, setIsWorkspaceCollapsed };
}
