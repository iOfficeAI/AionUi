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
import { useTranslation } from 'react-i18next';

/**
 * Render a side child conversation with its platform chat surface. Forked
 * children reuse the parent's platform (acp-family or aionrs), so each mounts
 * the same self-contained chat component the main view uses — message list,
 * stream subscription and send box all key off the child conversation id.
 * `forkCapability` is deliberately NOT forwarded: the in-message fork entry
 * navigates the whole page, which would strand the user outside the parent —
 * side threads stay fork-source-free. `sideForkBoundaryMsgId` hides the
 * fork-inherited history so the thread starts visually fresh.
 */
const SideChildChat: React.FC<{
  conversation: TChatConversation;
  isSideMode?: boolean;
  composerPrefix?: React.ReactNode;
}> = ({ conversation, isSideMode = true, composerPrefix }) => {
  const { t } = useTranslation();
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
  // Only real forks carry inherited history; snapshot children start clean.
  const forkBoundary =
    conversation.extra?.side_mode && conversation.extra?.side_fork_mode !== 'text_snapshot'
      ? conversation.extra?.forked_at_msg_id
      : undefined;
  const emptySlot = (
    <div className='px-12px py-24px text-13px text-t-3 text-center max-w-360px'>
      {t('conversation.sideConversation.empty')}
    </div>
  );

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
          sideForkBoundaryMsgId={forkBoundary}
          emptySlot={emptySlot}
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
          sideForkBoundaryMsgId={forkBoundary}
          emptySlot={emptySlot}
        />
      );
    default:
      // Other types cannot be forked, so they never appear as side children.
      return null;
  }
};

export default SideChildChat;
