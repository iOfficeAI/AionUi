import { Button, Dropdown, Menu, Message, Modal, Spin, Tooltip } from '@arco-design/web-react';
import { FullScreen, Left, MoreOne, OffScreen, Peoples, Right } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import classNames from 'classnames';
import { useTranslation } from 'react-i18next';
import useSWR, { useSWRConfig } from 'swr';
import { useAuth } from '@renderer/hooks/context/AuthContext';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import { ipcBridge } from '@/common';
import type {
  ITeamSlotWork,
  TeamAssistant,
  TeamContextResetAvailability,
  TeammateStatus,
  TTeam,
} from '@/common/types/team/teamTypes';
import type { IProvider, TChatConversation, TProviderWithModel } from '@/common/config/storage';
import {
  classifyConfigSetError,
  revalidateAcpConfigOptions,
  useAcpConfigOptions,
} from '@/renderer/hooks/agent/useAcpConfigOptions';
import ChatLayout from '@/renderer/pages/conversation/components/ChatLayout';
import ChatSlider from '@renderer/pages/conversation/components/ChatSlider.tsx';
import BrowserPanel from '@/renderer/pages/conversation/components/BrowserPanel';
import { useResizableSplit } from '@/renderer/hooks/ui/useResizableSplit';
import { Browser } from '@icon-park/react';
import { useTeamPendingPermissions } from './hooks/useTeamPendingPermissions';
import { buildTeamRetryStartHandler } from './components/teamSendRuntime';
import AcpModelSelector, { type AcpWarmupStatus } from '@/renderer/components/agent/AcpModelSelector';
import AionrsModelSelector from '@/renderer/pages/conversation/platforms/aionrs/AionrsModelSelector';
import { useAionrsModelSelection } from '@/renderer/pages/conversation/platforms/aionrs/useAionrsModelSelection';
import AcpRuntimeRestartButton, { useAcpRuntimeRestart } from '@/renderer/components/agent/AcpRuntimeRestartButton';
import { CronJobManager } from '@/renderer/pages/cron';
import { resolveCronJobId } from '@/renderer/pages/cron/cronUtils';
import TeamTabs, { TeamActiveMembers } from './components/TeamTabs';
import TeamChatView from './components/TeamChatView';
import TeamAgentIdentity from './components/TeamAgentIdentity';
import AgentStatusBadge from './components/AgentStatusBadge';
import TeamViewToggle from './components/TeamViewToggle';
import TeamNewTaskButton from './components/TeamNewTaskButton';
import TeamActivityView from './activity/TeamActivityView';
import TeamWarmupOverlay from './components/TeamWarmupOverlay';
import { useTeamViewMode } from './hooks/useTeamViewMode';
import type { ChatFileRef } from '@/common/types/chatFile';
import { TeamWatchdogToggle, useTeamWatchdog } from './watchdog';
import { useTeamWarmup, type TeamWarmupMemberState, type TeamWarmupPhase } from './hooks/useTeamWarmup';
import { TeamTabsProvider, useTeamTabs } from './hooks/TeamTabsContext';
import { TeamIdentityProvider } from './identity/TeamIdentityContext';
import { TeamPermissionProvider, useTeamPermission } from './hooks/TeamPermissionContext';
import { useTeamSession } from './hooks/useTeamSession';
import { useTeamRunView, type TeamRunViewState } from './hooks/useTeamRunView';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { useActiveLease } from '@/renderer/pages/conversation/hooks/useActiveLease';
import { resolveTeamWorkspaceView } from './utils/teamWorkspaceView';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { previewScopeKey } from '@/renderer/pages/conversation/Preview/context/previewScope';
import { setCurrentProject } from '@/renderer/pages/conversation/explorer/currentProjectStore';
import { setCurrentConversation } from '@/renderer/pages/conversation/explorer/currentConversationStore';
import { getSnapshotConversationProjectId } from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync';
import { isBackendHttpError } from '@/common/adapter/httpBridge';

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

const contextResetAvailabilityMessageKey = (availability: TeamContextResetAvailability) => {
  switch (availability) {
    case 'initializing':
      return 'team.agentActions.disabled.initializing' as const;
    case 'busy':
      return 'team.agentActions.disabled.busy' as const;
    case 'dormant':
      return 'team.agentActions.disabled.dormant' as const;
    case 'failed':
      return 'team.agentActions.disabled.failed' as const;
    case 'removing':
      return 'team.agentActions.disabled.removing' as const;
    case 'session_stopped':
      return 'team.agentActions.disabled.sessionStopped' as const;
    case 'unsupported':
      return 'team.agentActions.disabled.unsupported' as const;
    case 'leader_not_targetable':
      return 'team.agentActions.disabled.leaderNotTargetable' as const;
    case 'ready':
      return 'team.agentActions.label' as const;
  }
};

