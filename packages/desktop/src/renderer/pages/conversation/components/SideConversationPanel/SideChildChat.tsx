/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IProvider, TChatConversation, TProviderWithModel } from '@/common/config/storage';
import AcpChat from '@renderer/pages/conversation/platforms/acp/AcpChat';
import AionrsChat from '@renderer/pages/conversation/platforms/aionrs/AionrsChat';
import { useAionrsModelSelection } from '@renderer/pages/conversation/platforms/aionrs/useAionrsModelSelection';
import React, { useCallback } from 'react';

/**
 * Render a side child conversation with its platform chat surface. Forked
 * children reuse the parent's platform (acp-family or aionrs), so each mounts
 * the same self-contained chat component the main view uses — message list,
 * stream subscription and send box all key off the child conversation id.
 * `forkCapability` is deliberately NOT forwarded: the in-message fork entry
 * navigates the whole page, which would strand the user outside the parent —
 * side threads stay fork-source-free.
 */
const SideChildChat: React.FC<{
  conversation: TChatConversation;
  isSideMode?: boolean;
  composerPrefix?: React.ReactNode;
}> = ({ conversation, isSideMode = true, composerPrefix }) => {
  const onSelectModel = useCallback(
    async (_provider: IProvider, modelName: string) => {
      const selected = { ..._provider, use_model: modelName } as TProviderWithModel;
      const ok = await ipcBridge.conversation.update.invoke({ id: conversation.id, updates: { model: selected } });
      return Boolean(ok);
    },
    [conversation.id]
  );
  const modelSelection = useAionrsModelSelection({
    // Only the aionrs variant carries `model` on the conversation row; ACP
    // children never reach the aionrs branch below.
    initialModel: 'model' in conversation ? conversation.model : undefined,
    onSelectModel,
  });

  switch (conversation.type) {
    case 'acp':
    case 'antigravity':
      return (
        <AcpChat
          key={conversation.id}
          conversation_id={conversation.id}
          workspace={conversation.extra?.workspace}
          backend={conversation.extra?.backend || 'claude'}
          session_mode={conversation.extra?.session_mode}
          isSideMode={isSideMode}
          composerPrefix={composerPrefix}
        />
      );
    case 'aionrs':
      return (
        <AionrsChat
          key={conversation.id}
          conversation_id={conversation.id}
          workspace={conversation.extra?.workspace ?? ''}
          modelSelection={modelSelection}
          session_mode={conversation.extra?.session_mode}
          isSideMode={isSideMode}
          composerPrefix={composerPrefix}
        />
      );
    default:
      // Other types cannot be forked, so they never appear as side children.
      return null;
  }
};

export default SideChildChat;
