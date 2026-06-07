/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { Message } from '@arco-design/web-react';
import React from 'react';
import ChatWorkspace from '../Workspace';

const ChatSlider: React.FC<{
  conversation?: TChatConversation;
}> = ({ conversation }) => {
  const [messageApi, messageContext] = Message.useMessage({ maxCount: 1 });

  // Render the Workspace for any conversation type that carries a usable
  // workspace path. The `eventPrefix` is the conversation type itself so
  // the tree/selection/file-ops hooks can scope their events correctly.
  // Every `TChatConversation` variant declares `extra.workspace` (required
  // for `aionrs`, optional for the rest), so this single branch covers
  // `acp`, `codex`, `openclaw-gateway`, `gemini`, `nanobot`, `remote`,
  // and `aionrs` without per-type duplication.
  const workspace = conversation?.extra?.workspace;
  const eventPrefix = conversation?.type;

  if (!workspace || !eventPrefix) {
    return <div></div>;
  }

  return (
    <>
      {messageContext}
      <ChatWorkspace
        conversation_id={conversation.id}
        workspace={workspace}
        isTemporaryWorkspace={
          (conversation.extra as { is_temporary_workspace?: boolean } | undefined)?.is_temporary_workspace
        }
        eventPrefix={eventPrefix}
        messageApi={messageApi}
      ></ChatWorkspace>
    </>
  );
};

export default ChatSlider;
