import { Message, Spin } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import { ipcBridge } from '@/common';
import type { TTeam } from '@/common/types/teamTypes';
import ChatLayout from '@/renderer/pages/conversation/components/ChatLayout';
import ChatSider from '@/renderer/pages/conversation/components/ChatSider';
import { useConversationAgents } from '@/renderer/pages/conversation/hooks/useConversationAgents';
import TeamTabs from './components/TeamTabs';
import TeamChatView from './components/TeamChatView';
import { agentFromKey, agentKey, resolveConversationType } from './components/agentSelectUtils';
import { TeamTabsProvider, useTeamTabs } from './hooks/TeamTabsContext';
import { TeamPermissionProvider } from './hooks/TeamPermissionContext';
import { useTeamSession } from './hooks/useTeamSession';

type Props = {
  team: TTeam;
};

type TeamPageContentProps = {
  team: TTeam;
  onAddAgent: (data: { agentName: string; agentKey: string }) => void;
};

/** Inner component that reads active tab from context and renders the chat layout */
const TeamPageContent: React.FC<TeamPageContentProps> = ({ team, onAddAgent }) => {
  const { t } = useTranslation();
  const { activeSlotId } = useTeamTabs();
  const [, messageContext] = Message.useMessage({ maxCount: 1 });

  const activeAgent = team.agents.find((a) => a.slotId === activeSlotId);
  const leadAgent = team.agents.find((a) => a.role === 'lead');
  const isLeadAgent = activeAgent?.slotId === leadAgent?.slotId;
  const allConversationIds = useMemo(() => team.agents.map((a) => a.conversationId).filter(Boolean), [team.agents]);

  // Fetch both conversations in parallel via SWR (independent keys fire concurrently)
  const { data: activeConversation, mutate: mutateActiveConversation } = useSWR(
    activeAgent?.conversationId ? ['team-conversation', activeAgent.conversationId] : null,
    () => ipcBridge.conversation.get.invoke({ id: activeAgent!.conversationId })
  );

  const { data: dispatchConversation } = useSWR(
    leadAgent?.conversationId ? ['team-conversation', leadAgent.conversationId] : null,
    () => ipcBridge.conversation.get.invoke({ id: leadAgent!.conversationId })
  );

  // Refresh active conversation when new messages arrive for this agent
  useEffect(() => {
    let debounceTimer: NodeJS.Timeout | null = null;
    const unsubMessages = ipcBridge.team.messageStream.on(
      (event: import('@/common/types/teamTypes').ITeamMessageEvent) => {
        if (event.teamId !== team.id || event.slotId !== activeSlotId) return;
        // Debounce by waiting a bit before refetching, to batch multiple messages
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          mutateActiveConversation();
        }, 500);
      }
    );
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubMessages();
    };
  }, [team.id, activeSlotId, mutateActiveConversation]);

  const workspaceEnabled = Boolean(team.workspace);

  const siderTitle = useMemo(
    () => (
      <div className='flex items-center justify-between'>
        <span className='text-16px font-bold text-t-primary'>{t('conversation.workspace.title')}</span>
      </div>
    ),
    [t]
  );

  const sider = useMemo(() => {
    if (!workspaceEnabled || !dispatchConversation) return <div />;
    return <ChatSider conversation={dispatchConversation} />;
  }, [workspaceEnabled, dispatchConversation]);

  const tabsSlot = useMemo(() => <TeamTabs onAddAgent={onAddAgent} />, [onAddAgent]);

  return (
    <TeamPermissionProvider isLeadAgent={isLeadAgent} allConversationIds={allConversationIds}>
      {messageContext}
      <ChatLayout
        title={team.name}
        siderTitle={siderTitle}
        sider={sider}
        workspaceEnabled={workspaceEnabled}
        tabsSlot={tabsSlot}
        conversationId={activeAgent?.conversationId}
        backend={activeAgent?.agentType}
        agentName={activeAgent?.agentName}
      >
        {activeConversation ? (
          <TeamChatView conversation={activeConversation} teamId={isLeadAgent ? team.id : undefined} />
        ) : (
          <div className='flex flex-1 items-center justify-center'>
            <Spin loading />
          </div>
        )}
      </ChatLayout>
    </TeamPermissionProvider>
  );
};

const TeamPage: React.FC<Props> = ({ team }) => {
  const { statusMap, addAgent } = useTeamSession(team);
  const { cliAgents, presetAssistants } = useConversationAgents();
  const defaultSlotId = team.agents[0]?.slotId ?? '';

  const handleAddAgent = useCallback(
    async (data: { agentName: string; agentKey: string }) => {
      const allAgents = [...cliAgents, ...presetAssistants];
      const agent = agentFromKey(data.agentKey, allAgents);
      const backend = agent?.backend ?? 'claude';
      await addAgent({
        conversationId: '',
        role: 'teammate',
        agentType: backend,
        agentName: data.agentName,
        status: 'pending',
        conversationType: resolveConversationType(backend),
        cliPath: agent?.cliPath,
      });
    },
    [addAgent, cliAgents, presetAssistants]
  );

  return (
    <TeamTabsProvider agents={team.agents} statusMap={statusMap} defaultActiveSlotId={defaultSlotId}>
      <TeamPageContent team={team} onAddAgent={handleAddAgent} />
    </TeamTabsProvider>
  );
};

export default TeamPage;
