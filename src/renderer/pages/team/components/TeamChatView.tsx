import { ipcBridge } from '@/common';
import type { IProvider, TChatConversation, TProviderWithModel } from '@/common/config/storage';
import { Spin } from '@arco-design/web-react';
import React, { Suspense, useCallback } from 'react';
import { useAionrsModelSelection } from '@/renderer/pages/conversation/platforms/aionrs/useAionrsModelSelection';
import TeamChatEmptyState from './TeamChatEmptyState';

const AcpChat = React.lazy(() => import('@/renderer/pages/conversation/platforms/acp/AcpChat'));
const AionrsChat = React.lazy(() => import('@/renderer/pages/conversation/platforms/aionrs/AionrsChat'));
const OpenClawChat = React.lazy(() => import('@/renderer/pages/conversation/platforms/openclaw/OpenClawChat'));
const NanobotChat = React.lazy(() => import('@/renderer/pages/conversation/platforms/nanobot/NanobotChat'));
const RemoteChat = React.lazy(() => import('@/renderer/pages/conversation/platforms/remote/RemoteChat'));

// Narrow to Aionrs conversations so model field is always available
type AionrsConversation = Extract<TChatConversation, { type: 'aionrs' }>;

/** Aionrs sub-component manages model selection state without adding a ChatLayout wrapper */
const AionrsTeamChat: React.FC<{
  conversation: AionrsConversation;
  team_id?: string;
  agentSlotId?: string;
  emptySlot?: React.ReactNode;
}> = ({ conversation, team_id, agentSlotId, emptySlot }) => {
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
      team_id={team_id}
      agentSlotId={agentSlotId}
      emptySlot={emptySlot}
    />
  );
};

type TeamChatViewProps = {
  conversation: TChatConversation;
  hideSendBox?: boolean;
  /** When set, the SendBox routes messages through team.sendMessage instead of direct conversation send */
  team_id?: string;
  /** When set alongside team_id, routes messages to a specific agent via team.sendMessageToAgent */
  agentSlotId?: string;
  agent_name?: string;
};

/**
 * Routes to the correct platform chat component based on conversation type.
 * Does NOT wrap in ChatLayout — that is done by the parent TeamPage.
 */
const TeamChatView: React.FC<TeamChatViewProps> = ({ conversation, hideSendBox, team_id, agentSlotId, agent_name }) => {
  // Single source of truth for the team greeting. Each *Chat simply forwards `emptySlot`
  // to MessageList; the empty state itself reads team_id / backend / preset info from the
  // shared SWR-cached conversation record, so none of that needs to flow through props.
  const emptySlot = team_id ? <TeamChatEmptyState conversation_id={conversation.id} /> : undefined;
  const content = (() => {
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
            hideSendBox={hideSendBox}
            team_id={team_id}
            agentSlotId={agentSlotId}
            emptySlot={emptySlot}
          />
        );
      case 'codex': // Legacy: codex now uses ACP protocol
        return (
          <AcpChat
            key={conversation.id}
            conversation_id={conversation.id}
            workspace={conversation.extra?.workspace}
            backend='codex'
            agent_name={agent_name ?? (conversation.extra as { agent_name?: string })?.agent_name}
            hideSendBox={hideSendBox}
            team_id={team_id}
            agentSlotId={agentSlotId}
            emptySlot={emptySlot}
          />
        );
      case 'aionrs':
        return (
          <AionrsTeamChat
            key={conversation.id}
            conversation={conversation as AionrsConversation}
            team_id={team_id}
            agentSlotId={agentSlotId}
            emptySlot={emptySlot}
          />
        );
      case 'openclaw-gateway':
        return (
          <OpenClawChat
            key={conversation.id}
            conversation_id={conversation.id}
            workspace={conversation.extra?.workspace}
            hideSendBox={hideSendBox}
            emptySlot={emptySlot}
          />
        );
      case 'nanobot':
        return (
          <NanobotChat
            key={conversation.id}
            conversation_id={conversation.id}
            workspace={conversation.extra?.workspace}
            hideSendBox={hideSendBox}
            emptySlot={emptySlot}
          />
        );
      case 'remote':
        return (
          <RemoteChat
            key={conversation.id}
            conversation_id={conversation.id}
            workspace={conversation.extra?.workspace}
            hideSendBox={hideSendBox}
            emptySlot={emptySlot}
          />
        );
      default:
        return null;
    }
  })();

  return <Suspense fallback={<Spin loading className='flex flex-1 items-center justify-center' />}>{content}</Suspense>;
};

export default TeamChatView;
