/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageAcpPermission } from '@/common/chat/chatLib';
import { conversation } from '@/common/adapter/ipcBridge';
import {
  classifyAcpPermission,
  normalizePermissionOperationKind,
  PermissionRequestPanel,
} from '../components/MessagePermission';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

type MessageAcpPermissionProps = {
  message: IMessageAcpPermission;
};

const MessageAcpPermission: React.FC<MessageAcpPermissionProps> = React.memo(({ message }) => {
  const content = message.content || ({} as IMessageAcpPermission['content']);
  const { tool_call } = content;
  const options = Array.isArray(content.options) ? content.options : [];
  const { t } = useTranslation();
  const toolCallId = tool_call?.tool_call_id;

  const panelOptions = useMemo(
    () =>
      options.map((option, index) => {
        const fallbackId = `option_${index}`;
        const value = option?.option_id || fallbackId;
        return {
          id: `${value}:${index}`,
          value,
          label: option?.name || `${t('messages.option')} ${index + 1}`,
          intent: classifyAcpPermission(option?.kind || ''),
          testId: `message-acp-permission-option-${value}`,
        };
      }),
    [options, t]
  );

  const handleConfirm = useCallback(
    async (selectedValue: string) => {
      await conversation.confirmMessage.invoke({
        confirm_key: selectedValue,
        msg_id: message.id,
        conversation_id: message.conversation_id,
        call_id: toolCallId || message.id,
      });
    },
    [message.conversation_id, message.id, toolCallId]
  );

  if (!tool_call) {
    return null;
  }

  const title = tool_call.title || tool_call.raw_input?.description || t('messages.permissionRequest');
  const description = tool_call.raw_input?.description;
  // Fallback A (2026-08-04 spec): when raw_input carries no `command`, render the
  // raw_input itself as readable JSON instead of echoing the title (the old echo
  // produced cards like「命令: AskUserQuestion」with the actual question text —
  // the only user-readable content — silently dropped). No per-agent sniffing:
  // whatever the agent sent, the user can at least read it.
  const command =
    typeof tool_call.raw_input?.command === 'string' && tool_call.raw_input.command
      ? tool_call.raw_input.command
      : undefined;
  let rawDump: string | undefined;
  if (!command && tool_call.raw_input && typeof tool_call.raw_input === 'object') {
    const rest = Object.fromEntries(Object.entries(tool_call.raw_input).filter(([key]) => key !== 'description'));
    if (Object.keys(rest).length > 0) {
      try {
        rawDump = JSON.stringify(rest, null, 2);
      } catch {
        rawDump = undefined;
      }
    }
  }
  const detail = command ?? rawDump;

  return (
    <PermissionRequestPanel
      requestKey={`${message.id}:${tool_call.tool_call_id}`}
      testIdPrefix='message-acp-permission'
      title={title}
      description={description && description !== title ? description : undefined}
      operationKind={normalizePermissionOperationKind(tool_call.kind)}
      detail={detail}
      detailLabelKey={command ? undefined : 'messages.requestDetails'}
      options={panelOptions}
      onConfirm={handleConfirm}
    />
  );
});

export default MessageAcpPermission;
