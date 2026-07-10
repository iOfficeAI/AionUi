import { ipcBridge } from '@/common';
import type { IConversationMcpStatus, IProvider, TChatConversation, TProviderWithModel } from '@/common/config/storage';
import { Message, Spin } from '@arco-design/web-react';
import React, { Suspense, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAionrsModelSelection } from '@/renderer/pages/conversation/platforms/aionrs/useAionrsModelSelection';
import { isLegacyReadOnlyConversationType } from '@/renderer/pages/conversation/utils/conversationRuntime';
import type { ITeamRunAck } from '@/common/types/team/teamTypes';
import { buildTeamSendRuntime, buildTeamStopHandler } from './teamSendRuntime';
import type { TeamRunViewState } from '../hooks/useTeamRunView';
import TeamChatEmptyState from './TeamChatEmptyState';
import { usePresetAssistantInfo } from '@/renderer/hooks/agent/usePresetAssistantInfo';
import { resolveConversationBackend } from '@/renderer/pages/conversation/utils/conversationAssistantIdentity';

const AcpChat = React.lazy(() => import('@/renderer/pages/conversation/platforms/acp/AcpChat'));
const AionrsChat = React.lazy(() => import('@/renderer/pages/conversation/platforms/aionrs/AionrsChat'));
const LegacyReadOnlyConversation = React.lazy(
  () => import('@/renderer/pages/conversation/platforms/legacy/LegacyReadOnlyConversation')
);

// Narrow to Aionrs conversations so model field is always available
type AionrsConversation = Extract<TChatConversation, { type: 'aionrs' }>;
type TeamSendOverride = (payload: { input: string; files: string[] }) => Promise<void>;
type TeamConversationCapabilitySnapshot = {
  skills?: string[];
  mcp_servers?: string[];
  mcp_statuses?: IConversationMcpStatus[];
};
const EMPTY_TEAM_RUN_VIEW: TeamRunViewState = {
  activeRun: undefined,
  childTurnsBySlot: {},
  slotWorkBySlot: {},
};

const resolveAssistantDisplayName = (
  conversation: TChatConversation,
  presetAssistantName: string | null,
  explicitAssistantName?: string
): string | undefined => {
  if (presetAssistantName) return presetAssistantName;
  const trimmedExplicitAssistantName = explicitAssistantName?.trim();
  if (trimmedExplicitAssistantName) return trimmedExplicitAssistantName;
  const extraAgentName = (conversation.extra as { agent_name?: string } | undefined)?.agent_name;
  if (extraAgentName?.trim()) return extraAgentName.trim();
  return undefined;
};

