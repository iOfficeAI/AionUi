import type { ConversationCommandQueueRuntimeGate } from '@/renderer/pages/conversation/platforms/useConversationCommandQueue';
import type { TeamRunViewState } from '../hooks/useTeamRunView';

export type TeamSendBoxRuntime = {
  runtimeGate: ConversationCommandQueueRuntimeGate;
  loading: boolean;
  onStop?: () => Promise<void>;
};

type BuildTeamSendRuntimeOptions = {
  slot_id: string;
  isLeader: boolean;
  runView: TeamRunViewState;
  onStop?: () => Promise<void>;
};

const isSlotWorkProcessing = (runView: TeamRunViewState, slot_id: string): boolean => {
  const work = runView.slotWorkBySlot[slot_id];
  if (work?.paused) return false;

  const hasSlotWork =
    Boolean(work?.active_turn_id) ||
    (work?.pending_wake_count ?? 0) > 0 ||
    (work?.starting_child_count ?? 0) > 0;
  if (hasSlotWork) return true;

  const childStatus = runView.childTurnsBySlot[slot_id]?.status;
  return childStatus === 'accepted' || childStatus === 'running' || childStatus === 'cancelling';
};

export const buildTeamSendRuntime = ({
  slot_id,
  runView,
  onStop,
}: BuildTeamSendRuntimeOptions): TeamSendBoxRuntime => {
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
