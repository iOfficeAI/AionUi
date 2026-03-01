/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/storage';
import { addEventListener } from '@/renderer/utils/emitter';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import type { GroupedHistoryResult } from '../types';
import { buildGroupedHistory } from '../utils/groupingHelpers';

const EXPANSION_STORAGE_KEY = 'aionui_workspace_expansion';

export const useConversations = () => {
  const [conversations, setConversations] = useState<TChatConversation[]>([]);
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

  useEffect(() => {
    const refresh = () => {
      ipcBridge.database.getUserConversations
        .invoke({ page: 0, pageSize: 10000 })
        .then((data) => {
          if (data && Array.isArray(data)) {
            setConversations(data);
          } else {
            setConversations([]);
          }
        })
        .catch((error) => {
          console.error('[WorkspaceGroupedHistory] Failed to load conversations:', error);
          setConversations([]);
        });
    };

    refresh();
    return addEventListener('chat.history.refresh', refresh);
  }, []);

  // Scroll active conversation into view
  useEffect(() => {
    if (!id) return;
    const rafId = requestAnimationFrame(() => {
      const element = document.getElementById('c-' + id);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [id]);

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

  // Auto-expand all workspaces on first load
  useEffect(() => {
    if (expandedWorkspaces.length > 0) return;
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
    }
  }, [timelineSections, expandedWorkspaces.length]);

  const handleToggleWorkspace = useCallback((workspace: string) => {
    setExpandedWorkspaces((prev) => {
      if (prev.includes(workspace)) {
        return prev.filter((item) => item !== workspace);
      }
      return [...prev, workspace];
    });
  }, []);

  return {
    conversations,
    expandedWorkspaces,
    pinnedConversations,
    timelineSections,
    handleToggleWorkspace,
  };
};
