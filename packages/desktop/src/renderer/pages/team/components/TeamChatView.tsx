import { ipcBridge } from '@/common';
import type { IProvider, TChatConversation, TProviderWithModel } from '@/common/config/storage';
import { Spin } from '@arco-design/web-react';
import React, { Suspense, useCallback } from 'react';
import { useAionrsModelSelection } from '@/renderer/pages/conversation/platforms/aionrs/useAionrsModelSelection';
import { saveAionrsDefaultModel } from '@/renderer/pages/guid/hooks/agentSelectionUtils';
import { isLegacyReadOnlyConversationType } from '@/renderer/pages/conversation/utils/conversationRuntime';
import type { ITeamRunAck } from '@/common/types/team/teamTypes';
import { buildTeamSendRuntime } from './teamSendRuntime';
import type { TeamRunViewState } from '../hooks/useTeamRunView';
import TeamChatEmptyState from './TeamChatEmptyState';

const AcpChat = React.lazy(() => import('@/renderer/pages/conversation/platforms/acp/AcpChat'));
const AionrsChat = React.lazy(() => import('@/renderer/pages/conversation/platforms/aionrs/AionrsChat'));
const LegacyReadOnlyConversation = React.lazy(
  () => import('@/renderer/pages/conversation/platforms/legacy/LegacyReadOnlyConversation')
);

// Narrow to Aionrs conversations so model field is always available
type AionrsConversation = Extract<TChatConversation, { type: 'aionrs' }>;
type TeamSendOverride = (payload: { input: string; files: string[] }) => Promise<void>;
const EMPTY_TEAM_RUN_VIEW: TeamRunViewState = {
  activeRun: undefined,
  childTurnsBySlot: {},
};

/** Aionrs sub-component manages model selection state without adding a ChatLayout wrapper */
const AionrsTeamChat: React.FC<{
  conversation: AionrsConversation;
  emptySlot?: React.ReactNode;
  agent_name?: string;
  teamSendMessage?: TeamSendOverride;
  teamRuntime?: ReturnType<typeof buildTeamSendRuntime>;
}> = ({ conversation, emptySlot, agent_name, teamSendMessage, teamRuntime }) => {
  const onSelectModel = useCallback(
    async (_provider: IProvider, modelName: string) => {
      const selected = { ..._provider, use_model: modelName } as TProviderWithModel;
      const ok = await ipcBridge.conversation.update.invoke({ id: conversation.id, updates: { model: selected } });
      if (ok) void saveAionrsDefaultModel(_provider.id, modelName);
      return Boolean(ok);
    },
    [conversation.id]
  );

  const modelSelection = useAionrsModelSelection({ initialModel: conversation.model, onSelectModel });

  return (
    <AionrsChat
      conversation_id={conversation.id}
      workspace={conversation.extra.workspace}
      modelSelection={modelSelection}
      emptySlot={emptySlot}
      agent_name={agent_name}
      teamSendMessage={teamSendMessage}
      teamRuntime={teamRuntime}
    />
  );
};

type TeamChatViewProps = {
  conversation: TChatConversation;
  hideSendBox?: boolean;
  /** When set, shows the team greeting empty state */
  team_id?: string;
  slot_id?: string;
  agent_name?: string;
  agent_icon?: string;
  isLeader?: boolean;
  teamRunView?: TeamRunViewState;
  onTeamRunAck?: (ack: ITeamRunAck) => void;
};

/**
 * Routes to the correct platform chat component based on conversation type.
 * Does NOT wrap in ChatLayout — that is done by the parent TeamPage.
 */
const TeamChatView: React.FC<TeamChatViewProps> = ({
  conversation,
  hideSendBox,
  team_id,
  slot_id,
  agent_name,
  agent_icon,
  isLeader,
  teamRunView = EMPTY_TEAM_RUN_VIEW,
  onTeamRunAck,
}) => {
  // Single source of truth for the team greeting. Each *Chat simply forwards `emptySlot`
  // to MessageList; the empty state itself reads team_id / backend / preset info from the
  // shared SWR-cached conversation record, so none of that needs to flow through props.
  const resolvedHideSendBox = hideSendBox || isLegacyReadOnlyConversationType(conversation.type);
  const emptySlot = team_id ? (
    <TeamChatEmptyState conversation_id={conversation.id} icon={agent_icon} isLeader={isLeader} />
  ) : undefined;
  const teamSendMessage = useCallback<TeamSendOverride>(
    async ({ input, files }) => {
      if (!team_id) throw new Error('Missing team id for team send');
      if (isLeader) {
        const ack = await ipcBridge.team.sendMessage.invoke({ team_id, input, files });
        onTeamRunAck?.(ack);
        return;
      }
      if (!slot_id) throw new Error('Missing slot id for team agent send');
      const ack = await ipcBridge.team.sendMessageToAgent.invoke({ team_id, slot_id, input, files });
      onTeamRunAck?.(ack);
    },
    [isLeader, onTeamRunAck, slot_id, team_id]
  );
  const teamSendMessageOverride = team_id ? teamSendMessage : undefined;
  const teamRuntime =
    team_id && slot_id
      ? buildTeamSendRuntime({
          slot_id,
          isLeader: Boolean(isLeader),
          runView: teamRunView,
          onStop: async () => {
            const activeRun = teamRunView.activeRun;
            if (!activeRun) return;
            if (isLeader) {
              await ipcBridge.team.cancelRun.invoke({
                team_id,
                team_run_id: activeRun.team_run_id,
                target_slot_id: slot_id,
              });
              return;
            }
            if (!teamRunView.childTurnsBySlot[slot_id]) return;
            await ipcBridge.team.cancelChildTurn.invoke({
              team_id,
              team_run_id: activeRun.team_run_id,
              slot_id,
            });
          },
        })
      : undefined;
  const content = (() => {
    if (isLegacyReadOnlyConversationType(conversation.type)) {
      return <LegacyReadOnlyConversation key={conversation.id} conversation={conversation} emptySlot={emptySlot} />;
    }

    switch (conversation.type) {
      case 'acp':
        return (
          <AcpChat
            key={conversation.id}
            conversation_id={conversation.id}
            workspace={conversation.extra?.workspace}
            backend={conversation.extra?.backend || 'claude'}
            session_mode={conversation.extra?.session_mode}
            agent_name={agent_name ?? (conversation.extra as { agent_name?: string })?.agent_name}
            hideSendBox={resolvedHideSendBox}
            emptySlot={emptySlot}
            teamSendMessage={teamSendMessageOverride}
            teamRuntime={teamRuntime}
          />
        );
      case 'aionrs':
        return (
          <AionrsTeamChat
            key={conversation.id}
            conversation={conversation as AionrsConversation}
            emptySlot={emptySlot}
            agent_name={agent_name}
            teamSendMessage={teamSendMessageOverride}
            teamRuntime={teamRuntime}
          />
        );
      default:
        return null;
    }
  })();

  return <Suspense fallback={<Spin loading className='flex flex-1 items-center justify-center' />}>{content}</Suspense>;
};

export default TeamChatView;
