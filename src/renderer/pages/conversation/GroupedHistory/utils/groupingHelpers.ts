/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { getActivityTime, getTimelineLabel } from '@/renderer/utils/chat/timeline';
import { getWorkspaceDisplayName } from '@/renderer/utils/workspace/workspace';
import { getWorkspaceUpdateTime } from '@/renderer/utils/workspace/workspaceHistory';

import type { GroupedHistoryResult, TimelineItem, TimelineSection, WorkspaceGroup, WorkspaceNode } from '../types';
import { getConversationSortOrder } from './sortOrderHelpers';

export const getConversationTimelineLabel = (conversation: TChatConversation, t: (key: string) => string): string => {
  const time = getActivityTime(conversation);
  return getTimelineLabel(time, Date.now(), t);
};

export const isConversationPinned = (conversation: TChatConversation): boolean => {
  const extra = conversation.extra as { pinned?: boolean } | undefined;
  return Boolean(extra?.pinned);
};

export const getConversationPinnedAt = (conversation: TChatConversation): number => {
  const extra = conversation.extra as { pinnedAt?: number } | undefined;
  if (typeof extra?.pinnedAt === 'number') {
    return extra.pinnedAt;
  }
  return 0;
};

export const groupConversationsByTimelineAndWorkspace = (
  conversations: TChatConversation[],
  t: (key: string) => string
): TimelineSection[] => {
  const allWorkspaceGroups = new Map<string, TChatConversation[]>();
  const withoutWorkspaceConvs: TChatConversation[] = [];

  // Filter out team children — they'll be nested under their parent
  const teamChildIds = new Set<string>();
  conversations.forEach((conv) => {
    const teamId = (conv.extra as { teamId?: string })?.teamId;
    if (teamId) {
      teamChildIds.add(conv.id);
    }
  });

  conversations.forEach((conv) => {
    // Skip team children — they'll appear nested under their team parent
    if (teamChildIds.has(conv.id)) return;

    const workspace = conv.extra?.workspace;

    if (workspace) {
      if (!allWorkspaceGroups.has(workspace)) {
        allWorkspaceGroups.set(workspace, []);
      }
      allWorkspaceGroups.get(workspace)!.push(conv);
    } else {
      withoutWorkspaceConvs.push(conv);
    }
  });

  const workspaceGroupsByTimeline = new Map<string, WorkspaceGroup[]>();

  allWorkspaceGroups.forEach((convList, workspace) => {
    const sortedConvs = [...convList].toSorted((a, b) => getActivityTime(b) - getActivityTime(a));
    const latestConv = sortedConvs[0];
    const timeline = getConversationTimelineLabel(latestConv, t);

    if (!workspaceGroupsByTimeline.has(timeline)) {
      workspaceGroupsByTimeline.set(timeline, []);
    }

    workspaceGroupsByTimeline.get(timeline)!.push({
      workspace,
      displayName: getWorkspaceDisplayName(workspace),
      conversations: sortedConvs,
      nodes: buildWorkspaceNodes(sortedConvs, conversations),
    });
  });

  const withoutWorkspaceByTimeline = new Map<string, TChatConversation[]>();

  withoutWorkspaceConvs.forEach((conv) => {
    const timeline = getConversationTimelineLabel(conv, t);
    if (!withoutWorkspaceByTimeline.has(timeline)) {
      withoutWorkspaceByTimeline.set(timeline, []);
    }
    withoutWorkspaceByTimeline.get(timeline)!.push(conv);
  });

  const timelineOrder = [
    'conversation.history.today',
    'conversation.history.yesterday',
    'conversation.history.recent7Days',
    'conversation.history.earlier',
  ];
  const sections: TimelineSection[] = [];

  timelineOrder.forEach((timelineKey) => {
    const timeline = t(timelineKey);
    const withWorkspace = workspaceGroupsByTimeline.get(timeline) || [];
    const withoutWorkspace = withoutWorkspaceByTimeline.get(timeline) || [];

    if (withWorkspace.length === 0 && withoutWorkspace.length === 0) return;

    const items: TimelineItem[] = [];

    withWorkspace.forEach((group) => {
      const updateTime = getWorkspaceUpdateTime(group.workspace);
      const time = updateTime > 0 ? updateTime : getActivityTime(group.conversations[0]);
      items.push({
        type: 'workspace',
        time,
        workspaceGroup: group,
      });
    });

    withoutWorkspace.forEach((conv) => {
      items.push({
        type: 'conversation',
        time: getActivityTime(conv),
        conversation: conv,
      });
    });

    items.sort((a, b) => b.time - a.time);

    sections.push({
      timeline,
      items,
    });
  });

  return sections;
};

export const buildGroupedHistory = (
  conversations: TChatConversation[],
  t: (key: string) => string
): GroupedHistoryResult => {
  const pinnedConversations = conversations
    .filter((conversation) => isConversationPinned(conversation))
    .toSorted((a, b) => {
      const orderA = getConversationSortOrder(a);
      const orderB = getConversationSortOrder(b);
      if (orderA !== undefined && orderB !== undefined) return orderA - orderB;
      if (orderA !== undefined) return -1;
      if (orderB !== undefined) return 1;
      return getConversationPinnedAt(b) - getConversationPinnedAt(a);
    });

  const normalConversations = conversations.filter((conversation) => !isConversationPinned(conversation));

  return {
    pinnedConversations,
    timelineSections: groupConversationsByTimelineAndWorkspace(normalConversations, t),
  };
};

/**
 * Build structured workspace nodes from a list of conversations in one workspace.
 * agent-team parents get their children nested; standalone conversations stay flat.
 * @param workspaceConvs - conversations already filtered to this workspace (top-level only, no team children)
 * @param allConversations - full conversation list for looking up team children by teamId
 */
function buildWorkspaceNodes(workspaceConvs: TChatConversation[], allConversations: TChatConversation[]): WorkspaceNode[] {
  const nodes: WorkspaceNode[] = [];

  for (const conv of workspaceConvs) {
    if (conv.type === 'agent-team') {
      // Find children by teamId
      const members = (conv.extra as { members?: Array<{ conversationId: string }> })?.members || [];
      const childIds = new Set(members.map((m) => m.conversationId));
      const children = allConversations.filter((c) => childIds.has(c.id));
      nodes.push({ kind: 'team', teamConversation: conv, children });
    } else {
      nodes.push({ kind: 'conversation', conversation: conv });
    }
  }

  return nodes;
}
