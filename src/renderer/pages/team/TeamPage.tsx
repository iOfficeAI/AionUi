import { Message, Spin } from '@arco-design/web-react';
import React, { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';
import { ipcBridge } from '@/common';
import type { TeamAgent, TTeam } from '@/common/types/teamTypes';
import type { TChatConversation } from '@/common/config/storage';
import ChatLayout from '@/renderer/pages/conversation/components/ChatLayout';
import ChatSider from '@/renderer/pages/conversation/components/ChatSider';
import TeamConfirmOverlay from './components/TeamConfirmOverlay';
import { useConversationAgents } from '@/renderer/pages/conversation/hooks/useConversationAgents';
import AcpModelSelector from '@/renderer/components/agent/AcpModelSelector';
import TeamTabs from './components/TeamTabs';
import TeamChatView from './components/TeamChatView';
import { agentFromKey, resolveConversationType } from './components/agentSelectUtils';
import { TeamTabsProvider, useTeamTabs } from './hooks/TeamTabsContext';
import { TeamPermissionProvider } from './hooks/TeamPermissionContext';
import { useTeamSession } from './hooks/useTeamSession';
import { getAgentLogo } from '@/renderer/utils/model/agentLogo';

type Props = {
  team: TTeam;
};

type TeamPageContentProps = {
  team: TTeam;
  onAddAgent: (data: { agentName: string; agentKey: string }) => void;
};

/** Fetches conversation for a single agent and renders TeamChatView */
const AgentChatSlot: React.FC<{
  agent: TeamAgent;
  teamId: string;
  isLead: boolean;
}> = ({ agent, teamId, isLead }) => {
  const { data: conversation } = useSWR(agent.conversationId ? ['team-conversation', agent.conversationId] : null, () =>
    ipcBridge.conversation.get.invoke({ id: agent.conversationId })
  );
  const logo = getAgentLogo(agent.agentType);

  return (
    <div className='flex flex-col h-full'>
      <div className='flex items-center gap-8px px-12px h-32px shrink-0 border-b border-solid border-[color:var(--border-base)] bg-2'>
        {logo && <img src={logo} alt={agent.agentType} className='w-14px h-14px object-contain rounded-2px opacity-80' />}
        <span className='text-13px text-[color:var(--color-text-2)] font-medium truncate'>{agent.agentName}</span>
        {isLead && <span className='text-11px text-[color:var(--color-text-4)] shrink-0'>lead</span>}
      </div>
      <div className='flex flex-col flex-1 min-h-0'>
        {conversation ? (
          <TeamChatView
            conversation={conversation as TChatConversation}
            teamId={teamId}
            agentSlotId={isLead ? undefined : agent.slotId}
          />
        ) : (
          <div className='flex flex-1 items-center justify-center'>
            <Spin loading />
          </div>
        )}
      </div>
    </div>
  );
};

/** Inner component that reads active tab from context and renders the chat layout */
const TeamPageContent: React.FC<TeamPageContentProps> = ({ team, onAddAgent }) => {
  const { t } = useTranslation();
  const { activeSlotId, switchTab } = useTeamTabs();
  const [, messageContext] = Message.useMessage({ maxCount: 1 });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const agentRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const activeAgent = team.agents.find((a) => a.slotId === activeSlotId);
  const leadAgent = team.agents.find((a) => a.role === 'lead');
  const leadConversationId = leadAgent?.conversationId ?? '';
  // isLeadAgent is false at the global level; each slot checks against leadConversationId
  const isLeadAgent = false;
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

  const handleTabClick = useCallback(
    (slotId: string) => {
      switchTab(slotId);
      const el = agentRefs.current[slotId];
      if (el && scrollContainerRef.current) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
      }
    },
    [switchTab]
  );

  const tabsSlot = useMemo(() => <TeamTabs onAddAgent={onAddAgent} onTabClick={handleTabClick} />, [onAddAgent, handleTabClick]);

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
    <TeamPermissionProvider isLeadAgent={isLeadAgent} leadConversationId={leadConversationId} allConversationIds={allConversationIds}>
      {messageContext}
      {leadConversationId && (
        <TeamConfirmOverlay allConversationIds={allConversationIds} />
      )}
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
        <div
          ref={scrollContainerRef}
          className='flex h-full overflow-x-auto overflow-y-hidden [scrollbar-width:none]'
          style={{ scrollSnapType: 'x mandatory' }}
        >
          {team.agents.map((agent) => {
            const isSingle = team.agents.length <= 2;
            return (
              <div
                key={agent.slotId}
                ref={(el) => { agentRefs.current[agent.slotId] = el; }}
                className='shrink-0 h-full border-r border-solid border-[color:var(--border-base)]'
                style={{
                  width: isSingle ? undefined : '400px',
                  flex: isSingle ? 1 : undefined,
                  minWidth: isSingle ? '240px' : '400px',
                  scrollSnapAlign: 'start',
                }}
              >
                <AgentChatSlot
                  agent={agent}
                  teamId={team.id}
                  isLead={agent.slotId === leadAgent?.slotId}
                />
              </div>
            );
          })}
        </div>
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
