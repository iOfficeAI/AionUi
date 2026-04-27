import { Message, Modal, Spin } from '@arco-design/web-react';
import { CloseSmall, FullScreen, Left, OffScreen, Right } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR, { useSWRConfig } from 'swr';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import { ipcBridge } from '@/common';
import type { TeamAgent, TTeam } from '@/common/types/teamTypes';
import type { IProvider, TChatConversation, TProviderWithModel } from '@/common/config/storage';
import ChatLayout from '@/renderer/pages/conversation/components/ChatLayout';
import ChatSider from '@/renderer/pages/conversation/components/ChatSider';
import { useTeamPendingPermissions } from './hooks/useTeamPendingPermissions';
import AcpModelSelector from '@/renderer/components/agent/AcpModelSelector';
import AionrsModelSelector from '@/renderer/pages/conversation/platforms/aionrs/AionrsModelSelector';
import { useAionrsModelSelection } from '@/renderer/pages/conversation/platforms/aionrs/useAionrsModelSelection';
import TeamTabs from './components/TeamTabs';
import TeamChatView from './components/TeamChatView';
import TeamAgentIdentity from './components/TeamAgentIdentity';
import { TeamTabsProvider, useTeamTabs } from './hooks/TeamTabsContext';
import { TeamPermissionProvider } from './hooks/TeamPermissionContext';
import { useTeamSession } from './hooks/useTeamSession';
import { dispatchWorkspaceHasFilesEvent } from '@/renderer/utils/workspace/workspaceEvents';

type Props = {
  team: TTeam;
};

type TeamPageContentProps = {
  team: TTeam;
  onRenameTeam: (new_name: string) => Promise<boolean>;
};

/** Compact aionrs model selector for the agent header */
const AionrsHeaderModelSelector: React.FC<{ conversation_id: string; initialModel?: TProviderWithModel }> = ({
  conversation_id,
  initialModel,
}) => {
  const onSelectModel = useCallback(
    async (_provider: IProvider, modelName: string) => {
      const selected = { ..._provider, useModel: modelName } as TProviderWithModel;
      const ok = await ipcBridge.conversation.update.invoke({ id: conversation_id, updates: { model: selected } });
      return Boolean(ok);
    },
    [conversation_id]
  );
  const modelSelection = useAionrsModelSelection({ initialModel, onSelectModel });
  return <AionrsModelSelector selection={modelSelection} />;
};

