/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/storage';
import { getWorkspaceDisplayName, isTemporaryWorkspace } from './workspace';

export type WorkspaceHistoryRecord = {
  workspace: string;
  updatedAt: number;
};

export type RecentWorkspaceItem = {
  path: string;
  label: string;
  updatedAt: number;
};

export const normalizeWorkspacePath = (workspacePath: string): string => workspacePath.replace(/[\\/]+$/, '').trim();

const getWorkspaceKey = (workspacePath: string): string => normalizeWorkspacePath(workspacePath).toLowerCase();

const resolveConversationWorkspace = (conversation: TChatConversation): string => {
  const workspace = typeof conversation.extra?.workspace === 'string' ? conversation.extra.workspace : '';

  if (!workspace || conversation.extra?.customWorkspace !== true) {
    return '';
  }

  const normalizedWorkspace = normalizeWorkspacePath(workspace);
  if (!normalizedWorkspace || isTemporaryWorkspace(normalizedWorkspace)) {
    return '';
  }

  return normalizedWorkspace;
};

const upsertWorkspace = (workspaceMap: Map<string, RecentWorkspaceItem>, workspacePath: string, updatedAt: number): void => {
  const normalizedWorkspace = normalizeWorkspacePath(workspacePath);
  if (!normalizedWorkspace || isTemporaryWorkspace(normalizedWorkspace)) {
    return;
  }

  const workspaceKey = getWorkspaceKey(normalizedWorkspace);
  const currentItem = workspaceMap.get(workspaceKey);
  if (!currentItem || updatedAt > currentItem.updatedAt) {
    workspaceMap.set(workspaceKey, {
      path: normalizedWorkspace,
      label: getWorkspaceDisplayName(normalizedWorkspace),
      updatedAt,
    });
  }
};

export const collectRecentWorkspaces = (conversations: TChatConversation[], historyRecords: WorkspaceHistoryRecord[] = [], currentWorkspace = ''): RecentWorkspaceItem[] => {
  const workspaceMap = new Map<string, RecentWorkspaceItem>();

  historyRecords.forEach(({ workspace, updatedAt }) => {
    upsertWorkspace(workspaceMap, workspace, updatedAt);
  });

  conversations.forEach((conversation) => {
    const workspace = resolveConversationWorkspace(conversation);
    if (!workspace) {
      return;
    }

    const activityTime = Math.max(conversation.modifyTime || 0, conversation.createTime || 0);
    upsertWorkspace(workspaceMap, workspace, activityTime);
  });

  const normalizedCurrentWorkspace = normalizeWorkspacePath(currentWorkspace);
  if (normalizedCurrentWorkspace) {
    upsertWorkspace(workspaceMap, normalizedCurrentWorkspace, 0);
  }

  return Array.from(workspaceMap.values()).sort((left, right) => {
    if (right.updatedAt !== left.updatedAt) {
      return right.updatedAt - left.updatedAt;
    }

    return left.label.localeCompare(right.label);
  });
};
