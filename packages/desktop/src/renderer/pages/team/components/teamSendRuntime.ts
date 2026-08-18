import { ipcBridge } from '@/common';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type { ConversationCommandQueueRuntimeGate } from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';
import type { ITeamSlotWork, TeamSlotBlockedReason } from '@/common/types/team/teamTypes';
import type { ChatFileRef } from '@/common/types/chatFile';
import type { TeamRunReconcileResult, TeamRunViewState } from '../hooks/useTeamRunView';

export type TeamSendBoxRuntime = {
  runtimeGate: ConversationCommandQueueRuntimeGate;
  loading: boolean;
  queuedCount: number;
  statusText?: string;
  startedAtMs: number | null;
  onStop?: () => Promise<void>;
  onInterruptSend?: (payload: { input: string; files: ChatFileRef[] }) => Promise<void>;
  /**
   * Present only when the slot is in `runtime_failed`; triggers a directed
   * per-member attach retry (NOT warmupSession/ensure_session).
   */
  onRetryStart?: () => Promise<void>;
  /** True when this slot is the team's active/selected tab; drives sendbox focus. */
  isActive?: boolean;
  /** Called when this slot's sendbox gains focus, to sync tab selection. */
  onFocus?: () => void;
};

/**
 * Build the send-box "retry start" handler. Calls the directed per-member
 * attach route so a single failed teammate runtime is retried in place,
 * without re-running the whole-team ensure/warmup.
 */
export const buildTeamRetryStartHandler =
  ({ team_id, slot_id }: { team_id: string; slot_id: string }): (() => Promise<void>) =>
  async () => {
    await ipcBridge.team.attachAgent.invoke({ team_id, slot_id });
  };

type BuildTeamSendRuntimeOptions = {
  slot_id: string;
  runView: TeamRunViewState;
  statusText?: string;
  onStop?: () => Promise<void>;
  /**
   * True when the team session was idle-reclaimed (see
   * `TeamRunViewState.sessionStopped`). Stopped is recoverable-and-sendable: the
   * next send triggers lazy recovery, so the gate stays open and no spinner is
   * shown, regardless of any stale `session_stopped` slot work.
   */
  sessionStopped?: boolean;
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
  onStopSucceeded?: () => void;
  onStopFailed?: () => void;
  onRunStateStale?: () => Promise<TeamRunReconcileResult>;
};

// `session_stopped` is intentionally NOT fatal: an idle-reclaimed session is
// recoverable and must stay sendable so the lazy-recovery send path can fire.
// A stale `session_stopped` slot still shows the stopped status text (see
// `buildTeamWorkStatusText`) but no longer blocks sending.
const FATAL_BLOCK_REASONS = new Set<TeamSlotBlockedReason>(['runtime_failed', 'removing']);

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

const isTeamWorkProcessing = (work?: ITeamSlotWork): boolean => {
  if (work?.state === 'starting' || work?.state === 'running') return true;
  return work?.state === 'queued' && getTeamWorkQueuedCount(work) > 0;
};

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

  if (work?.state === 'paused') return undefined;

  const queuedCount = getTeamWorkQueuedCount(work);
  if (work?.state === 'starting' || work?.state === 'running') {
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
  onStopSucceeded,
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
      onStopSucceeded?.();
      void onRunStateStale?.();
    } catch (error) {
      console.warn('[TeamChatView] pause slot work failed', error);
      if (isStaleTeamRunPauseError(error)) {
        const reconciled = await onRunStateStale?.();
        if (!reconciled || reconciled === 'failed') onStopFailed?.();
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
  sessionStopped,
}: BuildTeamSendRuntimeOptions): TeamSendBoxRuntime => {
  const work = runView.slotWorkBySlot[slot_id];
  const queuedCount = getTeamWorkQueuedCount(work);
  const fatalBlock = work?.blocked_reason ? FATAL_BLOCK_REASONS.has(work.blocked_reason) : false;
  // Stopped session: force the recoverable-stopped shape — keep the gate open
  // and suppress the spinner, overriding any residual fatal block or active work.
  const effectiveFatalBlock = sessionStopped ? false : fatalBlock;
  const loading = sessionStopped ? false : !fatalBlock && isTeamWorkProcessing(work);
  return {
    loading,
    queuedCount,
    statusText,
    startedAtMs: work?.active_turn_started_at_ms ?? null,
    runtimeGate: {
      hydrated: true,
      canSendMessage: !effectiveFatalBlock,
      isProcessing: false,
    },
    onStop,
  };
};
