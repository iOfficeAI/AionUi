/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/storage';
import { Message } from '@arco-design/web-react';
import React from 'react';
import ChatWorkspace from './workspace';

const ChatSider: React.FC<{
  conversation?: TChatConversation;
}> = ({ conversation }) => {
  const [messageApi, messageContext] = Message.useMessage({ maxCount: 1 });

  let workspaceNode: React.ReactNode = null;
  if (conversation?.type === 'gemini') {
    workspaceNode = <ChatWorkspace conversation_id={conversation.id} workspace={conversation.extra.workspace} messageApi={messageApi}></ChatWorkspace>;
  } else if (conversation?.type === 'acp' && conversation.extra?.workspace) {
    workspaceNode = <ChatWorkspace conversation_id={conversation.id} workspace={conversation.extra.workspace} eventPrefix='acp' messageApi={messageApi}></ChatWorkspace>;
  } else if (conversation?.type === 'codex' && conversation.extra?.workspace) {
    workspaceNode = <ChatWorkspace conversation_id={conversation.id} workspace={conversation.extra.workspace} eventPrefix='codex' messageApi={messageApi}></ChatWorkspace>;
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
