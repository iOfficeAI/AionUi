/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageAcpPermission, TMessage } from '@/common/chat/chatLib';
import { conversation } from '@/common/adapter/ipcBridge';
import { useUpdateMessageList } from '@/renderer/pages/conversation/Messages/hooks';
import { ApprovalCardBase, fromAcpOptions } from '@renderer/components/approval';
import React, { useCallback, useState } from 'react';

interface MessageAcpPermissionProps {
  message: IMessageAcpPermission;
}

const MessageAcpPermission: React.FC<MessageAcpPermissionProps> = React.memo(({ message }) => {
  const { options = [], tool_call } = message.content || {};
  const updateMessageList = useUpdateMessageList();
  const normalized = fromAcpOptions(options);

  // hasResponded MUST follow message.content.responded so when the
  // PendingApprovalsBanner ("Approve all") flips that flag via
  // updateMessageList, this card re-renders as resolved instead of staying
  // stuck on the radio prompt. ApprovalCardBase owns the local
  // "I just clicked confirm" flag and never resets on a transient prop
  // flip-back, which is exactly the banner-sync fix.
  const propResponded = Boolean((message.content as { responded?: boolean } | undefined)?.responded);
  const [isResponding, setIsResponding] = useState(false);

  const handleConfirm = useCallback(
    async (option: { id: string }) => {
      if (isResponding) return;
      setIsResponding(true);
      try {
        await conversation.confirmMessage.invoke({
          confirm_key: option.id,
          msg_id: message.id,
          conversation_id: message.conversation_id,
          call_id: tool_call?.tool_call_id || message.id,
        });
        updateMessageList((list) =>
          list.map((m) => {
            if (m.id !== message.id) return m;
            return {
              ...m,
              content: { ...(m.content as object), responded: true, response: option.id },
            } as unknown as TMessage;
          })
        );
      } catch (error) {
        console.error('Error confirming permission:', error);
      } finally {
        setIsResponding(false);
      }
    },
    [isResponding, message.id, message.conversation_id, tool_call?.tool_call_id, updateMessageList]
  );

  if (!tool_call) {
    return null;
  }

  const targetPath = (tool_call as { raw_input?: { path?: string } }).raw_input?.path;
  const command = tool_call.raw_input?.command || tool_call.title;

  return (
    <ApprovalCardBase
      testIdPrefix='message-acp-permission'
      parentSessionId={(message.content as { parent_session_id?: string | null } | undefined)?.parent_session_id ?? null}
      action={tool_call.kind ?? null}
      title={tool_call.title ?? tool_call.raw_input?.description ?? null}
      description={null}
      commandType={typeof command === 'string' ? command : null}
      targetPath={typeof targetPath === 'string' && targetPath.startsWith('/') ? targetPath : null}
      options={normalized}
      responded={propResponded}
      onConfirm={handleConfirm}
      onReject={() => {
        const reject = normalized.find((opt) => opt.kind === 'reject');
        void handleConfirm({ id: reject ? reject.id : 'reject' });
      }}
    />
  );
});

export default MessageAcpPermission;
