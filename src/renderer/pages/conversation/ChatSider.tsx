/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/storage';
import React from 'react';
import ChatWorkspace from './ChatWorkspace';

const ChatSider: React.FC<{
  conversation?: TChatConversation;
}> = ({ conversation }) => {
  if (conversation?.type === 'gemini') {
    return <ChatWorkspace conversation_id={conversation.id} workspace={conversation.extra.workspace}></ChatWorkspace>;
  }

  if (conversation?.type === 'acp' && conversation.extra?.workspace) {
    return <ChatWorkspace conversation_id={conversation.id} workspace={conversation.extra.workspace} eventPrefix='acp'></ChatWorkspace>;
  }

  if (conversation?.type === 'codex' && conversation.extra?.workspace) {
    return <GeminiWorkspace workspace={conversation.extra.workspace} customWorkspace={conversation.extra.customWorkspace} eventPrefix='codex'></GeminiWorkspace>;
  }

  return <div></div>;
};

export default ChatSider;
