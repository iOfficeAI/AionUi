/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import { transformMessage } from '@/common/chat/chatLib';
import { useAddOrUpdateMessage } from '@/renderer/pages/conversation/Messages/hooks';
import { useCallback, useEffect, useState } from 'react';

export const useGroupConversation = (conversationId: string) => {
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const [running, setRunning] = useState(false);

  const handleResponseMessage = useCallback(
    (message: IResponseMessage) => {
      if (message.conversation_id !== conversationId) {
        return;
      }

      if (message.type === 'start') {
        setRunning(true);
        return;
      }

      if (message.type === 'finish') {
        setRunning(false);
        return;
      }

      const transformedMessage = transformMessage(message);
      if (transformedMessage) {
        addOrUpdateMessage(transformedMessage);
      }
    },
    [addOrUpdateMessage, conversationId]
  );

  useEffect(() => {
    return ipcBridge.conversation.responseStream.on(handleResponseMessage);
  }, [handleResponseMessage]);

  useEffect(() => {
    void ipcBridge.conversation.get.invoke({ id: conversationId }).then((conversation) => {
      setRunning(conversation?.status === 'running');
    });
  }, [conversationId]);

  return {
    running,
    setRunning,
  };
};
