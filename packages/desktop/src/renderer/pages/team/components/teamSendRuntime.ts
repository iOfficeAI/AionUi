import type { ConversationCommandQueueRuntimeGate } from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';
import type { TeamRunViewState } from '../hooks/useTeamRunView';

export type TeamSendBoxRuntime = {
  runtimeGate: ConversationCommandQueueRuntimeGate;
  loading: boolean;
  onStop?: () => Promise<void>;
};

type BuildTeamSendRuntimeOptions = {
  slot_id: string;
  runView: TeamRunViewState;
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
};

const isSlotWorkProcessing = (runView: TeamRunViewState, slot_id: string): boolean => {
  const work = runView.slotWorkBySlot[slot_id];
  if (work?.paused) return false;

  const hasSlotWork =
    Boolean(work?.active_turn_id) || (work?.pending_wake_count ?? 0) > 0 || (work?.starting_child_count ?? 0) > 0;
  if (hasSlotWork) return true;

  const childStatus = runView.childTurnsBySlot[slot_id]?.status;
  return childStatus === 'accepted' || childStatus === 'running' || childStatus === 'cancelling';
};

export const buildTeamStopHandler = ({
  team_id,
  slot_id,
  runView,
  pauseSlotWork,
  onStopFailed,
}: BuildTeamStopHandlerOptions): (() => Promise<void>) => {
  return async () => {
    const activeRun = runView.activeRun;
    if (!activeRun) return;

    const work = runView.slotWorkBySlot[slot_id];
    const hasSlotWork =
      Boolean(runView.childTurnsBySlot[slot_id]) ||
      Boolean(work?.active_turn_id) ||
      (work?.starting_child_count ?? 0) > 0 ||
      (work?.pending_wake_count ?? 0) > 0 ||
      (work?.suppressed_wake_count ?? 0) > 0;
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
      onStopFailed?.();
    }
  };
};

export const buildTeamSendRuntime = ({ slot_id, runView, onStop }: BuildTeamSendRuntimeOptions): TeamSendBoxRuntime => {
  const processing = isSlotWorkProcessing(runView, slot_id);
  return {
    loading: processing,
    runtimeGate: {
      hydrated: true,
      canSendMessage: !processing,
      isProcessing: processing,
    },
    onStop,
  };
};
