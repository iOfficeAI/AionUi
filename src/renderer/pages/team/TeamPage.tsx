import { Message, Spin } from '@arco-design/web-react';
import { FullScreen, Left, OffScreen, Peoples, Right } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const [isFullscreen, setIsFullscreen] = useState(false);

  const initialModelId = (conversation?.extra as { currentModelId?: string })?.currentModelId;
  const showModelSelector =
    agent.conversationId && (agent.conversationType === 'acp' || agent.conversationType === 'codex');

  return (
    <div
      className={`transition-all duration-300 ease-in-out ${isFullscreen ? 'absolute inset-0 z-50 flex flex-col' : 'flex flex-col h-full'}`}
      style={
        isLead
          ? {
              borderLeft: '3px solid var(--color-primary-6)',
              background: 'color-mix(in srgb, var(--color-primary-6) 3%, var(--color-bg-1))',
            }
          : { background: 'var(--color-bg-1)' }
      }
    >
      <div
        className='flex items-center justify-between gap-8px px-12px h-40px shrink-0 border-b border-solid border-[color:var(--border-base)] relative z-10'
        style={
          isLead
            ? { background: 'color-mix(in srgb, var(--color-primary-6) 8%, var(--color-bg-2))' }
            : { background: 'var(--color-bg-2)' }
        }
      >
        <div className='flex items-center gap-8px min-w-0'>
          {logo && (
            <img src={logo} alt={agent.agentType} className='w-16px h-16px object-contain rounded-2px opacity-80' />
          )}
          <span className='text-13px text-[color:var(--color-text-2)] font-medium truncate'>{agent.agentName}</span>
          {isLead && (
            <span className='text-10px px-4px py-1px rd-4px bg-[var(--color-primary-1)] text-[var(--color-primary-6)] shrink-0'>
              Lead
            </span>
          )}
        </div>
        <div className='flex items-center gap-8px shrink-0'>
          {showModelSelector && (
            <div className='max-w-100px overflow-hidden'>
              <AcpModelSelector
                key={agent.conversationId}
                conversationId={agent.conversationId}
                backend={agent.agentType}
                initialModelId={initialModelId}
              />
            </div>
          )}
          <div
            className='cursor-pointer hover:bg-[var(--fill-3)] p-4px rd-4px text-[color:var(--color-text-3)] hover:text-[color:var(--color-text-1)] transition-colors'
            onClick={() => setIsFullscreen(!isFullscreen)}
          >
            {isFullscreen ? <OffScreen size='16' fill='currentColor' /> : <FullScreen size='16' fill='currentColor' />}
          </div>
        </div>
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
  const { agents, activeSlotId, switchTab } = useTeamTabs();
  const [, messageContext] = Message.useMessage({ maxCount: 1 });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const agentRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);

  const activeAgent = agents.find((a) => a.slotId === activeSlotId);
  const leadAgent = agents.find((a) => a.role === 'lead');
  const leadConversationId = leadAgent?.conversationId ?? '';
  // isLeadAgent is false at the global level; each slot checks against leadConversationId
  const isLeadAgent = false;
  const allConversationIds = useMemo(() => agents.map((a) => a.conversationId).filter(Boolean), [agents]);

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

  const updateScrollArrows = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const hasOverflow = container.scrollWidth > container.clientWidth + 1;
    setShowLeftArrow(hasOverflow && container.scrollLeft > 10);
    setShowRightArrow(hasOverflow && container.scrollLeft + container.clientWidth < container.scrollWidth - 10);
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.addEventListener('scroll', updateScrollArrows, { passive: true });
    window.addEventListener('resize', updateScrollArrows);
    const observer = new ResizeObserver(updateScrollArrows);
    observer.observe(container);
    updateScrollArrows();
    return () => {
      container.removeEventListener('scroll', updateScrollArrows);
      window.removeEventListener('resize', updateScrollArrows);
      observer.disconnect();
    };
  }, [updateScrollArrows]);

  const handleTabClick = useCallback(
    (slotId: string) => {
      switchTab(slotId);
      // Delay scroll until width transition completes (300ms)
      setTimeout(() => {
        const el = agentRefs.current[slotId];
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
          // Flash: opacity 1→0→1
          setTimeout(() => {
            el.style.transition = 'opacity 150ms ease-out';
            el.style.opacity = '0';
            setTimeout(() => {
              el.style.transition = 'opacity 150ms ease-in';
              el.style.opacity = '1';
              setTimeout(() => {
                el.style.transition = '';
              }, 200);
            }, 150);
          }, 400);
        }
      }, 320);
    },
    [switchTab]
  );

  const scrollToPrev = useCallback(() => {
    const idx = agents.findIndex((a) => a.slotId === activeSlotId);
    const target = idx > 0 ? idx - 1 : 0;
    if (agents[target]) handleTabClick(agents[target].slotId);
  }, [agents, activeSlotId, handleTabClick]);

  const scrollToNext = useCallback(() => {
    const idx = agents.findIndex((a) => a.slotId === activeSlotId);
    const target = idx >= 0 && idx < agents.length - 1 ? idx + 1 : 0;
    if (agents[target]) handleTabClick(agents[target].slotId);
  }, [agents, activeSlotId, handleTabClick]);

  // Every time the page mounts, scroll + flash the active tab
  useEffect(() => {
    if (activeSlotId && agents.length > 0) {
      const timer = setTimeout(() => {
        const el = agentRefs.current[activeSlotId];
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
          setTimeout(() => {
            el.style.transition = 'opacity 150ms ease-out';
            el.style.opacity = '0';
            setTimeout(() => {
              el.style.transition = 'opacity 150ms ease-in';
              el.style.opacity = '1';
              setTimeout(() => {
                el.style.transition = '';
              }, 200);
            }, 150);
          }, 400);
        }
      }, 320);
      return () => clearTimeout(timer);
    }
  }, []); // empty deps = only on mount

  const tabsSlot = useMemo(
    () => <TeamTabs onAddAgent={onAddAgent} onTabClick={handleTabClick} />,
    [onAddAgent, handleTabClick]
  );

  const headerTitle = useMemo(
    () => (
      <div className='flex items-center gap-8px'>
        <Peoples theme='outline' size='18' fill='currentColor' />
        <span>{team.name}</span>
      </div>
    ),
    [team.name]
  );

  return (
    <TeamPermissionProvider
      isLeadAgent={isLeadAgent}
      leadConversationId={leadConversationId}
      allConversationIds={allConversationIds}
    >
      {messageContext}
      {leadConversationId && <TeamConfirmOverlay allConversationIds={allConversationIds} />}
      <ChatLayout
        title={headerTitle}
        siderTitle={siderTitle}
        sider={sider}
        workspaceEnabled={workspaceEnabled}
        tabsSlot={tabsSlot}
        conversationId={activeAgent?.conversationId}
        agentName={undefined}
      >
        <div className='relative flex h-full'>
          {showLeftArrow && (
            <div
              className='absolute left-0 top-0 bottom-0 w-48px z-20 flex items-center justify-center cursor-pointer opacity-80 hover:opacity-100 transition-opacity'
              style={{ background: 'linear-gradient(90deg, var(--color-bg-1) 40%, transparent)' }}
              onClick={scrollToPrev}
            >
              <div
                className='w-32px h-32px rd-full flex items-center justify-center'
                style={{ background: 'rgba(0,0,0,0.5)', lineHeight: 0 }}
              >
                <Left size='24' fill='#fff' />
              </div>
            </div>
          )}
          <div
            ref={scrollContainerRef}
            className='flex h-full w-full overflow-x-auto overflow-y-hidden [scrollbar-width:none]'
            style={{ scrollSnapType: 'x proximity' }}
          >
            {agents.map((agent) => {
              const isSingle = agents.length <= 2;
              const isActive = agent.slotId === activeSlotId;
              const isLeadSlot = agent.slotId === leadAgent?.slotId;
              return (
                <div
                  key={agent.slotId}
                  ref={(el) => {
                    agentRefs.current[agent.slotId] = el;
                  }}
                  className='relative shrink-0 h-full border-r border-solid border-[color:var(--border-base)]'
                  style={{
                    width: isSingle ? undefined : isActive ? '500px' : '360px',
                    flex: isSingle ? 1 : undefined,
                    minWidth: isSingle ? '240px' : isActive ? '500px' : '360px',
                    transition: 'width 300ms ease-in-out, min-width 300ms ease-in-out',
                    scrollSnapAlign: 'start',
                  }}
                >
                  <AgentChatSlot agent={agent} teamId={team.id} isLead={isLeadSlot} />
                </div>
              );
            })}
          </div>
          {showRightArrow && (
            <div
              className='absolute right-0 top-0 bottom-0 w-48px z-20 flex items-center justify-center cursor-pointer opacity-80 hover:opacity-100 transition-opacity'
              style={{ background: 'linear-gradient(270deg, var(--color-bg-1) 40%, transparent)' }}
              onClick={scrollToNext}
            >
              <div
                className='w-32px h-32px rd-full flex items-center justify-center'
                style={{ background: 'rgba(0,0,0,0.5)', lineHeight: 0 }}
              >
                <Right size='24' fill='#fff' />
              </div>
            </div>
          )}
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
      teamId={team.id}
      renameAgent={renameAgent}
    >
      <TeamPageContent team={team} onAddAgent={handleAddAgent} />
    </TeamTabsProvider>
  );
};

export default TeamPage;
