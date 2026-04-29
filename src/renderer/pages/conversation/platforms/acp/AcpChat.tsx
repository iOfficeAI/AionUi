/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import type { AcpBackend } from '@/common/types/acpTypes';
import FlexFullContainer from '@renderer/components/layout/FlexFullContainer';
import MessageList from '@renderer/pages/conversation/Messages/MessageList';
import { ConversationArtifactProvider } from '@renderer/pages/conversation/Messages/artifacts';
import { MessageListProvider, useMessageLstCache } from '@renderer/pages/conversation/Messages/hooks';
import HOC from '@renderer/utils/ui/HOC';
import React from 'react';
import AcpSendBox from './AcpSendBox';
import { useAcpMessage } from './useAcpMessage';

const AcpChat: React.FC<{
  conversation_id: string;
  workspace?: string;
  backend: AcpBackend;
  session_mode?: string;
  cached_config_options?: import('@/common/types/acpTypes').AcpSessionConfigOption[];
  agent_name?: string;
  cron_job_id?: string;
  hideSendBox?: boolean;
  team_id?: string;
  agentSlotId?: string;
  emptySlot?: React.ReactNode;
}> = ({
  conversation_id,
  workspace,
  backend,
  session_mode,
  cached_config_options,
  agent_name,
  cron_job_id,
  hideSendBox,
  team_id,
  agentSlotId,
  emptySlot,
}) => {
  useMessageLstCache(conversation_id);
  const messageState = useAcpMessage(conversation_id);

  return (
    <ConversationProvider
      value={{ conversation_id: conversation_id, workspace, type: 'acp', cron_job_id, hideSendBox }}
    >
      <ConversationArtifactProvider conversation_id={conversation_id}>
        <div className='flex-1 flex flex-col px-20px min-h-0'>
          <FlexFullContainer>
            <MessageList className='flex-1' emptySlot={emptySlot} />
          </FlexFullContainer>
          {!hideSendBox && (
            <AcpSendBox
              conversation_id={conversation_id}
              backend={backend}
              session_mode={session_mode}
              cached_config_options={cached_config_options}
              agent_name={agent_name}
              workspacePath={workspace}
              team_id={team_id}
              agentSlotId={agentSlotId}
              messageState={messageState}
            ></AcpSendBox>
          )}
        </div>
      </ConversationArtifactProvider>
    </ConversationProvider>
  );
};

export default HOC(MessageListProvider)(AcpChat);
