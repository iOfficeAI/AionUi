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

const isRunProcessing = (runView: TeamRunViewState): boolean => {
  const run = runView.activeRun;
  if (!run) return false;
  const statusProcessing = run.status === 'accepted' || run.status === 'running' || run.status === 'cancelling';
  const workProcessing = run.pending_wake_count > 0 || run.starting_child_count > 0 || run.active_child_count > 0;
  return statusProcessing || workProcessing;
};

const isChildProcessing = (runView: TeamRunViewState, slot_id: string): boolean => {
  const status = runView.childTurnsBySlot[slot_id]?.status;
  return status === 'accepted' || status === 'running' || status === 'cancelling';
};

export const buildTeamSendRuntime = ({
  slot_id,
  isLeader,
  runView,
  onStop,
}: BuildTeamSendRuntimeOptions): TeamSendBoxRuntime => {
  const processing = isLeader ? isRunProcessing(runView) : isChildProcessing(runView, slot_id);
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
