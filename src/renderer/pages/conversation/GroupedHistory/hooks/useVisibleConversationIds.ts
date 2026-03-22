import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { buildGroupedHistory } from '../utils/groupingHelpers';
import { buildVisibleConversationIds } from '../utils/visibleConversationOrder';
import { useConversationListSync } from './useConversationListSync';
import { useWorkspaceExpansionState } from './useWorkspaceExpansionState';

export const useVisibleConversationIds = (): string[] => {
  const layout = useLayoutContext();
  const siderCollapsed = layout?.siderCollapsed ?? false;
  const { t } = useTranslation();
  const { conversations } = useConversationListSync();
  const expandedWorkspaces = useWorkspaceExpansionState();

  const groupedHistory = useMemo(() => {
    return buildGroupedHistory(conversations, t);
  }, [conversations, t]);

  return useMemo(() => {
    return buildVisibleConversationIds({
      ...groupedHistory,
      expandedWorkspaces,
      siderCollapsed,
    });
  }, [groupedHistory, expandedWorkspaces, siderCollapsed]);
};