const resolveRuntimeActionAvailability = ({
  warmupStatus,
  warmupDisabled,
  slotWork,
  sessionStopped,
  fallbackAvailability,
}: {
  warmupStatus?: AcpWarmupStatus;
  warmupDisabled: boolean;
  slotWork?: ITeamSlotWork;
  sessionStopped: boolean;
  fallbackAvailability: TeamContextResetAvailability;
}): TeamContextResetAvailability => {
  if (sessionStopped || slotWork?.blocked_reason === 'session_stopped') return 'session_stopped';
  if (slotWork?.blocked_reason === 'removing') return 'removing';
  if (warmupDisabled || warmupStatus === 'pending' || slotWork?.blocked_reason === 'runtime_starting') {
    return 'initializing';
  }
  if (warmupStatus === 'dormant') return 'dormant';
  if (warmupStatus === 'failed' || slotWork?.blocked_reason === 'runtime_failed') return 'failed';
  if (
    slotWork?.active_turn_id ||
    (slotWork?.queued_foreground_count ?? 0) > 0 ||
    (slotWork?.queued_background_count ?? 0) > 0
  ) {
    return 'busy';
  }
  if (warmupStatus === 'ready') return 'ready';
  return fallbackAvailability;
};

const runtimeAvailabilityToWarmupStatus = (availability: TeamContextResetAvailability): AcpWarmupStatus => {
  switch (availability) {
    case 'ready':
    case 'busy':
      return 'ready';
    case 'initializing':
      return 'pending';
    case 'failed':
      return 'failed';
    default:
      return 'dormant';
  }
};

const teamWarmupPhaseAvailability = (phase: TeamWarmupPhase): TeamContextResetAvailability => {
  switch (phase) {
    case 'ready':
      return 'ready';
    case 'error':
      return 'failed';
    case 'warming':
      return 'initializing';
  }
};

const contextResetErrorMessageKey = (error: unknown) => {
  if (!isBackendHttpError(error)) return 'team.agentActions.contextReset.failed' as const;
  switch (error.code) {
    case 'TEAM_MEMBER_BUSY':
      return 'team.agentActions.disabled.busy' as const;
    case 'TEAM_MEMBER_RUNTIME_STARTING':
      return 'team.agentActions.disabled.initializing' as const;
    case 'TEAM_MEMBER_DORMANT':
      return 'team.agentActions.disabled.dormant' as const;
    case 'TEAM_MEMBER_RUNTIME_FAILED':
      return 'team.agentActions.disabled.failed' as const;
    case 'TEAM_MEMBER_REMOVING':
      return 'team.agentActions.disabled.removing' as const;
    case 'TEAM_SESSION_STOPPED':
      return 'team.agentActions.disabled.sessionStopped' as const;
    case 'TEAM_MEMBER_UNSUPPORTED':
      return 'team.agentActions.disabled.unsupported' as const;
    case 'TEAM_CONTEXT_RESET_LEADER_NOT_TARGETABLE':
      return 'team.agentActions.disabled.leaderNotTargetable' as const;
    default:
      return 'team.agentActions.contextReset.failed' as const;
  }
};

const TeamAgentActions: React.FC<{
  assistant: TeamAssistant;
  team_id: string;
  runtimeAvailability: TeamContextResetAvailability;
  contextResetAvailability: TeamContextResetAvailability;
  onRuntimeChanged: () => Promise<void>;
}> = ({ assistant, team_id, runtimeAvailability, contextResetAvailability, onRuntimeChanged }) => {
  const { t } = useTranslation();
  const teamTarget = useMemo(() => ({ team_id, slot_id: assistant.slot_id }), [assistant.slot_id, team_id]);
  const { restart, restarting } = useAcpRuntimeRestart({
    conversation_id: assistant.conversation_id,
    team: teamTarget,
  });
  const [resetting, setResetting] = useState(false);
  const reconnectDisabled = runtimeAvailability !== 'ready';
  const reconnectDisabledReason = reconnectDisabled
    ? t(contextResetAvailabilityMessageKey(runtimeAvailability))
    : undefined;
  const contextResetDisabled = contextResetAvailability !== 'ready';
  const contextResetDisabledReason = contextResetDisabled
    ? t(contextResetAvailabilityMessageKey(contextResetAvailability))
    : undefined;

  const confirmReconnect = useCallback(() => {
    if (reconnectDisabled || restarting || resetting) return;
    Modal.confirm({
      title: t('agent.runtimeRestart.tooltip'),
      content: t('agent.runtimeRestart.confirmContent'),
      okText: t('common.confirm'),
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await restart();
          await onRuntimeChanged();
        } catch {
          // The shared restart action already presents the localized failure.
        }
      },
    });
  }, [onRuntimeChanged, reconnectDisabled, restart, restarting, resetting, t]);

  const confirmContextReset = useCallback(() => {
    if (contextResetDisabled || restarting || resetting) return;
    Modal.confirm({
      title: t('team.agentActions.contextReset.confirmTitle', { memberName: assistant.assistant_name }),
      content: t('team.agentActions.contextReset.confirmContent'),
      okText: t('team.agentActions.contextReset.confirm'),
      cancelText: t('common.cancel'),
      okButtonProps: { status: 'danger' },
      onOk: async () => {
        setResetting(true);
        try {
          const outcome = await ipcBridge.team.resetAgentContext.invoke(teamTarget);
          if (outcome.reset_status === 'completed' && outcome.runtime_status === 'ready') {
            Message.success(t('team.agentActions.contextReset.success', { memberName: assistant.assistant_name }));
          } else if (outcome.reset_status === 'completed') {
            Message.warning(
              t('team.agentActions.contextReset.partialSuccess', { memberName: assistant.assistant_name })
            );
          } else {
            Message.error(t('team.agentActions.contextReset.notApplied'));
          }
          await Promise.all([revalidateAcpConfigOptions(assistant.conversation_id), onRuntimeChanged()]);
        } catch (error) {
          Message.error(t(contextResetErrorMessageKey(error)));
        } finally {
          setResetting(false);
        }
      },
    });
  }, [
    assistant.assistant_name,
    assistant.conversation_id,
    contextResetDisabled,
    onRuntimeChanged,
    restarting,
    resetting,
    t,
    teamTarget,
  ]);

  const actionContent = (title: string, description: string, reason?: string) => (
    <Tooltip content={reason} disabled={!reason} position='right'>
      <div className='flex min-w-220px flex-col py-2px'>
        <span className='text-13px'>{title}</span>
        <span className='text-12px text-t-secondary whitespace-normal'>{reason ?? description}</span>
      </div>
    </Tooltip>
  );
  const menu = (
    <Menu
      onClickMenuItem={(key) => {
        if (key === 'reconnect') confirmReconnect();
        if (key === 'context-reset') confirmContextReset();
      }}
    >
      <Menu.Item key='reconnect' disabled={reconnectDisabled || restarting || resetting}>
        {actionContent(
          t('agent.runtimeRestart.tooltip'),
          t('team.agentActions.reconnectDescription'),
          reconnectDisabledReason
        )}
      </Menu.Item>
      <Menu.Item
        key='context-reset'
        disabled={contextResetDisabled || restarting || resetting}
        style={{ color: 'rgb(var(--danger-6))' }}
      >
        {actionContent(
          t('team.agentActions.contextReset.title'),
          t('team.agentActions.contextReset.description'),
          contextResetDisabledReason
        )}
      </Menu.Item>
    </Menu>
  );

  return (
    <Dropdown trigger='click' droplist={menu} position='br' disabled={restarting || resetting}>
      <Tooltip content={t('team.agentActions.label')}>
        <Button
          type='text'
          size='mini'
          className='h-28px w-28px'
          loading={restarting || resetting}
          icon={<MoreOne theme='outline' size='14' fill='currentColor' />}
          aria-label={t('team.agentActions.label')}
        />
      </Tooltip>
    </Dropdown>
  );
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
    configOptionsPort: teamPermission?.configOptionsPort,
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
      disabled={runtimeConfig.isConfigOptionBlocked?.('model') ?? false}
      thoughtLevel={runtimeConfig.thoughtLevel}
      setStatus={runtimeConfig.setStatus}
      onSetThoughtLevel={handleThoughtLevelSetOption}
    />
  );
};

