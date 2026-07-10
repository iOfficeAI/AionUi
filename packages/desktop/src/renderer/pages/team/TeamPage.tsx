import { Message, Modal, Spin } from '@arco-design/web-react';
import { FullScreen, Left, OffScreen, Peoples, Right } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR, { useSWRConfig } from 'swr';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { ipcBridge } from '@/common';
import type { TeamAssistant, TTeam } from '@/common/types/team/teamTypes';
import type { IProvider, TChatConversation, TProviderWithModel } from '@/common/config/storage';
import { classifyConfigSetError, useAcpConfigOptions } from '@/renderer/hooks/agent/useAcpConfigOptions';
import ChatLayout from '@/renderer/pages/conversation/components/ChatLayout';
import ChatSlider from '@renderer/pages/conversation/components/ChatSlider.tsx';
import { useTeamPendingPermissions } from './hooks/useTeamPendingPermissions';
import AcpModelSelector from '@/renderer/components/agent/AcpModelSelector';
import AionrsModelSelector from '@/renderer/pages/conversation/platforms/aionrs/AionrsModelSelector';
import { useAionrsModelSelection } from '@/renderer/pages/conversation/platforms/aionrs/useAionrsModelSelection';
import { CronJobManager } from '@/renderer/pages/cron';
import { resolveCronJobId } from '@/renderer/pages/cron/cronUtils';
import TeamTabs from './components/TeamTabs';
import TeamChatView from './components/TeamChatView';
import TeamAgentIdentity from './components/TeamAgentIdentity';
import TeamViewToggle from './components/TeamViewToggle';
import TeamWarmupOverlay from './components/TeamWarmupOverlay';
import { useTeamViewMode } from './hooks/useTeamViewMode';
import { useTeamWarmup, type TeamWarmupMemberState, type TeamWarmupPhase } from './hooks/useTeamWarmup';
import { TeamTabsProvider, useTeamTabs } from './hooks/TeamTabsContext';
import { TeamIdentityProvider } from './identity/TeamIdentityContext';
import { TeamPermissionProvider, useTeamPermission } from './hooks/TeamPermissionContext';
import { useTeamSession } from './hooks/useTeamSession';
import { useTeamRunView, type TeamRunViewState } from './hooks/useTeamRunView';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { useActiveLease } from '@/renderer/pages/conversation/hooks/useActiveLease';
import { resolveTeamWorkspaceView } from './utils/teamWorkspaceView';

type Props = {
  team: TTeam;
};

const NON_ACP_BACKENDS = new Set(['aionrs', 'openclaw-gateway', 'nanobot', 'remote']);

function isAcpLikeBackend(backend: string | undefined): boolean {
  if (!backend) return false;
  return !NON_ACP_BACKENDS.has(backend);
}

type TeamPageContentProps = {
  team: TTeam;
  onRenameTeam: (new_name: string) => Promise<boolean>;
  warmupPhase: TeamWarmupPhase;
  warmupRuntimeStatus: Map<string, TeamWarmupMemberState>;
  onRetryWarmup: () => void;
};

const configErrorMessageKey = (error: unknown) => {
  const errorKind = classifyConfigSetError(error);
  if (errorKind === 'command_ack') return 'agent.config.commandAck';
  if (errorKind === 'confirmation_timeout') return 'agent.config.timeout';
  if (errorKind === 'config_update_in_progress') return 'agent.config.busy';
  return 'agent.config.failed';
};

