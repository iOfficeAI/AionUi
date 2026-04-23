/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import type { AcpBackend } from '@/common/types/acpTypes';
import FlexFullContainer from '@renderer/components/layout/FlexFullContainer';
import MessageList from '@renderer/pages/conversation/Messages/MessageList';
import { MessageListProvider, useMessageLstCache } from '@renderer/pages/conversation/Messages/hooks';
import HOC from '@renderer/utils/ui/HOC';
import React from 'react';
import ConversationChatConfirm from '../../components/ConversationChatConfirm';
import AcpSendBox from './AcpSendBox';

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

  return (
    <ConversationProvider
      value={{ conversation_id: conversation_id, workspace, type: 'acp', cron_job_id, hideSendBox }}
    >
      <div className='flex-1 flex flex-col px-20px min-h-0'>
        <FlexFullContainer>
          <MessageList className='flex-1' emptySlot={emptySlot} />
        </FlexFullContainer>
        {!hideSendBox && (
          <ConversationChatConfirm conversation_id={conversation_id}>
            <AcpSendBox
              conversation_id={conversation_id}
              backend={backend}
              session_mode={session_mode}
              cached_config_options={cached_config_options}
              agent_name={agent_name}
              workspacePath={workspace}
              team_id={team_id}
              agentSlotId={agentSlotId}
            ></AcpSendBox>
          </ConversationChatConfirm>
        )}
      </div>
    </ConversationProvider>
  );
};

export default HOC(MessageListProvider)(AcpChat);
