import { ipcBridge } from '@/common';
import type { IProvider, TChatConversation, TProviderWithModel } from '@/common/config/storage';
import React, { useCallback } from 'react';
import AcpChat from '@/renderer/pages/conversation/platforms/acp/AcpChat';
import CodexChat from '@/renderer/pages/conversation/platforms/codex/CodexChat';
import GeminiChat from '@/renderer/pages/conversation/platforms/gemini/GeminiChat';
import { useGeminiModelSelection } from '@/renderer/pages/conversation/platforms/gemini/useGeminiModelSelection';
import OpenClawChat from '@/renderer/pages/conversation/platforms/openclaw/OpenClawChat';
import NanobotChat from '@/renderer/pages/conversation/platforms/nanobot/NanobotChat';
import RemoteChat from '@/renderer/pages/conversation/platforms/remote/RemoteChat';

// Narrow to Gemini conversations so model field is always available
type GeminiConversation = Extract<TChatConversation, { type: 'gemini' }>;

/** Gemini sub-component manages model selection state without adding a ChatLayout wrapper */
const GeminiTeamChat: React.FC<{
  conversation: GeminiConversation;
  hideSendBox?: boolean;
}> = ({ conversation, hideSendBox }) => {
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
    />
  );
};

type TeamChatViewProps = {
  conversation: TChatConversation;
  hideSendBox?: boolean;
};

/**
 * Routes to the correct platform chat component based on conversation type.
 * Does NOT wrap in ChatLayout — that is done by the parent TeamPage.
 */
const TeamChatView: React.FC<TeamChatViewProps> = ({ conversation, hideSendBox }) => {
  switch (conversation.type) {
    case 'acp':
      return (
        <AcpChat
          key={conversation.id}
          conversation_id={conversation.id}
          workspace={conversation.extra?.workspace}
          backend={conversation.extra?.backend || 'claude'}
          sessionMode={conversation.extra?.sessionMode}
          agentName={(conversation.extra as { agentName?: string })?.agentName}
          hideSendBox={hideSendBox}
        />
      );
    case 'codex':
      return (
        <CodexChat
          key={conversation.id}
          conversation_id={conversation.id}
          workspace={conversation.extra?.workspace}
          hideSendBox={hideSendBox}
        />
      );
    case 'gemini':
      return <GeminiTeamChat key={conversation.id} conversation={conversation} hideSendBox={hideSendBox} />;
    case 'openclaw-gateway':
      return (
        <OpenClawChat
          key={conversation.id}
          conversation_id={conversation.id}
          workspace={conversation.extra?.workspace}
        />
      );
    case 'nanobot':
      return (
        <NanobotChat
          key={conversation.id}
          conversation_id={conversation.id}
          workspace={conversation.extra?.workspace}
        />
      );
    case 'remote':
      return (
        <RemoteChat key={conversation.id} conversation_id={conversation.id} workspace={conversation.extra?.workspace} />
      );
    default:
      return null;
  }
};

export default TeamChatView;
