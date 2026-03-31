import { Message } from '@arco-design/web-react';
import React, { useCallback, useMemo } from 'react';
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

  // Fetch the conversation for the active agent
  const { data: activeConversation } = useSWR(
    activeAgent?.conversationId ? ['team-conversation', activeAgent.conversationId] : null,
    () => ipcBridge.conversation.get.invoke({ id: activeAgent!.conversationId })
  );

  // Fetch the lead agent's conversation to use as workspace sider
  const leadAgent = team.agents.find((a) => a.role === 'lead');
  const { data: dispatchConversation } = useSWR(
    leadAgent?.conversationId ? ['team-conversation', leadAgent.conversationId] : null,
    () => ipcBridge.conversation.get.invoke({ id: leadAgent!.conversationId })
  );

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
