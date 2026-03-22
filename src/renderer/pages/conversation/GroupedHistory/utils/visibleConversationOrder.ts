import type { GroupedHistoryResult } from '../types';

type VisibleConversationOrderInput = GroupedHistoryResult & {
  expandedWorkspaces: string[];
  siderCollapsed: boolean;
};

export const buildVisibleConversationIds = ({
  pinnedConversations,
  timelineSections,
  expandedWorkspaces,
  siderCollapsed,
}: VisibleConversationOrderInput): string[] => {
  const expandedWorkspaceSet = new Set(expandedWorkspaces);
  const visibleConversationIds: string[] = [];

  pinnedConversations.forEach((conversation) => {
    visibleConversationIds.push(conversation.id);
  });

  timelineSections.forEach((section) => {
    section.items.forEach((item) => {
      if (item.type === 'conversation' && item.conversation) {
        visibleConversationIds.push(item.conversation.id);
        return;
      }

      if (item.type === 'workspace' && item.workspaceGroup) {
        if (!siderCollapsed && !expandedWorkspaceSet.has(item.workspaceGroup.workspace)) {
          return;
        }

        item.workspaceGroup.conversations.forEach((conversation) => {
          visibleConversationIds.push(conversation.id);
        });
      }
    });
  });

  return visibleConversationIds;
};
