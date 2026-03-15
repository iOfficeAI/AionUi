/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/storage';
import { addEventListener } from '@/renderer/utils/emitter';
import { collectRecentWorkspaces, type RecentWorkspaceItem } from '@/renderer/utils/recentWorkspaces';
import { getWorkspaceHistoryRecords } from '@/renderer/utils/workspaceHistory';
import { useCallback, useEffect, useState } from 'react';

export const useRecentWorkspaces = () => {
  const [workspaces, setWorkspaces] = useState<RecentWorkspaceItem[]>([]);

  const refresh = useCallback(async () => {
    const historyRecords = getWorkspaceHistoryRecords();

    try {
      const conversations = await ipcBridge.database.getUserConversations.invoke({
        page: 0,
        pageSize: 10000,
      });

      const normalizedConversations = Array.isArray(conversations) ? conversations.filter((conversation) => (conversation.extra as { isHealthCheck?: boolean } | undefined)?.isHealthCheck !== true) : [];

      setWorkspaces(collectRecentWorkspaces(normalizedConversations as TChatConversation[], historyRecords));
    } catch (error) {
      console.error('[useRecentWorkspaces] Failed to load workspaces:', error);
      setWorkspaces(collectRecentWorkspaces([], historyRecords));
    }
  }, []);

  useEffect(() => {
    void refresh();
    return addEventListener('chat.history.refresh', () => {
      void refresh();
    });
  }, [refresh]);

  return {
    workspaces,
    refresh,
  };
};