/** Aionrs sub-component manages model selection state without adding a ChatLayout wrapper */
const AionrsTeamChat: React.FC<{
  conversation: AionrsConversation;
  emptySlot?: React.ReactNode;
  assistant_name?: string;
  teamSendMessage?: TeamSendOverride;
  teamRuntime?: ReturnType<typeof buildTeamSendRuntime>;
  loadedSkills?: string[];
  loadedMcpServers?: string[];
  loadedMcpStatuses?: IConversationMcpStatus[];
}> = ({
  conversation,
  emptySlot,
  assistant_name,
  teamSendMessage,
  teamRuntime,
  loadedSkills,
  loadedMcpServers,
  loadedMcpStatuses,
}) => {
  const onSelectModel = useCallback(
    async (_provider: IProvider, modelName: string) => {
      const selected = { ..._provider, use_model: modelName } as TProviderWithModel;
      const ok = await ipcBridge.conversation.update.invoke({ id: conversation.id, updates: { model: selected } });
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
      agent_name={assistant_name}
      teamSendMessage={teamSendMessage}
      teamRuntime={teamRuntime}
      loadedSkills={loadedSkills}
      loadedMcpServers={loadedMcpServers}
      loadedMcpStatuses={loadedMcpStatuses}
    />
  );
};

type TeamChatViewProps = {
  conversation: TChatConversation;
  hideSendBox?: boolean;
  /** When set, shows the team greeting empty state */
  team_id?: string;
  slot_id?: string;
  assistant_name?: string;
  assistant_backend?: string;
  agent_icon?: string;
  isLeader?: boolean;
  teamRunView?: TeamRunViewState;
  onTeamRunAck?: (ack: ITeamRunAck) => void;
  onRunStateStale?: () => Promise<boolean>;
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
  assistant_name,
  assistant_backend,
  agent_icon,
  isLeader,
  teamRunView = EMPTY_TEAM_RUN_VIEW,
  onTeamRunAck,
  onRunStateStale,
}) => {
  const { t } = useTranslation();
  const { info: presetAssistantInfo } = usePresetAssistantInfo(conversation);
  const capabilitySnapshot = conversation.extra as TeamConversationCapabilitySnapshot | undefined;
  // Single source of truth for the team greeting. Each *Chat simply forwards
  // `emptySlot` to MessageList. The empty state can derive preset assistant
  // details from the shared SWR-cached conversation record, but it should
  // prefer the assistant identity already carried by the team runtime.
  const resolvedHideSendBox = hideSendBox || isLegacyReadOnlyConversationType(conversation.type);
  const emptySlot = team_id ? (
    <TeamChatEmptyState
      conversation_id={conversation.id}
      assistant_name={assistant_name}
      assistant_backend={assistant_backend}
      icon={agent_icon}
      isLeader={isLeader}
    />
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
  const resolvedAssistantBackend =
    resolveConversationBackend(conversation, assistant_backend || presetAssistantInfo?.backend) || 'claude';
  const resolvedAssistantName = resolveAssistantDisplayName(
    conversation,
    presetAssistantInfo?.name ?? null,
    assistant_name
  );
  const slotWork = slot_id ? teamRunView.slotWorkBySlot[slot_id] : undefined;
  const queuedCount = (slotWork?.queued_foreground_count ?? 0) + (slotWork?.queued_background_count ?? 0);
  const teamWorkStatusText = (() => {
    switch (slotWork?.blocked_reason) {
      case 'runtime_starting':
        return t('team.work.runtimeStarting', { defaultValue: 'Waiting for this assistant to start…' });
      case 'runtime_failed':
        return t('team.work.runtimeFailed', { defaultValue: 'This assistant failed to start.' });
      case 'removing':
        return t('team.work.removing', { defaultValue: 'Removing this assistant…' });
      case 'session_stopped':
        return t('team.work.sessionStopped', { defaultValue: 'The team session has stopped.' });
      default:
        if ((slotWork?.state === 'starting' || slotWork?.state === 'running') && queuedCount > 0) {
          return t('team.work.processingWithQueued', {
            count: queuedCount,
            defaultValue: `Processing… ${queuedCount} queued`,
          });
        }
        if (queuedCount > 0) {
          return t('team.work.queued', { count: queuedCount, defaultValue: `${queuedCount} queued` });
        }
        return undefined;
    }
  })();
  const teamRuntime =
    team_id && slot_id
      ? buildTeamSendRuntime({
          slot_id,
          runView: teamRunView,
          statusText: teamWorkStatusText,
          onStop: buildTeamStopHandler({
            team_id,
            slot_id,
            runView: teamRunView,
            pauseSlotWork: (params) => ipcBridge.team.pauseSlotWork.invoke(params),
            onStopFailed: () => {
              Message.error(
                t('team.stopAgentFailed', { defaultValue: 'Failed to stop this agent. Please try again.' })
              );
            },
            onRunStateStale,
          }),
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
            backend={resolvedAssistantBackend}
            session_mode={conversation.extra?.session_mode}
            agent_name={resolvedAssistantName}
            hideSendBox={resolvedHideSendBox}
            emptySlot={emptySlot}
            teamSendMessage={teamSendMessageOverride}
            teamRuntime={teamRuntime}
            loadedSkills={capabilitySnapshot?.skills}
            loadedMcpServers={capabilitySnapshot?.mcp_servers}
            loadedMcpStatuses={capabilitySnapshot?.mcp_statuses}
          />
        );
      case 'aionrs':
        return (
          <AionrsTeamChat
            key={conversation.id}
            conversation={conversation as AionrsConversation}
            emptySlot={emptySlot}
            assistant_name={resolvedAssistantName}
            teamSendMessage={teamSendMessageOverride}
            teamRuntime={teamRuntime}
            loadedSkills={capabilitySnapshot?.skills}
            loadedMcpServers={capabilitySnapshot?.mcp_servers}
            loadedMcpStatuses={capabilitySnapshot?.mcp_statuses}
          />
        );
      default:
        return null;
    }
  })();

  return <Suspense fallback={<Spin loading className='flex flex-1 items-center justify-center' />}>{content}</Suspense>;
};

export default TeamChatView;