/** Fetches conversation for a single agent and renders TeamChatView */
const AgentChatSlot: React.FC<{
  agent: TeamAgent;
  team_id: string;
  isLeader: boolean;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onRemove?: () => void;
}> = ({ agent, team_id, isLeader, isFullscreen = false, onToggleFullscreen, onRemove }) => {
  const { data: conversation } = useSWR(
    agent.conversation_id ? ['team-conversation', agent.conversation_id] : null,
    () => ipcBridge.conversation.get.invoke({ id: agent.conversation_id })
  );

  const isAionrs = conversation?.type === 'aionrs';
  const initialModelId = (conversation?.extra as { current_model_id?: string })?.current_model_id;
  const isAcpLike = agent.conversation_type === 'acp' || agent.conversation_type === 'codex';

  return (
    <div
      className='flex flex-col h-full'
      style={
        isLeader
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
          isLeader
            ? { background: 'color-mix(in srgb, var(--color-primary-6) 8%, var(--color-bg-2))' }
            : { background: 'var(--color-bg-2)' }
        }
      >
        <TeamAgentIdentity
          agent_name={agent.agent_name}
          agent_type={agent.agent_type}
          conversation_id={agent.conversation_id}
          isLeader={isLeader}
          className='min-w-0'
          nameClassName='text-13px text-[color:var(--color-text-2)] font-medium'
        />
        <div className='flex items-center gap-8px shrink-0'>
          {agent.conversation_id && !isAionrs && isAcpLike && (
            <div className='min-w-0 max-w-140px [&_button]:max-w-full [&_button_span]:truncate'>
              <AcpModelSelector
                key={agent.conversation_id}
                conversation_id={agent.conversation_id}
                backend={agent.agent_type}
                initialModelId={initialModelId}
              />
            </div>
          )}
          {isAionrs && agent.conversation_id && (
            <div className='min-w-0 max-w-140px [&_button]:max-w-full [&_button_span]:truncate'>
              <AionrsHeaderModelSelector
                key={agent.conversation_id}
                conversation_id={agent.conversation_id}
                initialModel={conversation?.model as TProviderWithModel | undefined}
              />
            </div>
          )}
          {!isLeader && onRemove && (
            <div
              className='shrink-0 cursor-pointer hover:bg-[var(--fill-3)] p-4px rd-4px text-[color:var(--color-text-3)] hover:text-[color:var(--color-danger-6)] transition-colors'
              onClick={onRemove}
            >
              <CloseSmall size='16' fill='currentColor' />
            </div>
          )}
          <div
            className='shrink-0 cursor-pointer hover:bg-[var(--fill-3)] p-4px rd-4px text-[color:var(--color-text-3)] hover:text-[color:var(--color-text-1)] transition-colors'
            onClick={() => onToggleFullscreen?.()}
          >
            {isFullscreen ? <OffScreen size='16' fill='currentColor' /> : <FullScreen size='16' fill='currentColor' />}
          </div>
        </div>
      </div>
      <div className='relative flex flex-col flex-1 min-h-0'>
        {conversation ? (
          <TeamChatView
            conversation={conversation as TChatConversation}
            team_id={team_id}
            agentSlotId={isLeader ? undefined : agent.slot_id}
            agent_name={agent.agent_name}
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
const TeamPageContent: React.FC<TeamPageContentProps> = ({ team, onRenameTeam }) => {
  const { t } = useTranslation();
  const { agents, activeSlotId, statusMap, switchTab } = useTeamTabs();
  const [, messageContext] = Message.useMessage({ maxCount: 1 });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const agentRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const [fullscreenSlotId, setFullscreenSlotId] = useState<string | null>(null);

  const activeAgent = agents.find((a) => a.slot_id === activeSlotId);
  const leadAgent = agents.find((a) => a.role === 'leader');

  const doRemoveAgent = useCallback(
    async (slot_id: string) => {
      try {
        await ipcBridge.team.removeAgent.invoke({ team_id: team.id, slot_id });
        Message.success(t('common.deleteSuccess'));
        // Only switch tab when removing the currently active tab
        if (slot_id === activeSlotId && leadAgent?.slot_id) switchTab(leadAgent.slot_id);
        if (fullscreenSlotId === slot_id) setFullscreenSlotId(null);
      } catch (error) {
        console.error('Failed to remove agent:', error);
        Message.error(String(error));
      }
    },
    [team.id, activeSlotId, leadAgent?.slot_id, switchTab, fullscreenSlotId, t]
  );

  const handleRemoveAgent = useCallback(
    (slot_id: string) => {
      const status = statusMap.get(slot_id)?.status;
      if (status === 'active') {
        Modal.confirm({
          title: t('team.removeAgent.confirmTitle'),
          content: t('team.removeAgent.confirmContent'),
          onOk: () => doRemoveAgent(slot_id),
        });
      } else {
        void doRemoveAgent(slot_id);
      }
    },
    [statusMap, doRemoveAgent, t]
  );
  const leaderConversationId = leadAgent?.conversation_id ?? '';
  const isLeaderAgent = activeAgent?.role === 'leader';
  const allConversationIds = useMemo(() => agents.map((a) => a.conversation_id).filter(Boolean), [agents]);

  // Fetch leader agent's conversation for the workspace sider
  const { data: dispatchConversation } = useSWR(
    leadAgent?.conversation_id ? ['team-conversation', leadAgent.conversation_id] : null,
    () => ipcBridge.conversation.get.invoke({ id: leadAgent!.conversation_id })
  );

  // Use team workspace if specified, otherwise fall back to leader agent's conversation workspace (temp workspace)
  const effectiveWorkspace = team.workspace || (dispatchConversation?.extra as { workspace?: string })?.workspace || '';
  const workspaceEnabled = Boolean(effectiveWorkspace);

  // Auto-expand workspace panel on mount when workspace is available
  useEffect(() => {
    if (workspaceEnabled && leadAgent?.conversation_id) {
      dispatchWorkspaceHasFilesEvent(true, leadAgent.conversation_id);
    }
  }, [workspaceEnabled, leadAgent?.conversation_id]);

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
    return <ChatSider conversation={dispatchConversation} team_id={team.id} />;
  }, [workspaceEnabled, dispatchConversation, team.id]);

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
    (slot_id: string) => {
      switchTab(slot_id);
      if (fullscreenSlotId) setFullscreenSlotId(slot_id);
      requestAnimationFrame(() => {
        const el = agentRefs.current[slot_id];
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
          }, 200);
        }
      });
    },
    [switchTab, fullscreenSlotId]
  );

  const scrollToPrev = useCallback(() => {
    const idx = agents.findIndex((a) => a.slot_id === activeSlotId);
    const target = idx > 0 ? idx - 1 : 0;
    if (agents[target]) handleTabClick(agents[target].slot_id);
  }, [agents, activeSlotId, handleTabClick]);

  const scrollToNext = useCallback(() => {
    const idx = agents.findIndex((a) => a.slot_id === activeSlotId);
    const target = idx >= 0 && idx < agents.length - 1 ? idx + 1 : 0;
    if (agents[target]) handleTabClick(agents[target].slot_id);
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
          }, 200);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, []); // empty deps = only on mount

  // Track pending permission confirmation counts per agent (requirements 5, 6, 7, 8)
  const { pendingCounts } = useTeamPendingPermissions(team.id, allConversationIds);

  // Build slot_id → pendingCount map for tab badge display
  const slotPendingCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const agent of agents) {
      if (agent.conversation_id) {
        map.set(agent.slot_id, pendingCounts[agent.conversation_id] ?? 0);
      }
    }
    return map;
  }, [agents, pendingCounts]);

  const tabsSlot = useMemo(
    () => <TeamTabs onTabClick={handleTabClick} pendingCounts={slotPendingCounts} />,
    [handleTabClick, slotPendingCounts]
  );

  return (
    <TeamPermissionProvider
      team_id={team.id}
      isLeaderAgent={isLeaderAgent}
      leaderConversationId={leaderConversationId}
      allConversationIds={allConversationIds}
    >
      {messageContext}
      <ChatLayout
        title={team.name}
        siderTitle={siderTitle}
        sider={sider}
        workspaceEnabled={workspaceEnabled}
        tabsSlot={tabsSlot}
        conversation_id={activeAgent?.conversation_id}
        agent_name={undefined}
        workspacePath={effectiveWorkspace}
        onRenameTitle={onRenameTeam}
      >
        <div className='relative flex h-full'>
          {fullscreenSlotId ? (
            // Fullscreen: single agent fills the entire content area
            (() => {
              const agent = agents.find((a) => a.slot_id === fullscreenSlotId);
              if (!agent) return null;
              const isLeaderSlot = agent.slot_id === leadAgent?.slot_id;
              return (
                <div className='flex-1 h-full'>
                  <AgentChatSlot
                    agent={agent}
                    team_id={team.id}
                    isLeader={isLeaderSlot}
                    isFullscreen
                    onToggleFullscreen={() => setFullscreenSlotId(null)}
                    onRemove={() => handleRemoveAgent(agent.slot_id)}
                  />
                </div>
              );
            })()
          ) : (
            <>
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
                  const isLeaderSlot = agent.slot_id === leadAgent?.slot_id;
                  return (
                    <div
                      key={agent.slot_id}
                      ref={(el) => {
                        agentRefs.current[agent.slot_id] = el;
                      }}
                      data-slot-id={agent.slotId}
                      data-role={isLeaderSlot ? 'leader' : 'member'}
                      className='relative h-full border-r border-solid border-[color:var(--border-base)]'
                      style={{
                        // Always flex-grow to fill available space; each slot starts at 400px
                        // basis so the layout is stable, but spare room is distributed evenly
                        // instead of leaving empty gaps to the right. When the team is wider
                        // than the viewport we preserve the 400px floor (prevents shrinking
                        // into unreadable cards) so horizontal scroll kicks in naturally.
                        flex: '1 1 400px',
                        minWidth: isSingle ? '240px' : '400px',
                        scrollSnapAlign: 'start',
                      }}
                    >
                      <AgentChatSlot
                        agent={agent}
                        team_id={team.id}
                        isLeader={isLeaderSlot}
                        onToggleFullscreen={() => setFullscreenSlotId(agent.slot_id)}
                        onRemove={() => handleRemoveAgent(agent.slot_id)}
                      />
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
            </>
          )}
        </div>
      </ChatLayout>
    </TeamPermissionProvider>
  );
};

