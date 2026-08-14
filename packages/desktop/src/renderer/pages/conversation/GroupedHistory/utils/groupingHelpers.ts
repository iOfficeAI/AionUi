/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import type { SidebarItem, SidebarResponse } from '@/common/types/sidebar';
import { scopeToToken } from '@/common/adapter/sidebarMapper';
import { getActivityTime } from '@/renderer/utils/chat/timeline';
import { getWorkspaceDisplayName } from '@/renderer/utils/workspace/workspace';
import { getWorkspaceUpdateTime } from '@/renderer/utils/workspace/workspaceHistory';

import type { GroupedHistoryResult, TimelineItem, TimelineSection, WorkspaceGroup } from '../types';

export const isConversationPinned = (conversation: TChatConversation): boolean => {
  // Pin truth is the backend, derived from a `user_order` row's existence and
  // sent as the wire `pinned` flag; the sidebar mapper folds it into
  // `extra.pinned` (the deprecated `extra.pinned` JSON is no longer written by
  // the pin toggle). The sidebar read model already places pinned rows in their
  // own group, but this predicate is still consulted by row-level UI.
  return Boolean(conversation.extra?.pinned);
};

/** Strip a `file://` scheme (and percent-encoding) to a plain filesystem path. */
const stripFileScheme = (value: string): string => {
  if (!value.startsWith('file://')) return value;
  const path = value.slice('file://'.length);
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
};

/**
 * Convert the backend sidebar read model into the render shape the sidebar
 * already consumes (`{ pinnedConversations, timelineSections }`), so the view
 * layer is unchanged while classification/ordering move server-side (BR-1).
 *
 * Group → render mapping:
 * - `pinned` scope  → `pinnedConversations` (+ `pinnedRows` for team rows)
 * - `project`/`dir` → a `WorkspaceGroup` (project area), carrying its paging token
 * - `chats` scope   → flat conversation / team timeline items
 *
 * Team rows are folded into their group server-side (by `teams.project_id`), so
 * each group is projected twice in one pass: `conversations` / `pinnedConversations`
 * (conversation-only, kept for the drag / locate / removeProject consumers whose
 * semantics are conversation-scoped) and the ordered union `rows` / `pinnedRows`
 * / team timeline items (for rendering). Backend group order is authoritative and
 * preserved (descending synthetic times keep any incidental sort stable).
 */
export const mapSidebarToGroupedHistory = (response: SidebarResponse): GroupedHistoryResult => {
  const pinnedConversations: TChatConversation[] = [];
  let pinnedRows: SidebarItem[] | undefined;
  let pinnedPaging: GroupedHistoryResult['pinnedPaging'];
  let chatsPaging: GroupedHistoryResult['chatsPaging'];
  const workspaceGroups: WorkspaceGroup[] = [];
  const chatsItems: SidebarItem[] = [];

  for (const group of response.groups) {
    const convs = group.items.flatMap((item) => (item.type === 'conversation' ? [item.conversation] : []));
    const scope = group.scope;
    switch (scope.type) {
      case 'pinned':
        pinnedConversations.push(...convs);
        pinnedRows = group.items;
        pinnedPaging = { token: 'pinned', hasMore: group.has_more };
        break;
      case 'chats':
        chatsItems.push(...group.items);
        chatsPaging = { token: 'chats', hasMore: group.has_more };
        break;
      case 'project': {
        const workspace =
          convs[0]?.extra?.workspace || (scope.workspace ? stripFileScheme(scope.workspace) : '') || scope.project_id;
        workspaceGroups.push({
          workspace,
          display_name: scope.name,
          conversations: convs,
          rows: group.items,
          scopeToken: scopeToToken(scope),
          hasMore: group.has_more,
        });
        break;
      }
      case 'dir': {
        const workspace = convs[0]?.extra?.workspace || scope.path;
        workspaceGroups.push({
          workspace,
          display_name: scope.name,
          conversations: convs,
          rows: group.items,
          scopeToken: scopeToToken(scope),
          hasMore: group.has_more,
        });
        break;
      }
    }
  }

  // Single timeline section: workspace folders first (backend order), then flat
  // chats rows (conversations and teams interleaved in backend order). index.tsx
  // re-splits this into its projects / conversations sections, preserving order.
  const items: TimelineItem[] = [];
  let syntheticTime = response.groups.length + chatsItems.length + 1;
  for (const workspaceGroup of workspaceGroups) {
    items.push({ type: 'workspace', time: syntheticTime--, workspaceGroup });
  }
  for (const item of chatsItems) {
    if (item.type === 'conversation') {
      items.push({ type: 'conversation', time: syntheticTime--, conversation: item.conversation });
    } else {
      items.push({ type: 'team', time: syntheticTime--, team: item });
    }
  }

  const timelineSections: TimelineSection[] = items.length > 0 ? [{ timeline: 'recents', items }] : [];

  return { pinnedConversations, pinnedRows, pinnedPaging, timelineSections, chatsPaging };
};