/** Teammate action & model controls rendered either in Row 2 (single view / 1-agent) or in the column header (parallel view) */
const TeamAgentControls: React.FC<{
  assistant: TeamAssistant;
  team_id: string;
  isLeader: boolean;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  teamRunView: TeamRunViewState;
  onRunStateStale: ReturnType<typeof useTeamRunView>['reconcile'];
  warmupStatus?: AcpWarmupStatus;
  fallbackAvailability: TeamContextResetAvailability;
  warmupDisabled?: boolean;
  conversation?: TChatConversation | null;
  onRuntimeChanged?: () => Promise<void>;
}> = ({
  assistant,
  team_id,
  isLeader,
  isFullscreen = false,
  onToggleFullscreen,
  teamRunView,
  onRunStateStale,
  warmupStatus,
  fallbackAvailability,
  warmupDisabled,
  conversation: propConversation,
  onRuntimeChanged: propOnRuntimeChanged,
}) => {
  const { t } = useTranslation();
  const layout = useLayoutContext();
  const teamPermission = useTeamPermission();
  const isMobile = layout?.isMobile ?? false;

  const { data: fetchedConversation, mutate: mutateConversation } = useSWR(
    !propConversation && assistant.conversation_id ? ['team-conversation', assistant.conversation_id] : null,
    () => getConversationOrNull(assistant.conversation_id)
  );
  const conversation = propConversation ?? fetchedConversation;

  const isAionrs = conversation?.type === 'aionrs';
  const initialModelId = (conversation?.extra as { current_model_id?: string })?.current_model_id;
  const isAcpLike = conversation?.type === 'acp' || isAcpLikeBackend(assistant.assistant_backend);
  const cronJobId = resolveCronJobId(conversation?.extra);

  const warmup = useMemo<{ status: AcpWarmupStatus; trigger?: () => Promise<void> }>(
    () => ({
      status: warmupStatus ?? (warmupDisabled ? 'dormant' : runtimeAvailabilityToWarmupStatus(fallbackAvailability)),
      trigger: warmupDisabled ? undefined : buildTeamRetryStartHandler({ team_id, slot_id: assistant.slot_id }),
    }),
    [warmupStatus, fallbackAvailability, warmupDisabled, team_id, assistant.slot_id]
  );
  const runtimeActionAvailability = resolveRuntimeActionAvailability({
    warmupStatus,
    warmupDisabled: Boolean(warmupDisabled),
    slotWork: teamRunView.slotWorkBySlot[assistant.slot_id],
    sessionStopped: teamRunView.sessionStopped,
    fallbackAvailability,
  });
  const restartDisabled = runtimeActionAvailability !== 'ready';
  const contextResetAvailability =
    assistant.role === 'leader'
      ? 'leader_not_targetable'
      : assistant.context_reset.supported
        ? runtimeActionAvailability
        : assistant.context_reset.availability;

  const handleRuntimeChanged = useCallback(async () => {
    if (propOnRuntimeChanged) {
      await propOnRuntimeChanged();
    } else {
      await Promise.all([mutateConversation(), onRunStateStale('context-reset.result')]);
    }
  }, [propOnRuntimeChanged, mutateConversation, onRunStateStale]);

  return (
    <div className='flex items-center gap-8px shrink-0'>
      {conversation && <CronJobManager conversation_id={conversation.id} cron_job_id={cronJobId} />}
      {!isMobile && assistant.conversation_id && !isAionrs && isAcpLike && (
        <div className='min-w-0 max-w-160px [&_button]:max-w-full [&_button_span]:truncate'>
          <AcpModelSelector
            key={assistant.conversation_id}
            conversation_id={assistant.conversation_id}
            backend={assistant.assistant_backend}
            initialModelId={initialModelId}
            prepareSetRuntime={teamPermission?.warmupSession}
            configOptionsPort={teamPermission?.configOptionsPort}
            warmup={warmup}
          />
        </div>
      )}
      {assistant.conversation_id && !isAionrs && isAcpLike && isLeader && (
        <div className='shrink-0'>
          <AcpRuntimeRestartButton
            conversation_id={assistant.conversation_id}
            team={{ team_id, slot_id: assistant.slot_id }}
            availability={restartDisabled ? 'initializing' : 'ready'}
            disabled={restartDisabled}
            disabledReason={
              restartDisabled ? t(contextResetAvailabilityMessageKey(runtimeActionAvailability)) : undefined
            }
          />
        </div>
      )}
      {assistant.conversation_id && !isAionrs && isAcpLike && !isLeader && (
        <div className='shrink-0'>
          <TeamAgentActions
            assistant={assistant}
            team_id={team_id}
            runtimeAvailability={runtimeActionAvailability}
            contextResetAvailability={contextResetAvailability}
            onRuntimeChanged={handleRuntimeChanged}
          />
        </div>
      )}
      {!isMobile && isAionrs && assistant.conversation_id && (
        <div className='min-w-0 max-w-160px [&_button]:max-w-full [&_button_span]:truncate'>
          <AionrsHeaderModelSelector
            key={assistant.conversation_id}
            conversation_id={assistant.conversation_id}
            initialModel={conversation?.model as TProviderWithModel | undefined}
          />
        </div>
      )}
      {onToggleFullscreen && (
        <Tooltip content={isFullscreen ? t('team.view.parallel') : t('team.view.single')} position='bottom'>
          <div
            className='shrink-0 flex items-center justify-center leading-none cursor-pointer hover:bg-[var(--fill-3)] p-4px rd-4px text-[color:var(--color-text-3)] hover:text-[color:var(--color-text-1)] transition-colors'
            onClick={() => onToggleFullscreen()}
          >
            {isFullscreen ? <OffScreen size='16' fill='currentColor' /> : <FullScreen size='16' fill='currentColor' />}
          </div>
        </Tooltip>
      )}
    </div>
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
  onTeamSlotPaused: ReturnType<typeof useTeamRunView>['applyLocalPause'];
  onRunStateStale: ReturnType<typeof useTeamRunView>['reconcile'];
  /** Teammate runtime status observed after subscribing to warmup events. */
  warmupStatus?: AcpWarmupStatus;
  /** Server-derived fallback used when the renderer subscribed after the runtime event. */
  fallbackAvailability: TeamContextResetAvailability;
  /** 整队 warming 期间为 true —— 此时不下发手动触发器。 */
  warmupDisabled?: boolean;
  /** 是否展示独立列头（单聊视图与单成员时隐藏，由顶部 Row 2 统一呈现） */
  showHeader?: boolean;
  onPromptSent?: (payload: { input: string; files?: ChatFileRef[]; slot_id?: string }) => void;
}> = React.memo(
  ({
    assistant,
    team_id,
    isLeader,
    color,
    isFullscreen = false,
    onToggleFullscreen,
    teamRunView,
    onTeamRunAck,
    onTeamSlotPaused,
    onRunStateStale,
    warmupStatus,
    fallbackAvailability,
    warmupDisabled,
    showHeader = true,
    onPromptSent,
  }) => {
    const { data: conversation, mutate: mutateConversation } = useSWR(
      assistant.conversation_id ? ['team-conversation', assistant.conversation_id] : null,
      () => getConversationOrNull(assistant.conversation_id)
    );

    const handleRuntimeChanged = useCallback(async () => {
      await Promise.all([mutateConversation(), onRunStateStale('context-reset.result')]);
    }, [mutateConversation, onRunStateStale]);

    const handleSlotRunStateStale = useCallback(() => onRunStateStale('pause.result'), [onRunStateStale]);

    return (
      <div
        className='flex flex-col h-full w-full min-w-0'
        style={{ background: `color-mix(in srgb, ${color} 4%, var(--bg-base))` }}
      >
        {showHeader && (
          <div className='flex items-center justify-between gap-8px px-12px h-36px shrink-0 border-b border-solid border-[color:var(--border-base)] relative z-10 bg-1'>
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
            <TeamAgentControls
              assistant={assistant}
              team_id={team_id}
              isLeader={isLeader}
              isFullscreen={isFullscreen}
              onToggleFullscreen={onToggleFullscreen}
              teamRunView={teamRunView}
              onRunStateStale={onRunStateStale}
              warmupStatus={warmupStatus}
              fallbackAvailability={fallbackAvailability}
              warmupDisabled={warmupDisabled}
              conversation={conversation}
              onRuntimeChanged={handleRuntimeChanged}
            />
          </div>
        )}
        <div className='relative flex flex-col flex-1 min-h-0 w-full min-w-0'>
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
              onTeamSlotPaused={onTeamSlotPaused}
              onRunStateStale={handleSlotRunStateStale}
              onPromptSent={onPromptSent}
            />
          ) : (
            <div className='flex flex-1 items-center justify-center'>
              <Spin loading />
            </div>
          )}
        </div>
      </div>
    );
  }
);

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
  const { assistants, activeSlotId, switchTab, colorOf, colorOfConversation, statusMap } = useTeamTabs();
  const [, messageContext] = Message.useMessage({ maxCount: 1 });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const assistantRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  // 视图模式（并行/单聊），按团队记忆。单聊 = 全屏当前选中成员。
  const [viewMode, setViewMode] = useTeamViewMode(team.id);
  const isSingleView = viewMode === 'single';
  const [taskEpoch, setTaskEpoch] = useState(0);

  const activeAssistant = assistants.find((assistant) => assistant.slot_id === activeSlotId);
  const leadAssistant = assistants.find((assistant) => assistant.role === 'leader');
  const teamRun = useTeamRunView(team.id);
  const watchdog = useTeamWatchdog({ team_id: team.id, teamRun, statusMap, assistants });

  // 进团队 warmup：以团队会话整体就绪为闸门（ensureSession resolve = 全员成功）。遮罩覆盖对话区。
  // runtimeStatus 是各成员逐个的真实唤醒信号，用于遮罩头像的「唤醒中→点亮」及失败态定位。
  // 仅在「唤醒进行中」禁用改成员；失败态（error/timeout）要放开，让用户能移除失败成员来自救。
  const isWarmingUp = warmupPhase === 'warming';
  const [isBrowserOpen, setIsBrowserOpen] = useState<boolean>(false);

  const { splitRatio: browserWidthPx, createDragHandle: createBrowserDragHandle } = useResizableSplit({
    unit: 'px',
    defaultWidth: 540,
    minWidth: 320,
    maxWidth: 960,
    storageKey: 'aionui-team-browser-width-px',
  });

  const leaderConversationId = leadAssistant?.conversation_id ?? '';
  const isLeaderAssistant = activeAssistant?.role === 'leader';
  const allConversationIds = useMemo(
    () => assistants.map((assistant) => assistant.conversation_id).filter(Boolean),
    [assistants]
  );
  const runtimeStartingConversationIds = useMemo(
    () =>
      new Set(
        assistants
          .filter((assistant) => teamRun.state.slotWorkBySlot[assistant.slot_id]?.blocked_reason === 'runtime_starting')
          .map((assistant) => assistant.conversation_id)
          .filter(Boolean)
      ),
    [assistants, teamRun.state.slotWorkBySlot]
  );

  // Fetch leader assistant's conversation for the workspace sider. Its
  // project_id (populated by the shared mapper) is the team's project.
  const { data: dispatchConversation, mutate: mutateDispatchConversation } = useSWR(
    leadAssistant?.conversation_id ? ['team-conversation', leadAssistant.conversation_id] : null,
    () => getConversationOrNull(leadAssistant!.conversation_id)
  );
  const leaderConversationIdForProject = leadAssistant?.conversation_id;
  // Prefer the synchronous list-snapshot project id for the leader conversation
  // so switching teams publishes the project immediately. `dispatchConversation`
  // is an async SWR fetch that previously lagged the switch, leaving the prior
  // team's Explorer tree painted until it resolved. Snapshot miss (cold start /
  // row not yet loaded) falls back to the fetched conversation's project_id.
  const snapshotTeamProjectId = leaderConversationIdForProject
    ? getSnapshotConversationProjectId(leaderConversationIdForProject)
    : undefined;
  const teamProjectId =
    snapshotTeamProjectId !== undefined ? snapshotTeamProjectId : (dispatchConversation?.project_id ?? null);

  // Publish the team's project so the Layout-level Explorer host renders it —
  // mirrors conversation/index.tsx (project-scoped, persistent across agent-tab
  // switches; the Explorer host does not remount within the same team/project).
  useEffect(() => {
    setCurrentProject(teamProjectId);
  }, [teamProjectId]);

  // Publish the active member column's conversation id so the Explorer's "add to
  // chat" targets the focused column's send box (activeSlotId defaults to the
  // leader; every column is a real agent conversation). Only meaningful once the
  // team is project-bound (host visible).
  useEffect(() => {
    setCurrentConversation(teamProjectId ? (activeAssistant?.conversation_id ?? null) : null);
  }, [teamProjectId, activeAssistant?.conversation_id]);

  // Backfill catch-up: the leader conversation lazily backfills its project_id on
  // resume and the backend emits one `conversation.listChanged` when it lands;
  // refetch the leader conversation so the populated project_id flows through.
  // (Same responsive path as conversation/index.tsx — no polling.)
  useEffect(() => {
    if (!leaderConversationIdForProject) return;
    return ipcBridge.conversation.listChanged.on((event) => {
      if (event.conversation_id !== leaderConversationIdForProject) return;
      if (event.action !== 'updated' && event.action !== 'created') return;
      void mutateDispatchConversation();
    });
  }, [leaderConversationIdForProject, mutateDispatchConversation]);

  // Use team workspace if specified, otherwise fall back to leader assistant's conversation workspace (temp workspace)
  const teamWorkspaceView = resolveTeamWorkspaceView(
    team.workspace,
    (dispatchConversation?.extra as { workspace?: string } | undefined)?.workspace
  );
  const effectiveWorkspace = teamWorkspaceView.workspacePath;
  // For project teams the file panel is the Layout-level Explorer host (gated on
  // project_id), so ChatLayout's own workspace sider is disabled — mirrors
  // ChatConversation's `workspaceEnabled && !project_id`.
  const workspaceEnabled = teamWorkspaceView.workspaceEnabled && !teamProjectId;
  // Team is "user-picked" only when team.workspace was explicitly set at team
  // creation. Falling back to a leader assistant's auto-temp workspace counts as
  // temporary, mirroring single-chat behavior.
  const isTeamWorkspaceTemporary = teamWorkspaceView.isTemporaryWorkspace;

  // Mirror conversation/index.tsx: close preview only when the isolation scope
  // changes, keep it open when switching between teams that share the same scope.
  // Scope is project (falling back to workspace until the leader conversation's
  // project_id is populated).
  const { closePreviewIfScopeChanged } = usePreviewContext();
  useEffect(() => {
    closePreviewIfScopeChanged(previewScopeKey(teamProjectId, effectiveWorkspace ?? null));
  }, [teamProjectId, effectiveWorkspace, closePreviewIfScopeChanged]);

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

  const handleExitFullscreen = useCallback(() => setViewMode('parallel'), [setViewMode]);

  // Keyboard navigation: Alt+Left / Alt+Right to cycle through members
  useEffect(() => {
    if (assistants.length <= 1) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = (target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) {
        return;
      }
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        scrollToPrev();
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        scrollToNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [assistants.length, scrollToPrev, scrollToNext]);

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

  const isSingle = isSingleView || assistants.length === 1;
  const currentAssistant =
    assistants.find((candidate) => candidate.slot_id === activeSlotId) ?? leadAssistant ?? assistants[0];
  const isCurrentLeader = currentAssistant ? currentAssistant.slot_id === leadAssistant?.slot_id : false;

  const rightControls =
    isSingle && currentAssistant ? (
      <TeamAgentControls
        key={currentAssistant.slot_id}
        assistant={currentAssistant}
        team_id={team.id}
        isLeader={isCurrentLeader}
        isFullscreen={isSingleView}
        onToggleFullscreen={assistants.length > 1 ? () => setViewMode(isSingleView ? 'parallel' : 'single') : undefined}
        teamRunView={teamRun.state}
        onRunStateStale={teamRun.reconcile}
        warmupStatus={warmupRuntimeStatus.get(currentAssistant.slot_id)?.status}
        fallbackAvailability={
          isCurrentLeader ? teamWarmupPhaseAvailability(warmupPhase) : currentAssistant.context_reset.availability
        }
        warmupDisabled={isWarmingUp}
      />
    ) : undefined;

  const tabsSlot = useMemo(
    () => (
      <TeamTabs
        onTabClick={handleTabClick}
        pendingCounts={slotPendingCounts}
        warmingUp={isWarmingUp}
        failedSlotIds={warmupFailedSlotIds}
        rightSlot={rightControls}
      />
    ),
    [handleTabClick, slotPendingCounts, isWarmingUp, warmupFailedSlotIds, rightControls]
  );

  const activeMembersSlot = useMemo(
    () => (
      <TeamActiveMembers
        assistants={assistants}
        statusMap={statusMap}
        activeSlotId={activeSlotId}
        colorOf={colorOf}
        onSelectMember={handleTabClick}
        slotWorkBySlot={teamRun.state.slotWorkBySlot}
      />
    ),
    [assistants, statusMap, activeSlotId, colorOf, handleTabClick, teamRun.state.slotWorkBySlot]
  );

  return (
    <TeamPermissionProvider
      team_id={team.id}
      isLeaderAgent={isLeaderAssistant}
      leaderConversationId={leaderConversationId}
      allConversationIds={allConversationIds}
      runtimeStartingConversationIds={runtimeStartingConversationIds}
    >
      <TeamIdentityProvider colorOfConversation={colorOfConversation}>
        {messageContext}
        <ChatLayout
          title={team.name}
          titleExtra={activeMembersSlot}
          siderTitle={siderTitle}
          sider={sider}
          workspaceEnabled={workspaceEnabled}
          previewHosted={Boolean(teamProjectId)}
          tabsSlot={tabsSlot}
          conversation_id={undefined}
          agent_name={undefined}
          workspacePath={effectiveWorkspace}
          isTemporaryWorkspace={isTeamWorkspaceTemporary}
          workspacePreferenceKey={team.id}
          onRenameTitle={onRenameTeam}
          headerExtra={
            <div className='flex items-center gap-10px'>
              {assistants.length > 1 ? <TeamViewToggle value={viewMode} onChange={setViewMode} /> : undefined}
              <TeamWatchdogToggle
                intervalMs={watchdog.intervalMs}
                onChangeInterval={watchdog.setIntervalMs}
                onCheckAndRetryNow={watchdog.checkAndRetryNow}
                isMonitoring={watchdog.isMonitoring}
                isRecovering={watchdog.isRecovering}
              />
              <Tooltip content={t('conversation.browser.title', 'Browser')} position='bottom'>
                <Button
                  size='small'
                  type={isBrowserOpen ? 'primary' : 'secondary'}
                  icon={<Browser theme='outline' size='14' />}
                  onClick={() => setIsBrowserOpen((prev) => !prev)}
                />
              </Tooltip>
              <TeamNewTaskButton
                team={team}
                teamRunView={teamRun.state}
                onTaskReset={() => {
                  setTaskEpoch((prev) => prev + 1);
                  void mutateDispatchConversation();
                }}
              />
            </div>
          }
          headerLeading={
            <span className='inline-flex w-24px h-24px rounded-6px bg-fill-2 items-center justify-center shrink-0 leading-none text-t-primary border border-solid border-[color:var(--border-base)]'>
              <Peoples theme='outline' size='14' fill='currentColor' style={{ lineHeight: 0 }} />
            </span>
          }
        >
          <div className='relative flex flex-row flex-1 h-full w-full overflow-hidden'>
            <div className='relative flex flex-col flex-1 h-full min-w-0 overflow-hidden'>
              <TeamWarmupOverlay
                phase={warmupPhase}
                assistants={assistants}
                runtimeStatus={warmupRuntimeStatus}
                colorOf={colorOf}
                onRetry={onRetryWarmup}
              />
              {viewMode === 'board' ? (
                // 看板视图：只读展现全队 mailbox 与 task-board。
                <div className='flex-1 h-full min-w-0'>
                  <TeamActivityView team={team} />
                </div>
              ) : isSingleView ? (
                // 单聊视图：全屏显示当前选中成员（activeSlotId），找不到时回退到 Leader。
                // 左右导航箭头让用户在多个成员之间切换，解决单聊视图下成员不可见的问题。
                (() => {
                  const activeIdx = assistants.findIndex((a) => a.slot_id === activeSlotId);
                  const hasPrev = assistants.length > 1 && activeIdx > 0;
                  const hasNext = assistants.length > 1 && activeIdx < assistants.length - 1;
                  const currentSlotId = currentAssistant?.slot_id ?? activeSlotId;
                  return (
                    <div className='flex-1 h-full w-full min-w-0 relative'>
                      {/* Prev member arrow — single view */}
                      {hasPrev && (
                        <Tooltip content={`${t('team.prevMember')} (Alt+←)`} position='right'>
                          <div
                            className='absolute start-0 top-0 bottom-0 w-48px z-20 flex items-center justify-center cursor-pointer group'
                            style={{ background: 'linear-gradient(90deg, var(--color-bg-1) 40%, transparent)' }}
                            onClick={scrollToPrev}
                          >
                            <div
                              className='w-32px h-32px rd-full flex items-center justify-center transition-transform duration-150 group-hover:scale-110'
                              style={{
                                background: 'var(--color-bg-3)',
                                border: '1.5px solid var(--color-border-2)',
                                lineHeight: 0,
                              }}
                            >
                              <Left size='18' fill='currentColor' style={{ color: 'var(--color-text-1)' }} />
                            </div>
                          </div>
                        </Tooltip>
                      )}
                      {assistants.map((assistant) => {
                        const isCurrentSlot = assistant.slot_id === currentSlotId;
                        const isLeaderSlot = assistant.slot_id === leadAssistant?.slot_id;
                        return (
                          <div
                            key={`${assistant.slot_id}-${taskEpoch}`}
                            className='h-full w-full flex flex-col min-w-0'
                            style={{ display: isCurrentSlot ? 'flex' : 'none' }}
                          >
                            <AssistantChatSlot
                              assistant={assistant}
                              team_id={team.id}
                              isLeader={isLeaderSlot}
                              color={colorOf(assistant.slot_id)}
                              isFullscreen
                              onToggleFullscreen={handleExitFullscreen}
                              teamRunView={teamRun.state}
                              onTeamRunAck={teamRun.applyAck}
                              onTeamSlotPaused={teamRun.applyLocalPause}
                              onRunStateStale={teamRun.reconcile}
                              warmupStatus={warmupRuntimeStatus.get(assistant.slot_id)?.status}
                              fallbackAvailability={
                                isLeaderSlot
                                  ? teamWarmupPhaseAvailability(warmupPhase)
                                  : assistant.context_reset.availability
                              }
                              warmupDisabled={isWarmingUp}
                              showHeader={false}
                              onPromptSent={watchdog.recordSentPrompt}
                            />
                          </div>
                        );
                      })}
                      {/* Next member arrow — single view */}
                      {hasNext && (
                        <Tooltip content={`${t('team.nextMember')} (Alt+→)`} position='left'>
                          <div
                            className='absolute end-0 top-0 bottom-0 w-48px z-20 flex items-center justify-center cursor-pointer group'
                            style={{ background: 'linear-gradient(270deg, var(--color-bg-1) 40%, transparent)' }}
                            onClick={scrollToNext}
                          >
                            <div
                              className='w-32px h-32px rd-full flex items-center justify-center transition-transform duration-150 group-hover:scale-110'
                              style={{
                                background: 'var(--color-bg-3)',
                                border: '1.5px solid var(--color-border-2)',
                                lineHeight: 0,
                              }}
                            >
                              <Right size='18' fill='currentColor' style={{ color: 'var(--color-text-1)' }} />
                            </div>
                          </div>
                        </Tooltip>
                      )}
                    </div>
                  );
                })()
              ) : (
                <>
                  {showLeftArrow && (
                    <Tooltip content={`${t('team.prevMember')} (Alt+←)`} position='right'>
                      <div
                        className='absolute start-0 top-0 bottom-0 w-48px z-20 flex items-center justify-center cursor-pointer group'
                        style={{ background: 'linear-gradient(90deg, var(--color-bg-1) 40%, transparent)' }}
                        onClick={scrollToPrev}
                      >
                        <div
                          className='w-32px h-32px rd-full flex items-center justify-center transition-transform duration-150 group-hover:scale-110'
                          style={{
                            background: 'var(--color-bg-3)',
                            border: '1.5px solid var(--color-border-2)',
                            lineHeight: 0,
                          }}
                        >
                          <Left size='18' fill='currentColor' style={{ color: 'var(--color-text-1)' }} />
                        </div>
                      </div>
                    </Tooltip>
                  )}
                  <div
                    ref={scrollContainerRef}
                    className='flex h-full w-full overflow-x-auto overflow-y-hidden [scrollbar-width:none]'
                    style={{ scrollSnapType: 'x proximity' }}
                  >
                    {assistants.map((assistant, index) => {
                      const isSingleCol = assistants.length <= 2;
                      const isLeaderSlot = assistant.slot_id === leadAssistant?.slot_id;
                      const isLastColumn = index === assistants.length - 1;
                      return (
                        <div
                          key={`${assistant.slot_id}-${taskEpoch}`}
                          ref={(el) => {
                            assistantRefs.current[assistant.slot_id] = el;
                          }}
                          data-slot-id={assistant.slot_id}
                          data-role={isLeaderSlot ? 'leader' : 'member'}
                          // 列间灰色隔离线：除最后一列外，右侧加一条分隔线，避免多列浅底粘连看不清边界。
                          className={`relative h-full ${isLastColumn ? '' : 'border-e border-solid border-[color:var(--border-base)]'}`}
                          style={{
                            // Always flex-grow to fill available space; each slot starts at 400px
                            // basis so the layout is stable, but spare room is distributed evenly
                            // instead of leaving empty gaps to the right. When the team is wider
                            // than the viewport we preserve the 400px floor (prevents shrinking
                            // into unreadable cards) so horizontal scroll kicks in naturally.
                            flex: '1 1 400px',
                            minWidth: isSingleCol ? '240px' : '400px',
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
                            onTeamSlotPaused={teamRun.applyLocalPause}
                            onRunStateStale={teamRun.reconcile}
                            warmupStatus={warmupRuntimeStatus.get(assistant.slot_id)?.status}
                            fallbackAvailability={
                              isLeaderSlot
                                ? teamWarmupPhaseAvailability(warmupPhase)
                                : assistant.context_reset.availability
                            }
                            warmupDisabled={isWarmingUp}
                            showHeader={assistants.length > 1}
                            onPromptSent={watchdog.recordSentPrompt}
                          />
                        </div>
                      );
                    })}
                  </div>
                  {showRightArrow && (
                    <Tooltip content={`${t('team.nextMember')} (Alt+→)`} position='left'>
                      <div
                        className='absolute end-0 top-0 bottom-0 w-48px z-20 flex items-center justify-center cursor-pointer group'
                        style={{ background: 'linear-gradient(270deg, var(--color-bg-1) 40%, transparent)' }}
                        onClick={scrollToNext}
                      >
                        <div
                          className='w-32px h-32px rd-full flex items-center justify-center transition-transform duration-150 group-hover:scale-110'
                          style={{
                            background: 'var(--color-bg-3)',
                            border: '1.5px solid var(--color-border-2)',
                            lineHeight: 0,
                          }}
                        >
                          <Right size='18' fill='currentColor' style={{ color: 'var(--color-text-1)' }} />
                        </div>
                      </div>
                    </Tooltip>
                  )}
                </>
              )}
            </div>
            <div
              className='relative flex flex-col h-full bg-[var(--color-bg-2)] border-l border-[var(--color-border-2)]'
              style={{
                display: isBrowserOpen ? 'flex' : 'none',
                width: `${browserWidthPx}px`,
                minWidth: '320px',
                maxWidth: '85%',
              }}
            >
              {createBrowserDragHandle({
                className: 'absolute top-0 bottom-0 z-30 cursor-col-resize',
                style: { width: '8px', left: '-4px' },
                linePlacement: 'start',
                reverse: true,
              })}
              <BrowserPanel
                initialUrl='https://www.google.com'
                visible={isBrowserOpen}
                onClose={() => setIsBrowserOpen(false)}
              />
            </div>
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
