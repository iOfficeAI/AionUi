/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import type { GroupedHistoryResult } from '../types';
import { useConversationListSync } from './useConversationListSync';
import { buildGroupedHistory } from '../utils/groupingHelpers';

const EXPANSION_STORAGE_KEY = 'aionui_workspace_expansion';
const HIDDEN_WORKSPACES_KEY = 'aionui_hidden_workspaces';

export const useConversations = () => {
  const [hiddenWorkspaces, setHiddenWorkspaces] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(HIDDEN_WORKSPACES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch {
      // ignore
    }
    return [];
  });

  const [expandedWorkspaces, setExpandedWorkspaces] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(EXPANSION_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch {
      // ignore
    }
    return [];
  });
  const { id } = useParams();
  const { t } = useTranslation();
  const { conversations, isConversationGenerating, hasCompletionUnread, clearCompletionUnread, setActiveConversation } =
    useConversationListSync();

  // Track whether auto-expand has already been performed to avoid
  // re-expanding workspaces after a user manually collapses them (#1156)
  const hasAutoExpandedRef = useRef(false);

  // Scroll active conversation into view
  useEffect(() => {
    if (!id) {
      setActiveConversation(null);
      return;
    }

    setActiveConversation(id);
    clearCompletionUnread(id);
    const rafId = requestAnimationFrame(() => {
      const element = document.getElementById('c-' + id);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [clearCompletionUnread, id, setActiveConversation]);

  // Persist expansion state
  useEffect(() => {
    try {
      localStorage.setItem(EXPANSION_STORAGE_KEY, JSON.stringify(expandedWorkspaces));
    } catch {
      // ignore
    }
  }, [expandedWorkspaces]);

  const groupedHistory: GroupedHistoryResult = useMemo(() => {
    return buildGroupedHistory(conversations, t);
  }, [conversations, t]);

  const { pinnedConversations, timelineSections } = groupedHistory;

  // Auto-expand all workspaces on first load only (#1156)
  useEffect(() => {
    if (hasAutoExpandedRef.current) return;
    if (expandedWorkspaces.length > 0) {
      hasAutoExpandedRef.current = true;
      return;
    }
    const allWorkspaces: string[] = [];
    timelineSections.forEach((section) => {
      section.items.forEach((item) => {
        if (item.type === 'workspace' && item.workspaceGroup) {
          allWorkspaces.push(item.workspaceGroup.workspace);
        }
      });
    });
    if (allWorkspaces.length > 0) {
      setExpandedWorkspaces(allWorkspaces);
      hasAutoExpandedRef.current = true;
    }
  }, [timelineSections]);

  // Remove stale workspace entries that no longer exist in the data
  useEffect(() => {
    const currentWorkspaces = new Set<string>();
    timelineSections.forEach((section) => {
      section.items.forEach((item) => {
        if (item.type === 'workspace' && item.workspaceGroup) {
          currentWorkspaces.add(item.workspaceGroup.workspace);
        }
      });
    });
    if (currentWorkspaces.size === 0) return;
    setExpandedWorkspaces((prev) => {
      const filtered = prev.filter((ws) => currentWorkspaces.has(ws));
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [timelineSections]);

  // Persist hidden workspaces
  useEffect(() => {
    try {
      localStorage.setItem(HIDDEN_WORKSPACES_KEY, JSON.stringify(hiddenWorkspaces));
    } catch {
      // ignore
    }
  }, [hiddenWorkspaces]);

  // Filter out hidden workspaces from timeline sections
  const visibleTimelineSections = useMemo(() => {
    if (hiddenWorkspaces.length === 0) return timelineSections;
    const hiddenSet = new Set(hiddenWorkspaces);
    return timelineSections.map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.type === 'workspace' && item.workspaceGroup) {
          return !hiddenSet.has(item.workspaceGroup.workspace);
        }
        return true;
      }),
    })).filter((section) => section.items.length > 0);
  }, [timelineSections, hiddenWorkspaces]);

  const handleToggleWorkspace = useCallback((workspace: string) => {
    setExpandedWorkspaces((prev) => {
      if (prev.includes(workspace)) {
        return prev.filter((item) => item !== workspace);
      }
      return [...prev, workspace];
    });
  }, []);

  const handleHideWorkspace = useCallback((workspace: string) => {
    setHiddenWorkspaces((prev) => prev.includes(workspace) ? prev : [...prev, workspace]);
  }, []);

  const handleUnhideWorkspace = useCallback((workspace: string) => {
    setHiddenWorkspaces((prev) => prev.filter((ws) => ws !== workspace));
  }, []);

  const handleUnhideAll = useCallback(() => {
    setHiddenWorkspaces([]);
  }, []);

  return {
    conversations,
    isConversationGenerating,
    hasCompletionUnread,
    expandedWorkspaces,
    pinnedConversations: useMemo(() => {
      if (hiddenWorkspaces.length === 0) return pinnedConversations;
      const hiddenSet = new Set(hiddenWorkspaces);
      return pinnedConversations.filter((conv) => {
        const ws = conv.extra?.workspace;
        return !ws || !hiddenSet.has(ws);
      });
    }, [pinnedConversations, hiddenWorkspaces]),
    timelineSections: visibleTimelineSections,
    hiddenWorkspaces,
    handleToggleWorkspace,
    handleHideWorkspace,
    handleUnhideWorkspace,
    handleUnhideAll,
  };
};
