import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useConversations } from './ConversationContext';
import { getWorkspaceDisplayName } from '../utils/workspace';

type WorkspaceContextType = {
  currentWorkspace: string | null;
  workspaceDisplayName: string;
  /** True on the render where workspace changed from a different non-null value */
  workspaceChanged: boolean;
};

const WorkspaceContext = createContext<WorkspaceContextType>({
  currentWorkspace: null,
  workspaceDisplayName: '',
  workspaceChanged: false,
});

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { conversations, activeConversationId } = useConversations();
  const previousWorkspaceRef = useRef<string | null>(null);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId),
    [conversations, activeConversationId]
  );

  const currentWorkspace = activeConversation?.extra?.workspace ?? null;
  const workspaceDisplayName = currentWorkspace ? getWorkspaceDisplayName(currentWorkspace, t) : '';

  const workspaceChanged =
    previousWorkspaceRef.current !== null &&
    currentWorkspace !== null &&
    previousWorkspaceRef.current !== currentWorkspace;

  useEffect(() => {
    previousWorkspaceRef.current = currentWorkspace;
  }, [currentWorkspace]);

  const value = useMemo(
    () => ({ currentWorkspace, workspaceDisplayName, workspaceChanged }),
    [currentWorkspace, workspaceDisplayName, workspaceChanged]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
