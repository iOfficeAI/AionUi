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
import GeminiModelSelector from '@/renderer/pages/conversation/platforms/gemini/GeminiModelSelector';
import { useGeminiModelSelection } from '@/renderer/pages/conversation/platforms/gemini/useGeminiModelSelection';
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
  onRenameTeam: (newName: string) => Promise<boolean>;
};

/** Compact aionrs model selector for the agent header */
const AionrsHeaderModelSelector: React.FC<{ conversationId: string; initialModel?: TProviderWithModel }> = ({
  conversationId,
  initialModel,
}) => {
  const onSelectModel = useCallback(
    async (_provider: IProvider, modelName: string) => {
      const selected = { ..._provider, useModel: modelName } as TProviderWithModel;
      const ok = await ipcBridge.conversation.update.invoke({ id: conversationId, updates: { model: selected } });
      return Boolean(ok);
    },
    [conversationId]
  );
  const modelSelection = useAionrsModelSelection({ initialModel, onSelectModel });
  return <AionrsModelSelector selection={modelSelection} />;
};

/** Fetches conversation for a single agent and renders TeamChatView */
const AgentChatSlot: React.FC<{
  agent: TeamAgent;
  teamId: string;
  isLeader: boolean;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onRemove?: () => void;
}> = ({ agent, teamId, isLeader, isFullscreen = false, onToggleFullscreen, onRemove }) => {
  const { data: conversation } = useSWR(agent.conversationId ? ['team-conversation', agent.conversationId] : null, () =>
    ipcBridge.conversation.get.invoke({ id: agent.conversationId })
  );

  const isAionrs = conversation?.type === 'aionrs';
  const initialModelId = (conversation?.extra as { currentModelId?: string })?.currentModelId;
  const isAcpLike = agent.conversationType === 'acp' || agent.conversationType === 'codex';
  const isGemini = agent.conversationType === 'gemini';

  const geminiOnSelectModel = useCallback(
    async (_provider: IProvider, modelName: string) => {
      if (!conversation) return false;
      const selected = { ..._provider, useModel: modelName } as TProviderWithModel;
      const ok = await ipcBridge.conversation.update.invoke({ id: conversation.id, updates: { model: selected } });
      return Boolean(ok);
    },
    [conversation]
  );
  const geminiModelSelection = useGeminiModelSelection({
    initialModel:
      isGemini && conversation ? (conversation as Extract<TChatConversation, { type: 'gemini' }>).model : undefined,
    onSelectModel: geminiOnSelectModel,
  });

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
          agentName={agent.agentName}
          agentType={agent.agentType}
          conversationId={agent.conversationId}
          isLeader={isLeader}
          className='min-w-0'
          nameClassName='text-13px text-[color:var(--color-text-2)] font-medium'
        />
        <div className='flex items-center gap-8px shrink-0'>
          {agent.conversationId && !isAionrs && isAcpLike && (
            <div className='min-w-0 max-w-140px [&_button]:max-w-full [&_button_span]:truncate'>
              <AcpModelSelector
                key={agent.conversationId}
                conversationId={agent.conversationId}
                backend={agent.agentType}
                initialModelId={initialModelId}
              />
            </div>
          )}
          {agent.conversationId && isGemini && (
            <div className='min-w-0 max-w-140px [&_button]:max-w-full [&_button_span]:truncate'>
              <GeminiModelSelector selection={geminiModelSelection} />
            </div>
          )}
          {isAionrs && agent.conversationId && (
            <div className='min-w-0 max-w-140px [&_button]:max-w-full [&_button_span]:truncate'>
              <AionrsHeaderModelSelector
                key={agent.conversationId}
                conversationId={agent.conversationId}
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
            teamId={teamId}
            agentSlotId={isLeader ? undefined : agent.slotId}
            agentName={agent.agentName}
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

  const activeAgent = agents.find((a) => a.slotId === activeSlotId);
  const leadAgent = agents.find((a) => a.role === 'leader');

  const doRemoveAgent = useCallback(
    async (slotId: string) => {
      try {
        await ipcBridge.team.removeAgent.invoke({ teamId: team.id, slotId });
        Message.success(t('common.deleteSuccess'));
        // Only switch tab when removing the currently active tab
        if (slotId === activeSlotId && leadAgent?.slotId) switchTab(leadAgent.slotId);
        if (fullscreenSlotId === slotId) setFullscreenSlotId(null);
      } catch (error) {
        console.error('Failed to remove agent:', error);
        Message.error(String(error));
      }
    },
    [team.id, activeSlotId, leadAgent?.slotId, switchTab, fullscreenSlotId, t]
  );

  const handleRemoveAgent = useCallback(
    (slotId: string) => {
      const status = statusMap.get(slotId)?.status;
      if (status === 'active') {
        Modal.confirm({
          title: t('team.removeAgent.confirmTitle'),
          content: t('team.removeAgent.confirmContent'),
          onOk: () => doRemoveAgent(slotId),
        });
      } else {
        void doRemoveAgent(slotId);
      }
    },
    [statusMap, doRemoveAgent, t]
  );
  const leaderConversationId = leadAgent?.conversationId ?? '';
  const isLeaderAgent = activeAgent?.role === 'leader';
  const allConversationIds = useMemo(() => agents.map((a) => a.conversationId).filter(Boolean), [agents]);

  // Fetch leader agent's conversation for the workspace sider
  const { data: dispatchConversation } = useSWR(
    leadAgent?.conversationId ? ['team-conversation', leadAgent.conversationId] : null,
    () => ipcBridge.conversation.get.invoke({ id: leadAgent!.conversationId })
  );

  // Use team workspace if specified, otherwise fall back to leader agent's conversation workspace (temp workspace)
  const effectiveWorkspace = team.workspace || (dispatchConversation?.extra as { workspace?: string })?.workspace || '';
  const workspaceEnabled = Boolean(effectiveWorkspace);

  // Auto-expand workspace panel on mount when workspace is available
  useEffect(() => {
    if (workspaceEnabled && leadAgent?.conversationId) {
      dispatchWorkspaceHasFilesEvent(true, leadAgent.conversationId);
    }
  }, [workspaceEnabled, leadAgent?.conversationId]);

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
    return <ChatSider conversation={dispatchConversation} teamId={team.id} />;
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
    (slotId: string) => {
      switchTab(slotId);
      if (fullscreenSlotId) setFullscreenSlotId(slotId);
      requestAnimationFrame(() => {
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
          }, 200);
        }
      });
    },
    [switchTab, fullscreenSlotId]
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
          }, 200);
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, []); // empty deps = only on mount

  // Track pending permission confirmation counts per agent (requirements 5, 6, 7, 8)
  const { pendingCounts } = useTeamPendingPermissions(team.id, allConversationIds);

  // Build slotId → pendingCount map for tab badge display
  const slotPendingCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const agent of agents) {
      if (agent.conversationId) {
        map.set(agent.slotId, pendingCounts[agent.conversationId] ?? 0);
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
      teamId={team.id}
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
        conversationId={activeAgent?.conversationId}
        agentName={undefined}
        workspacePath={effectiveWorkspace}
        onRenameTitle={onRenameTeam}
      >
        <div className='relative flex h-full'>
          {fullscreenSlotId ? (
            // Fullscreen: single agent fills the entire content area
            (() => {
              const agent = agents.find((a) => a.slotId === fullscreenSlotId);
              if (!agent) return null;
              const isLeaderSlot = agent.slotId === leadAgent?.slotId;
              return (
                <div className='flex-1 h-full'>
                  <AgentChatSlot
                    agent={agent}
                    teamId={team.id}
                    isLeader={isLeaderSlot}
                    isFullscreen
                    onToggleFullscreen={() => setFullscreenSlotId(null)}
                    onRemove={() => handleRemoveAgent(agent.slotId)}
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
                  const isLeaderSlot = agent.slotId === leadAgent?.slotId;
                  return (
                    <div
                      key={agent.slotId}
                      ref={(el) => {
                        agentRefs.current[agent.slotId] = el;
                      }}
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
                        teamId={team.id}
                        isLeader={isLeaderSlot}
                        onToggleFullscreen={() => setFullscreenSlotId(agent.slotId)}
                        onRemove={() => handleRemoveAgent(agent.slotId)}
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
  const defaultSlotId = team.agents[0]?.slotId ?? '';

  const handleRemoveAgentWithConfirm = useCallback(
    (slotId: string) => {
      const doRemove = async () => {
        try {
          await removeAgent(slotId);
          Message.success(t('common.deleteSuccess'));
        } catch (error) {
          Message.error(String(error));
        }
      };
      const status = statusMap.get(slotId)?.status;
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
    async (newName: string): Promise<boolean> => {
      try {
        await ipcBridge.team.renameTeam.invoke({ id: team.id, name: newName });
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
      teamId={team.id}
      renameAgent={renameAgent}
      removeAgent={handleRemoveAgentWithConfirm}
    >
      <TeamPageContent team={team} onRenameTeam={handleRenameTeam} />
    </TeamTabsProvider>
  );
};

export default TeamPage;
