import { Message, Spin } from '@arco-design/web-react';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import { ipcBridge } from '@/common';
import type { TeamAgent, TTeam } from '@/common/types/teamTypes';
import type { TChatConversation } from '@/common/config/storage';
import ChatLayout from '@/renderer/pages/conversation/components/ChatLayout';
import ChatSider from '@/renderer/pages/conversation/components/ChatSider';
import { useConversationAgents } from '@/renderer/pages/conversation/hooks/useConversationAgents';
import AcpModelSelector from '@/renderer/components/agent/AcpModelSelector';
import TeamTabs from './components/TeamTabs';
import TeamChatView from './components/TeamChatView';
import { agentFromKey, resolveConversationType } from './components/agentSelectUtils';
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

/** Fetches conversation for a single agent and renders TeamChatView, kept alive via display toggle */
const AgentChatSlot: React.FC<{
  agent: TeamAgent;
  teamId: string;
  isActive: boolean;
  isLead: boolean;
}> = ({ agent, teamId, isActive, isLead }) => {
  const { data: conversation } = useSWR(agent.conversationId ? ['team-conversation', agent.conversationId] : null, () =>
    ipcBridge.conversation.get.invoke({ id: agent.conversationId })
  );

  return (
    <div style={{ display: isActive ? 'flex' : 'none' }} className='flex-1 flex flex-col min-h-0'>
      {conversation ? (
        <TeamChatView conversation={conversation as TChatConversation} teamId={isLead ? teamId : undefined} />
      ) : (
        <div className='flex flex-1 items-center justify-center'>
          <Spin loading />
        </div>
      )}
    </div>
  );
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

  // Fetch active agent's conversation to read initialModelId for the header
  const { data: activeConversation } = useSWR(
    activeAgent?.conversationId ? ['team-conversation', activeAgent.conversationId] : null,
    () => ipcBridge.conversation.get.invoke({ id: activeAgent!.conversationId })
  );

  // Fetch lead agent's conversation for the workspace sider
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

  const initialModelId = (activeConversation?.extra as { currentModelId?: string })?.currentModelId;

  const headerExtra = useMemo(() => {
    if (!activeAgent?.conversationId) return undefined;
    if (activeAgent.conversationType === 'acp' || activeAgent.conversationType === 'codex') {
      return (
        <AcpModelSelector
          key={activeAgent.conversationId}
          conversationId={activeAgent.conversationId}
          backend={activeAgent.agentType}
          initialModelId={initialModelId}
        />
      );
    }
    return undefined;
  }, [activeAgent?.conversationId, activeAgent?.conversationType, activeAgent?.agentType, initialModelId]);

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
        headerExtra={headerExtra}
      >
        {team.agents.map((agent) => (
          <AgentChatSlot
            key={agent.slotId}
            agent={agent}
            teamId={team.id}
            isActive={agent.slotId === activeSlotId}
            isLead={agent.slotId === leadAgent?.slotId}
          />
        ))}
      </ChatLayout>
    </TeamPermissionProvider>
  );
};

const TeamPage: React.FC<Props> = ({ team }) => {
  const { statusMap, addAgent, renameAgent } = useTeamSession(team);
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
    <TeamTabsProvider
      agents={team.agents}
      statusMap={statusMap}
      defaultActiveSlotId={defaultSlotId}
      renameAgent={renameAgent}
    >
      <TeamPageContent team={team} onAddAgent={handleAddAgent} />
    </TeamTabsProvider>
  );
};

export default TeamPage;
