import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { ConversationCommandQueueRuntimeGate } from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';
import type { ITeamSlotWork, TeamSlotBlockedReason } from '@/common/types/team/teamTypes';
import type { TeamRunViewState } from '../hooks/useTeamRunView';

export type TeamSendBoxRuntime = {
  runtimeGate: ConversationCommandQueueRuntimeGate;
  loading: boolean;
  queuedCount: number;
  statusText?: string;
  onStop?: () => Promise<void>;
};

type BuildTeamSendRuntimeOptions = {
  slot_id: string;
  runView: TeamRunViewState;
  statusText?: string;
  onStop?: () => Promise<void>;
};

type PauseSlotWorkParams = {
  team_id: string;
  team_run_id: string;
  slot_id: string;
  reason: 'user_stop';
};

type BuildTeamStopHandlerOptions = {
  team_id: string;
  slot_id: string;
  runView: TeamRunViewState;
  pauseSlotWork: (params: PauseSlotWorkParams) => Promise<void>;
  onStopFailed?: () => void;
  onRunStateStale?: () => Promise<boolean>;
};

const FATAL_BLOCK_REASONS = new Set<TeamSlotBlockedReason>(['runtime_failed', 'removing', 'session_stopped']);

type TeamWorkStatusTextFormatters = {
  processing: () => string;
  processingWithQueued: (count: number) => string;
  runtimeStarting: () => string;
  runtimeFailed: () => string;
  removing: () => string;
  sessionStopped: () => string;
};

export const getTeamWorkQueuedCount = (work?: ITeamSlotWork): number =>
  (work?.queued_foreground_count ?? 0) + (work?.queued_background_count ?? 0);

const hasActiveTeamWork = (work?: ITeamSlotWork): boolean => work?.state === 'starting' || work?.state === 'running';

export const buildTeamWorkStatusText = (
  work: ITeamSlotWork | undefined,
  format: TeamWorkStatusTextFormatters
): string | undefined => {
  switch (work?.blocked_reason) {
    case 'runtime_starting':
      return format.runtimeStarting();
    case 'runtime_failed':
      return format.runtimeFailed();
    case 'removing':
      return format.removing();
    case 'session_stopped':
      return format.sessionStopped();
    default:
      break;
  }

  const queuedCount = getTeamWorkQueuedCount(work);
  if (hasActiveTeamWork(work)) {
    return queuedCount > 0 ? format.processingWithQueued(queuedCount) : undefined;
  }

  if (queuedCount > 0) {
    return format.processing();
  }

  return undefined;
};

export const isStaleTeamRunPauseError = (error: unknown): boolean => {
  return (
    isBackendHttpError(error) &&
    error.status === 400 &&
    error.code === 'BAD_REQUEST' &&
    (error.backendMessage.includes('no active team run to pause') || error.backendMessage.includes('is not active'))
  );
};

export const buildTeamStopHandler = ({
  team_id,
  slot_id,
  runView,
  pauseSlotWork,
  onStopFailed,
  onRunStateStale,
}: BuildTeamStopHandlerOptions): (() => Promise<void>) => {
  return async () => {
    const activeRun = runView.activeRun;
    if (!activeRun) return;

    const work = runView.slotWorkBySlot[slot_id];
    const hasSlotWork =
      Boolean(work?.active_turn_id) ||
      (work?.queued_foreground_count ?? 0) > 0 ||
      (work?.queued_background_count ?? 0) > 0 ||
      work?.state === 'starting' ||
      work?.state === 'running' ||
      work?.state === 'paused';
    if (!hasSlotWork) return;

    try {
      await pauseSlotWork({
        team_id,
        team_run_id: activeRun.team_run_id,
        slot_id,
        reason: 'user_stop',
      });
    } catch (error) {
      console.warn('[TeamChatView] pause slot work failed', error);
      if (isStaleTeamRunPauseError(error)) {
        const reconciled = await onRunStateStale?.();
        if (!reconciled) onStopFailed?.();
        return;
      }
      onStopFailed?.();
    }
  };
};

export const buildTeamSendRuntime = ({
  slot_id,
  runView,
  statusText,
  onStop,
}: BuildTeamSendRuntimeOptions): TeamSendBoxRuntime => {
  const work = runView.slotWorkBySlot[slot_id];
  const queuedCount = getTeamWorkQueuedCount(work);
  const fatalBlock = work?.blocked_reason ? FATAL_BLOCK_REASONS.has(work.blocked_reason) : false;
  const loading = hasActiveTeamWork(work) || (!fatalBlock && queuedCount > 0);
  return {
    loading,
    queuedCount,
    statusText,
    runtimeGate: {
      hydrated: true,
      canSendMessage: !fatalBlock,
      isProcessing: false,
    },
    onStop,
  };
};
