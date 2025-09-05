/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/storage';
import React from 'react';
import GeminiWorkspace from './gemini/GeminiWorkspace';

const ChatSider: React.FC<{
  conversation?: TChatConversation;
}> = ({ conversation }) => {
  if (conversation?.type === 'gemini') {
    return <GeminiWorkspace workspace={conversation.extra.workspace} customWorkspace={conversation.extra.customWorkspace}></GeminiWorkspace>;
  }
  
  if (conversation?.type === 'acp' && conversation.extra?.workspace) {
    return <GeminiWorkspace workspace={conversation.extra.workspace} customWorkspace={conversation.extra.customWorkspace} eventPrefix='acp'></GeminiWorkspace>;
  }
  
  return <div></div>;
};

export default ChatSider;
