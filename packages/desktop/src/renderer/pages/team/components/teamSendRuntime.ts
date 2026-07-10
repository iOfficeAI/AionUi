import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { ConversationCommandQueueRuntimeGate } from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';
import type { TeamSlotBlockedReason } from '@/common/types/team/teamTypes';
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
  const queuedCount = (work?.queued_foreground_count ?? 0) + (work?.queued_background_count ?? 0);
  const fatalBlock = work?.blocked_reason ? FATAL_BLOCK_REASONS.has(work.blocked_reason) : false;
  const loading = work?.state === 'starting' || work?.state === 'running';
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
