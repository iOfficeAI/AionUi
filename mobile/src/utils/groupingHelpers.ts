/**
 * Grouped history helpers for conversation sidebar
 * Simplified port from desktop's groupingHelpers.ts — drops sortOrderHelpers and workspaceHistory
 */

import type { Conversation } from '../context/ConversationContext';
import { getActivityTime, getTimelineLabel } from './timeline';
import { getWorkspaceDisplayName } from './workspace';

// --- Types ---

export type WorkspaceGroup = {
  workspace: string;
  displayName: string;
  conversations: Conversation[];
};

export type TimelineItem = {
  type: 'workspace' | 'conversation';
  time: number;
  workspaceGroup?: WorkspaceGroup;
  conversation?: Conversation;
};

export type TimelineSection = {
  timeline: string;
  items: TimelineItem[];
};

export type GroupedHistoryResult = {
  pinnedConversations: Conversation[];
  timelineSections: TimelineSection[];
};

// --- Helpers ---

const getConversationTimelineLabel = (conversation: Conversation, t: (key: string) => string): string => {
  const time = getActivityTime(conversation);
  return getTimelineLabel(time, Date.now(), t);
};

const isConversationPinned = (conversation: Conversation): boolean => {
  return Boolean(conversation.extra?.pinned);
};

const getConversationPinnedAt = (conversation: Conversation): number => {
  const pinnedAt = conversation.extra?.pinnedAt;
  return typeof pinnedAt === 'number' ? pinnedAt : 0;
};

// --- Main functions ---

export const groupConversationsByTimelineAndWorkspace = (
  conversations: Conversation[],
  t: (key: string) => string
): TimelineSection[] => {
  const allWorkspaceGroups = new Map<string, Conversation[]>();
  const withoutWorkspaceConvs: Conversation[] = [];

  conversations.forEach((conv) => {
    const workspace = conv.extra?.workspace;
    const customWorkspace = conv.extra?.customWorkspace;

    if (customWorkspace && workspace) {
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
    const sortedConvs = [...convList].sort((a, b) => getActivityTime(b) - getActivityTime(a));
    const latestConv = sortedConvs[0];
    const timeline = getConversationTimelineLabel(latestConv, t);

    if (!workspaceGroupsByTimeline.has(timeline)) {
      workspaceGroupsByTimeline.set(timeline, []);
    }

    workspaceGroupsByTimeline.get(timeline)!.push({
      workspace,
      displayName: getWorkspaceDisplayName(workspace),
      conversations: sortedConvs,
    });
  });

  const withoutWorkspaceByTimeline = new Map<string, Conversation[]>();

  withoutWorkspaceConvs.forEach((conv) => {
    const timeline = getConversationTimelineLabel(conv, t);
    if (!withoutWorkspaceByTimeline.has(timeline)) {
      withoutWorkspaceByTimeline.set(timeline, []);
    }
    withoutWorkspaceByTimeline.get(timeline)!.push(conv);
  });

  const timelineOrder = ['workspace.today', 'workspace.yesterday', 'workspace.recent7Days', 'workspace.earlier'];
  const sections: TimelineSection[] = [];

  timelineOrder.forEach((timelineKey) => {
    const timeline = t(timelineKey);
    const withWorkspace = workspaceGroupsByTimeline.get(timeline) || [];
    const withoutWorkspace = withoutWorkspaceByTimeline.get(timeline) || [];

    if (withWorkspace.length === 0 && withoutWorkspace.length === 0) return;

    const items: TimelineItem[] = [];

    withWorkspace.forEach((group) => {
      items.push({
        type: 'workspace',
        time: getActivityTime(group.conversations[0]),
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

    sections.push({ timeline, items });
  });

  return sections;
};

export const buildGroupedHistory = (
  conversations: Conversation[],
  t: (key: string) => string
): GroupedHistoryResult => {
  const pinnedConversations = conversations
    .filter((conversation) => isConversationPinned(conversation))
    .sort((a, b) => getConversationPinnedAt(b) - getConversationPinnedAt(a));

  const normalConversations = conversations.filter((conversation) => !isConversationPinned(conversation));

  return {
    pinnedConversations,
    timelineSections: groupConversationsByTimelineAndWorkspace(normalConversations, t),
  };
};
