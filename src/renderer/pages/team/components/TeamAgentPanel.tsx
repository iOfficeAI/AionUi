import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import FlexFullContainer from '@/renderer/components/layout/FlexFullContainer';
import MessageList from '@/renderer/pages/conversation/Messages/MessageList';
import { MessageListProvider, useMessageLstCache } from '@/renderer/pages/conversation/Messages/hooks';
import type { TMessage } from '@/common/chat/chatLib';
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { TeamAgentStatus } from '@process/team/types';
import TeamSendBox from './TeamSendBox';

type Props = {
  conversationId: string;
  workspace: string;
  isDispatch: boolean;
  status: TeamAgentStatus;
  sendMessage: (content: string) => Promise<void>;
};

const TeamAgentPanelContent: React.FC<Omit<Props, 'workspace'>> = ({
  conversationId,
  isDispatch,
  status,
  sendMessage,
}) => {
  useMessageLstCache(conversationId);

  return (
    <div className='flex-1 flex flex-col px-20px min-h-0'>
      <FlexFullContainer>
        <MessageList className='flex-1' />
      </FlexFullContainer>
      {isDispatch && <TeamSendBox onSend={sendMessage} disabled={status === 'working'} />}
    </div>
  );
};

const TeamAgentPanel: React.FC<Props> = ({ conversationId, workspace, isDispatch, status, sendMessage }) => {
  const { t } = useTranslation();

  if (!conversationId) {
    return (
      <div className='flex-1 flex items-center justify-center text-[var(--color-text-3)] text-sm p-4'>
        {t('team.agentNotConfigured')}
      </div>
    );
  }

  return (
    <ConversationProvider value={{ conversationId, workspace, type: 'acp' }}>
      <MessageListProvider value={[] as TMessage[]}>
        <TeamAgentPanelContent
          conversationId={conversationId}
          isDispatch={isDispatch}
          status={status}
          sendMessage={sendMessage}
        />
      </MessageListProvider>
    </ConversationProvider>
  );
};

export default TeamAgentPanel;
