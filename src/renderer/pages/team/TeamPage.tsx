import { Message } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import { ipcBridge } from '@/common';
import type { TTeam } from '@/common/types/teamTypes';
import type { AvailableAgent } from '@/renderer/utils/model/agentTypes';
import ChatLayout from '@/renderer/pages/conversation/components/ChatLayout';
import ChatSider from '@/renderer/pages/conversation/components/ChatSider';
import TeamTabs from './components/TeamTabs';
import TeamChatView from './components/TeamChatView';
import { TeamTabsProvider, useTeamTabs } from './hooks/TeamTabsContext';
import { useTeamSession } from './hooks/useTeamSession';

type Props = {
  team: TTeam;
};

type TeamPageContentProps = {
  team: TTeam;
  onAddAgent: (agent: AvailableAgent) => void;
};

/** Inner component that reads active tab from context and renders the chat layout */
const TeamPageContent: React.FC<TeamPageContentProps> = ({ team, onAddAgent }) => {
  const { t } = useTranslation();
  const { activeSlotId } = useTeamTabs();
  const [, messageContext] = Message.useMessage({ maxCount: 1 });

  const activeAgent = team.agents.find((a) => a.slotId === activeSlotId);
  const isSubAgent = activeAgent?.role === 'teammate';

  const leadAgent = team.agents.find((a) => a.role === 'lead');

  // Fetch both conversations in parallel via SWR (independent keys fire concurrently)
  const { data: activeConversation, mutate: mutateActiveConversation } = useSWR(
    activeAgent?.conversationId ? ['team-conversation', activeAgent.conversationId] : null,
    () => ipcBridge.conversation.get.invoke({ id: activeAgent!.conversationId })
  );

  const { data: dispatchConversation } = useSWR(
    leadAgent?.conversationId ? ['team-conversation', leadAgent.conversationId] : null,
    () => ipcBridge.conversation.get.invoke({ id: leadAgent!.conversationId })
  );

  // Pre-warm the active agent's worker so it's ready when the user sends a message.
  // Team sub-agents have hideSendBox=true, so the sendbox warmup never fires for them.
  useEffect(() => {
    if (!activeAgent?.conversationId) return;
    ipcBridge.conversation.warmup.invoke({ conversation_id: activeAgent.conversationId }).catch(() => {});
  }, [activeAgent?.conversationId]);

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
    <>
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
          <TeamChatView conversation={activeConversation} hideSendBox={isSubAgent} />
        ) : (
          <div className='flex flex-1 items-center justify-center text-[color:var(--color-text-3)] text-sm'>
            {t('team.agentNotConfigured')}
          </div>
        )}
      </ChatLayout>
    </>
  );
};

const TeamPage: React.FC<Props> = ({ team }) => {
  const { statusMap, addAgent } = useTeamSession(team);
  const defaultSlotId = team.agents[0]?.slotId ?? '';

  const handleAddAgent = useCallback(
    async (agent: AvailableAgent) => {
      await addAgent({
        conversationId: '',
        role: 'teammate',
        agentType: agent.backend ?? 'acp',
        agentName: agent.name,
        status: 'pending',
        conversationType: 'chat',
      });
    },
    [addAgent]
  );

  return (
    <TeamTabsProvider agents={team.agents} statusMap={statusMap} defaultActiveSlotId={defaultSlotId}>
      <TeamPageContent team={team} onAddAgent={handleAddAgent} />
    </TeamTabsProvider>
  );
};

export default TeamPage;
