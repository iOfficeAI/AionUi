import { ipcBridge } from '@/common';
import type { IProvider, TChatConversation, TProviderWithModel } from '@/common/config/storage';
import { Spin } from '@arco-design/web-react';
import React, { Suspense, useCallback } from 'react';
import { useGeminiModelSelection } from '@/renderer/pages/conversation/platforms/gemini/useGeminiModelSelection';
import { useAionrsModelSelection } from '@/renderer/pages/conversation/platforms/aionrs/useAionrsModelSelection';

const AcpChat = React.lazy(() => import('@/renderer/pages/conversation/platforms/acp/AcpChat'));
const AionrsChat = React.lazy(() => import('@/renderer/pages/conversation/platforms/aionrs/AionrsChat'));
const GeminiChat = React.lazy(() => import('@/renderer/pages/conversation/platforms/gemini/GeminiChat'));
const OpenClawChat = React.lazy(() => import('@/renderer/pages/conversation/platforms/openclaw/OpenClawChat'));
const NanobotChat = React.lazy(() => import('@/renderer/pages/conversation/platforms/nanobot/NanobotChat'));
const RemoteChat = React.lazy(() => import('@/renderer/pages/conversation/platforms/remote/RemoteChat'));

// Narrow to Gemini conversations so model field is always available
type GeminiConversation = Extract<TChatConversation, { type: 'gemini' }>;

/** Gemini sub-component manages model selection state without adding a ChatLayout wrapper */
const GeminiTeamChat: React.FC<{
  conversation: GeminiConversation;
  hideSendBox?: boolean;
  teamId?: string;
  agentSlotId?: string;
  agentName?: string;
  agentType?: string;
}> = ({ conversation, hideSendBox, teamId, agentSlotId, agentName, agentType }) => {
  const onSelectModel = useCallback(
    async (_provider: IProvider, modelName: string) => {
      const selected = { ..._provider, useModel: modelName } as TProviderWithModel;
      const ok = await ipcBridge.conversation.update.invoke({ id: conversation.id, updates: { model: selected } });
      return Boolean(ok);
    },
    [conversation.id]
  );

  const modelSelection = useGeminiModelSelection({ initialModel: conversation.model, onSelectModel });

  return (
    <GeminiChat
      conversation_id={conversation.id}
      workspace={conversation.extra.workspace}
      modelSelection={modelSelection}
      hideSendBox={hideSendBox}
      teamId={teamId}
      agentSlotId={agentSlotId}
      agentName={agentName}
      agentType={agentType}
    />
  );
};

// Narrow to Aionrs conversations so model field is always available
type AionrsConversation = Extract<TChatConversation, { type: 'aionrs' }>;

/** Aionrs sub-component manages model selection state without adding a ChatLayout wrapper */
const AionrsTeamChat: React.FC<{
  conversation: AionrsConversation;
  teamId?: string;
  agentSlotId?: string;
  agentName?: string;
  agentType?: string;
}> = ({ conversation, teamId, agentSlotId, agentName, agentType }) => {
  const onSelectModel = useCallback(
    async (_provider: IProvider, modelName: string) => {
      const selected = { ..._provider, useModel: modelName } as TProviderWithModel;
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
      teamId={teamId}
      agentSlotId={agentSlotId}
      agentName={agentName}
      agentType={agentType}
    />
  );
};

type TeamChatViewProps = {
  conversation: TChatConversation;
  hideSendBox?: boolean;
  /** When set, the SendBox routes messages through team.sendMessage instead of direct conversation send */
  teamId?: string;
  /** When set alongside teamId, routes messages to a specific agent via team.sendMessageToAgent */
  agentSlotId?: string;
  agentName?: string;
  agentType?: string;
};

/**
 * Routes to the correct platform chat component based on conversation type.
 * Does NOT wrap in ChatLayout — that is done by the parent TeamPage.
 */
const TeamChatView: React.FC<TeamChatViewProps> = ({
  conversation,
  hideSendBox,
  teamId,
  agentSlotId,
  agentName,
  agentType,
}) => {
  const content = (() => {
    switch (conversation.type) {
      case 'acp':
        return (
          <AcpChat
            key={conversation.id}
            conversation_id={conversation.id}
            workspace={conversation.extra?.workspace}
            backend={conversation.extra?.backend || 'claude'}
            sessionMode={conversation.extra?.sessionMode}
            agentName={agentName ?? (conversation.extra as { agentName?: string })?.agentName}
            hideSendBox={hideSendBox}
            teamId={teamId}
            agentSlotId={agentSlotId}
          />
        );
      case 'codex': // Legacy: codex now uses ACP protocol
        return (
          <AcpChat
            key={conversation.id}
            conversation_id={conversation.id}
            workspace={conversation.extra?.workspace}
            backend='codex'
            agentName={agentName ?? (conversation.extra as { agentName?: string })?.agentName}
            hideSendBox={hideSendBox}
            teamId={teamId}
            agentSlotId={agentSlotId}
          />
        );
      case 'aionrs':
        return (
          <AionrsTeamChat
            key={conversation.id}
            conversation={conversation as AionrsConversation}
            teamId={teamId}
            agentSlotId={agentSlotId}
            agentName={agentName}
            agentType={agentType}
          />
        );
      case 'gemini':
        return (
          <GeminiTeamChat
            key={conversation.id}
            conversation={conversation}
            hideSendBox={hideSendBox}
            teamId={teamId}
            agentSlotId={agentSlotId}
            agentName={agentName}
            agentType={agentType}
          />
        );
      case 'openclaw-gateway':
        return (
          <OpenClawChat
            key={conversation.id}
            conversation_id={conversation.id}
            workspace={conversation.extra?.workspace}
            hideSendBox={hideSendBox}
          />
        );
      case 'nanobot':
        return (
          <NanobotChat
            key={conversation.id}
            conversation_id={conversation.id}
            workspace={conversation.extra?.workspace}
            hideSendBox={hideSendBox}
          />
        );
      case 'remote':
        return (
          <RemoteChat
            key={conversation.id}
            conversation_id={conversation.id}
            workspace={conversation.extra?.workspace}
            hideSendBox={hideSendBox}
          />
        );
      default:
        return null;
    }
  })();

  return <Suspense fallback={<Spin loading className='flex flex-1 items-center justify-center' />}>{content}</Suspense>;
};

export default TeamChatView;
