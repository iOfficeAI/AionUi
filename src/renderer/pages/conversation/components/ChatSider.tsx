/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { Message } from '@arco-design/web-react';
import React from 'react';
import ChatWorkspace from '../Workspace';

const ChatSider: React.FC<{
  conversation?: TChatConversation;
  team_id?: string;
}> = ({ conversation, team_id }) => {
  const [messageApi, messageContext] = Message.useMessage({ maxCount: 1 });

  let workspaceNode: React.ReactNode = null;
  if (conversation?.type === 'acp' && conversation.extra?.workspace) {
    workspaceNode = (
      <ChatWorkspace
        conversation_id={conversation.id}
        workspace={conversation.extra.workspace}
        eventPrefix='acp'
        messageApi={messageApi}
        team_id={team_id}
      ></ChatWorkspace>
    );
  } else if (conversation?.type === 'codex' && conversation.extra?.workspace) {
    workspaceNode = (
      <ChatWorkspace
        conversation_id={conversation.id}
        workspace={conversation.extra.workspace}
        eventPrefix='codex'
        messageApi={messageApi}
        team_id={team_id}
      ></ChatWorkspace>
    );
  } else if (conversation?.type === 'aionrs' && conversation.extra?.workspace) {
    workspaceNode = (
      <ChatWorkspace
        conversation_id={conversation.id}
        workspace={conversation.extra.workspace}
        eventPrefix='aionrs'
        messageApi={messageApi}
        team_id={team_id}
      ></ChatWorkspace>
    );
  }

  if (!workspaceNode) {
    return <div></div>;
  }

  return (
    <>
      {messageContext}
      {workspaceNode}
    </>
  );
};

export default ChatSider;