export const getConversationPinnedAt = (conversation: TChatConversation): number => {
  const extra = conversation.extra as { pinned_at?: number } | undefined;
  if (typeof extra?.pinned_at === 'number') {
    return extra.pinned_at;
  }
  return 0;
};

export const groupConversationsByWorkspace = (
  conversations: TChatConversation[],
  t: (key: string) => string
): TimelineSection[] => {
  const allWorkspaceGroups = new Map<string, TChatConversation[]>();
  const withoutWorkspaceConvs: TChatConversation[] = [];

  conversations.forEach((conv) => {
    const workspace = conv.extra?.workspace;
    const custom_workspace = conv.extra?.custom_workspace;

    if (custom_workspace && workspace) {
      if (!allWorkspaceGroups.has(workspace)) {
        allWorkspaceGroups.set(workspace, []);
      }
      allWorkspaceGroups.get(workspace)!.push(conv);
    } else {
      withoutWorkspaceConvs.push(conv);
    }
  });

  const items: TimelineItem[] = [];

  allWorkspaceGroups.forEach((convList, workspace) => {
    const sortedConvs = [...convList].toSorted((a, b) => getActivityTime(b) - getActivityTime(a));
    const latestConversationTime = getActivityTime(sortedConvs[0]);
    const updateTime = getWorkspaceUpdateTime(workspace);
    const time = Math.max(updateTime, latestConversationTime);
    items.push({
      type: 'workspace',
      time,
      workspaceGroup: {
        workspace,
        // This grouping path only sees custom (user-chosen) workspaces —
        // non-custom conversations end up in `withoutWorkspaceConvs` above
        // and never reach this helper. Passing `false` is therefore correct
        // without consulting `extra.is_temporary_workspace` per-row.
        display_name: getWorkspaceDisplayName(workspace, false, t),
        conversations: sortedConvs,
      },
    });
  });

  withoutWorkspaceConvs.forEach((conv) => {
    items.push({
      type: 'conversation',
      time: getActivityTime(conv),
      conversation: conv,
    });
  });

  items.sort((a, b) => b.time - a.time);

  if (items.length === 0) return [];

  return [
    {
      timeline: t('conversation.history.recents'),
      items,
    },
  ];
};

/** Check whether a conversation belongs to a team (should be hidden from sidebar). */
const isTeamConversation = (conversation: TChatConversation): boolean => {
  const extra = conversation.extra as { team_id?: string; teamId?: string } | undefined;
  return Boolean(extra?.team_id || extra?.teamId);
};

export const buildGroupedHistory = (
  conversations: TChatConversation[],
  t: (key: string) => string
): GroupedHistoryResult => {
  // Filter out team-owned conversations; they are only visible via the Teams panel
  const visibleConversations = conversations.filter((conv) => !isTeamConversation(conv));

  const pinnedConversations = visibleConversations
    .filter((conversation) => isConversationPinned(conversation))
    // Pin order truth is the backend `user_order` table (see mapSidebarToGroupedHistory,
    // the live path). This legacy fallback keeps pinned-first-by-recency only.
    .toSorted((a, b) => getConversationPinnedAt(b) - getConversationPinnedAt(a));

  const normalConversations = visibleConversations.filter((conversation) => !isConversationPinned(conversation));

  return {
    pinnedConversations,
    timelineSections: groupConversationsByWorkspace(normalConversations, t),
  };
};