/** Compact aionrs model selector for the agent header */
const AionrsHeaderModelSelector: React.FC<{ conversation_id: string; initialModel?: TProviderWithModel }> = ({
  conversation_id,
  initialModel,
}) => {
  const { t } = useTranslation();
  const teamPermission = useTeamPermission();
  const onSelectModel = useCallback(
    async (_provider: IProvider, modelName: string) => {
      const selected = { ..._provider, use_model: modelName } as TProviderWithModel;
      const ok = await ipcBridge.conversation.update.invoke({ id: conversation_id, updates: { model: selected } });
      return Boolean(ok);
    },
    [conversation_id]
  );
  const modelSelection = useAionrsModelSelection({ initialModel, onSelectModel });
  const runtimeConfig = useAcpConfigOptions({
    conversation_id,
    prepareSetRuntime: teamPermission?.warmupSession,
    loadConfigOptions: teamPermission?.loadConfigOptions,
    enabled: Boolean(conversation_id),
  });
  const handleThoughtLevelSetOption = useCallback(
    async (optionId: string, value: string) => {
      try {
        const result = await runtimeConfig.setConfigOption(optionId, value);
        Message.success(t('agent.thoughtLevel.switchSuccess'));
        return result;
      } catch (error) {
        Message.error(t(configErrorMessageKey(error)));
        throw error;
      }
    },
    [runtimeConfig, t]
  );
  return (
    <AionrsModelSelector
      selection={modelSelection}
      thoughtLevel={runtimeConfig.thoughtLevel}
      setStatus={runtimeConfig.setStatus}
      onSetThoughtLevel={handleThoughtLevelSetOption}
    />
  );
};