const TeamPage: React.FC<Props> = ({ team }) => {
  const { t } = useTranslation();
  const { statusMap, renameAgent, removeAgent, mutateTeam } = useTeamSession(team);
  const { user } = useAuth();
  const { mutate: globalMutate } = useSWRConfig();
  const defaultSlotId = team.agents[0]?.slot_id ?? '';

  const handleRemoveAgentWithConfirm = useCallback(
    (slot_id: string) => {
      const doRemove = async () => {
        try {
          await removeAgent(slot_id);
          Message.success(t('common.deleteSuccess'));
        } catch (error) {
          Message.error(String(error));
        }
      };
      const status = statusMap.get(slot_id)?.status;
      if (status === 'active') {
        Modal.confirm({
          title: t('team.removeAgent.confirmTitle'),
          content: t('team.removeAgent.confirmContent'),
          onOk: doRemove,
        });
      } else {
        void doRemove();
      }
    },
    [statusMap, removeAgent, t]
  );

  const handleRenameTeam = useCallback(
    async (new_name: string): Promise<boolean> => {
      try {
        await ipcBridge.team.renameTeam.invoke({ id: team.id, name: new_name });
        await mutateTeam();
        await globalMutate(`teams/${user?.id ?? 'system_default_user'}`);
        return true;
      } catch (error) {
        console.error('Failed to rename team:', error);
        return false;
      }
    },
    [team.id, mutateTeam, globalMutate, user]
  );

  return (
    <TeamTabsProvider
      agents={team.agents}
      statusMap={statusMap}
      defaultActiveSlotId={defaultSlotId}
      team_id={team.id}
      renameAgent={renameAgent}
      removeAgent={handleRemoveAgentWithConfirm}
    >
      <TeamPageContent team={team} onRenameTeam={handleRenameTeam} />
    </TeamTabsProvider>
  );
};

export default TeamPage;
