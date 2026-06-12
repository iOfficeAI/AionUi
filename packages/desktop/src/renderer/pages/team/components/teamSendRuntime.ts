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
  const status = runView.activeRun?.status;
  return status === 'accepted' || status === 'running' || status === 'cancelling';
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