/** Fetches conversation for a single assistant and renders TeamChatView */
const AssistantChatSlot: React.FC<{
  assistant: TeamAssistant;
  team_id: string;
  isLeader: boolean;
  /** 成员身份色（列头名字 / 列身淡底）。 */
  color: string;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  teamRunView: TeamRunViewState;
  onTeamRunAck: ReturnType<typeof useTeamRunView>['applyAck'];
  onRunStateStale: ReturnType<typeof useTeamRunView>['reconcile'];
}> = ({
  assistant,
  team_id,
  isLeader,
  color,
  isFullscreen = false,
  onToggleFullscreen,
  teamRunView,
  onTeamRunAck,
  onRunStateStale,
}) => {
  const layout = useLayoutContext();
  const teamPermission = useTeamPermission();
  const isMobile = layout?.isMobile ?? false;
  const { data: conversation } = useSWR(
    assistant.conversation_id ? ['team-conversation', assistant.conversation_id] : null,
    () => getConversationOrNull(assistant.conversation_id)
  );

  const isAionrs = conversation?.type === 'aionrs';
  const initialModelId = (conversation?.extra as { current_model_id?: string })?.current_model_id;
  const isAcpLike = conversation?.type === 'acp' || isAcpLikeBackend(assistant.assistant_backend);
  const cronJobId = resolveCronJobId(conversation?.extra);
  // 抬头不叠身份色底（避免压低彩色名字的可读性）；成员身份仅由抬头里的“彩色名字”承担。
  // 列身体保留极淡身份色底作弱提示，不影响气泡阅读。
  return (
    <div className='flex flex-col h-full' style={{ background: `color-mix(in srgb, ${color} 4%, var(--bg-base))` }}>
      <div className='flex items-center justify-between gap-8px px-12px h-40px shrink-0 border-b border-solid border-[color:var(--border-base)] relative z-10 bg-1'>
        <TeamAgentIdentity
          assistant_name={assistant.assistant_name}
          assistant_backend={assistant.assistant_backend}
          icon={assistant.icon}
          conversation_id={assistant.conversation_id}
          isLeader={isLeader}
          className='min-w-0'
          nameClassName='text-13px font-600'
          nameStyle={{ color }}
        />
        <div className='flex items-center gap-8px shrink-0'>
          {conversation && <CronJobManager conversation_id={conversation.id} cron_job_id={cronJobId} />}
          {!isMobile && assistant.conversation_id && !isAionrs && isAcpLike && (
            <div className='min-w-0 max-w-140px [&_button]:max-w-full [&_button_span]:truncate'>
              <AcpModelSelector
                key={assistant.conversation_id}
                conversation_id={assistant.conversation_id}
                backend={assistant.assistant_backend}
                initialModelId={initialModelId}
                prepareSetRuntime={teamPermission?.warmupSession}
                loadConfigOptions={teamPermission?.loadConfigOptions}
              />
            </div>
          )}
          {!isMobile && isAionrs && assistant.conversation_id && (
            <div className='min-w-0 max-w-140px [&_button]:max-w-full [&_button_span]:truncate'>
              <AionrsHeaderModelSelector
                key={assistant.conversation_id}
                conversation_id={assistant.conversation_id}
                initialModel={conversation?.model as TProviderWithModel | undefined}
              />
            </div>
          )}
          {/* 移除入口统一到顶部胶囊（team-tab-remove-*），抬头这里不再重复放 X。 */}
          <div
            className='shrink-0 flex items-center justify-center leading-none cursor-pointer hover:bg-[var(--fill-3)] p-4px rd-4px text-[color:var(--color-text-3)] hover:text-[color:var(--color-text-1)] transition-colors'
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
            slot_id={assistant.slot_id}
            assistant_name={assistant.assistant_name}
            assistant_backend={assistant.assistant_backend}
            agent_icon={assistant.icon}
            isLeader={isLeader}
            teamRunView={teamRunView}
            onTeamRunAck={onTeamRunAck}
            onRunStateStale={() => onRunStateStale('pause.stale')}
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
const TeamPageContent: React.FC<TeamPageContentProps> = ({
  team,
  onRenameTeam,
  warmupPhase,
  warmupRuntimeStatus,
  onRetryWarmup,
}) => {
  const { t } = useTranslation();
  useActiveLease({ type: 'team', id: team.id });
  const { assistants, activeSlotId, switchTab, colorOf, colorOfConversation } = useTeamTabs();
  const [, messageContext] = Message.useMessage({ maxCount: 1 });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const assistantRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  // 视图模式（并行/单聊），按团队记忆。单聊 = 全屏当前选中成员。
  const [viewMode, setViewMode] = useTeamViewMode(team.id);
  const isSingleView = viewMode === 'single';

  const activeAssistant = assistants.find((assistant) => assistant.slot_id === activeSlotId);
  const leadAssistant = assistants.find((assistant) => assistant.role === 'leader');
  const teamRun = useTeamRunView(team.id);

  // 进团队 warmup：以团队会话整体就绪为闸门（ensureSession resolve = 全员成功）。遮罩覆盖对话区。
  // runtimeStatus 是各成员逐个的真实唤醒信号，用于遮罩头像的「唤醒中→点亮」及失败态定位。
  // 仅在「唤醒进行中」禁用改成员；失败态（error/timeout）要放开，让用户能移除失败成员来自救。
  const isWarmingUp = warmupPhase === 'warming';

  const leaderConversationId = leadAssistant?.conversation_id ?? '';
  const isLeaderAssistant = activeAssistant?.role === 'leader';
  const allConversationIds = useMemo(
    () => assistants.map((assistant) => assistant.conversation_id).filter(Boolean),
    [assistants]
  );

  // Fetch leader assistant's conversation for the workspace sider
  const { data: dispatchConversation } = useSWR(
    leadAssistant?.conversation_id ? ['team-conversation', leadAssistant.conversation_id] : null,
    () => getConversationOrNull(leadAssistant!.conversation_id)
  );

  // Use team workspace if specified, otherwise fall back to leader assistant's conversation workspace (temp workspace)
  const teamWorkspaceView = resolveTeamWorkspaceView(
    team.workspace,
    (dispatchConversation?.extra as { workspace?: string } | undefined)?.workspace
  );
  const effectiveWorkspace = teamWorkspaceView.workspacePath;
  const workspaceEnabled = teamWorkspaceView.workspaceEnabled;
  // Team is "user-picked" only when team.workspace was explicitly set at team
  // creation. Falling back to a leader assistant's auto-temp workspace counts as
  // temporary, mirroring single-chat behavior.
  const isTeamWorkspaceTemporary = teamWorkspaceView.isTemporaryWorkspace;

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
    return <ChatSlider conversation={dispatchConversation} />;
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
    (slot_id: string) => {
      switchTab(slot_id);
      // 单聊视图只显示选中成员，无需滚动定位/闪动；并行视图滚动到对应列并闪一下。
      if (isSingleView) return;
      requestAnimationFrame(() => {
        const el = assistantRefs.current[slot_id];
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
    [switchTab, isSingleView]
  );

  const scrollToPrev = useCallback(() => {
    const idx = assistants.findIndex((assistant) => assistant.slot_id === activeSlotId);
    const target = idx > 0 ? idx - 1 : 0;
    if (assistants[target]) handleTabClick(assistants[target].slot_id);
  }, [assistants, activeSlotId, handleTabClick]);

  const scrollToNext = useCallback(() => {
    const idx = assistants.findIndex((assistant) => assistant.slot_id === activeSlotId);
    const target = idx >= 0 && idx < assistants.length - 1 ? idx + 1 : 0;
    if (assistants[target]) handleTabClick(assistants[target].slot_id);
  }, [assistants, activeSlotId, handleTabClick]);

  // Every time the page mounts, scroll + flash the active tab
  useEffect(() => {
    if (activeSlotId && assistants.length > 0) {
      const timer = setTimeout(() => {
        const el = assistantRefs.current[activeSlotId];
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

  // 并行视图下：当 activeSlotId 因程序化切换而变化（如「告诉 Leader」切到 Leader），
  // 把对应列滚动到可视区，避免选中的成员列不在画面中。
  useEffect(() => {
    if (isSingleView || !activeSlotId) return;
    const el = assistantRefs.current[activeSlotId];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
  }, [activeSlotId, isSingleView]);

  // Track pending permission confirmation counts per assistant (requirements 5, 6, 7, 8)
  const { pendingCounts } = useTeamPendingPermissions(team.id, allConversationIds);

  // Build slot_id → pendingCount map for tab badge display
  const slotPendingCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const assistant of assistants) {
      if (assistant.conversation_id) {
        map.set(assistant.slot_id, pendingCounts[assistant.conversation_id] ?? 0);
      }
    }
    return map;
  }, [assistants, pendingCounts]);

  // warmup 失败的成员 slot 集合：胶囊头像标红。仅在失败态计算（进行中/就绪都无需标红）。
  const warmupFailedSlotIds = useMemo(() => {
    if (warmupPhase !== 'error') return undefined;
    const ids = new Set<string>();
    warmupRuntimeStatus.forEach((state, slot_id) => {
      if (state.status === 'failed') ids.add(slot_id);
    });
    return ids.size > 0 ? ids : undefined;
  }, [warmupPhase, warmupRuntimeStatus]);

  const tabsSlot = useMemo(
    () => (
      <TeamTabs
        onTabClick={handleTabClick}
        pendingCounts={slotPendingCounts}
        warmingUp={isWarmingUp}
        failedSlotIds={warmupFailedSlotIds}
      />
    ),
    [handleTabClick, slotPendingCounts, isWarmingUp, warmupFailedSlotIds]
  );

  return (
    <TeamPermissionProvider
      team_id={team.id}
      isLeaderAgent={isLeaderAssistant}
      leaderConversationId={leaderConversationId}
      allConversationIds={allConversationIds}
    >
      <TeamIdentityProvider colorOfConversation={colorOfConversation}>
        {messageContext}
        <ChatLayout
          title={team.name}
          siderTitle={siderTitle}
          sider={sider}
          workspaceEnabled={workspaceEnabled}
          tabsSlot={tabsSlot}
          conversation_id={activeAssistant?.conversation_id}
          agent_name={undefined}
          workspacePath={effectiveWorkspace}
          isTemporaryWorkspace={isTeamWorkspaceTemporary}
          workspacePreferenceKey={team.id}
          onRenameTitle={onRenameTeam}
          headerExtra={assistants.length > 1 ? <TeamViewToggle value={viewMode} onChange={setViewMode} /> : undefined}
          headerLeading={
            <span className='inline-flex w-16px h-16px items-center justify-center shrink-0 leading-none text-t-primary'>
              <Peoples theme='outline' size='16' fill='currentColor' style={{ lineHeight: 0 }} />
            </span>
          }
        >
          <div className='relative flex h-full'>
            <TeamWarmupOverlay
              phase={warmupPhase}
              assistants={assistants}
              runtimeStatus={warmupRuntimeStatus}
              colorOf={colorOf}
              onRetry={onRetryWarmup}
            />
            {isSingleView ? (
              // 单聊视图：全屏显示当前选中成员（activeSlotId），找不到时回退到 Leader。
              (() => {
                const assistant =
                  assistants.find((candidate) => candidate.slot_id === activeSlotId) ?? leadAssistant ?? assistants[0];
                if (!assistant) return null;
                const isLeaderSlot = assistant.slot_id === leadAssistant?.slot_id;
                return (
                  <div className='flex-1 h-full'>
                    <AssistantChatSlot
                      assistant={assistant}
                      team_id={team.id}
                      isLeader={isLeaderSlot}
                      color={colorOf(assistant.slot_id)}
                      isFullscreen
                      onToggleFullscreen={() => setViewMode('parallel')}
                      teamRunView={teamRun.state}
                      onTeamRunAck={teamRun.applyAck}
                      onRunStateStale={teamRun.reconcile}
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
                  {assistants.map((assistant, index) => {
                    const isSingle = assistants.length <= 2;
                    const isLeaderSlot = assistant.slot_id === leadAssistant?.slot_id;
                    const isLastColumn = index === assistants.length - 1;
                    return (
                      <div
                        key={assistant.slot_id}
                        ref={(el) => {
                          assistantRefs.current[assistant.slot_id] = el;
                        }}
                        data-slot-id={assistant.slot_id}
                        data-role={isLeaderSlot ? 'leader' : 'member'}
                        // 列间灰色隔离线：除最后一列外，右侧加一条分隔线，避免多列浅底粘连看不清边界。
                        className={`relative h-full ${isLastColumn ? '' : 'border-r border-solid border-[color:var(--border-base)]'}`}
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
                        <AssistantChatSlot
                          assistant={assistant}
                          team_id={team.id}
                          isLeader={isLeaderSlot}
                          color={colorOf(assistant.slot_id)}
                          onToggleFullscreen={() => {
                            switchTab(assistant.slot_id);
                            setViewMode('single');
                          }}
                          teamRunView={teamRun.state}
                          onTeamRunAck={teamRun.applyAck}
                          onRunStateStale={teamRun.reconcile}
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
      </TeamIdentityProvider>
    </TeamPermissionProvider>
  );
};

const TeamPage: React.FC<Props> = ({ team }) => {
  const { t } = useTranslation();
  const { phase: warmupPhase, runtimeStatus: warmupRuntimeStatus, retry: retryWarmup } = useTeamWarmup(team.id);
  const { statusMap, membershipMutationBusy, addAssistant, renameAssistant, removeAssistant, mutateTeam } =
    useTeamSession(team, warmupPhase);
  const { user } = useAuth();
  const { mutate: globalMutate } = useSWRConfig();
  const defaultSlotId = team.assistants[0]?.slot_id ?? '';

  const handleRemoveAssistantWithConfirm = useCallback(
    (slot_id: string) => {
      if (membershipMutationBusy) return;

      const doRemoveAssistant = async () => {
        try {
          await removeAssistant(slot_id);
          Message.success(t('common.deleteSuccess'));
        } catch (error) {
          Message.error(String(error));
        }
      };
      // 移除成员一律二次确认；成员正在工作中时用更强的措辞提示会打断其工作。
      const status = statusMap.get(slot_id)?.status;
      const isActive = status === 'active';
      Modal.confirm({
        title: t('team.removeAgent.confirmTitle', { defaultValue: 'Remove team member' }),
        content: isActive
          ? t('team.removeAgent.confirmContentActive', {
              defaultValue: 'This member is working. Remove it anyway? Its current work will be interrupted.',
            })
          : t('team.removeAgent.confirmContent', { defaultValue: 'Remove this member from the team?' }),
        okButtonProps: { status: 'danger' },
        onOk: doRemoveAssistant,
      });
    },
    [membershipMutationBusy, statusMap, removeAssistant, t]
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
      assistants={team.assistants}
      statusMap={statusMap}
      defaultActiveSlotId={defaultSlotId}
      team_id={team.id}
      addAssistant={addAssistant}
      renameAssistant={renameAssistant}
      removeAssistant={handleRemoveAssistantWithConfirm}
      membershipMutationBusy={membershipMutationBusy}
    >
      <TeamPageContent
        team={team}
        onRenameTeam={handleRenameTeam}
        warmupPhase={warmupPhase}
        warmupRuntimeStatus={warmupRuntimeStatus}
        onRetryWarmup={retryWarmup}
      />
    </TeamTabsProvider>
  );
};

export default TeamPage;
