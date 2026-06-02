/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chat/chatLib';
import { parseError, uuid } from '@/common/utils';
import { emitter } from '@/renderer/utils/emitter';
import { buildDisplayMessage } from '@/renderer/utils/file/messageFiles';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getConversationRuntimeWorkspaceErrorMessage } from '../../utils/conversationCreateError';
import { buildSendFailureError } from './buildSendFailureError';

type UseAcpInitialMessageParams = {
  conversation_id: string;
  backend: string;
  workspacePath?: string;
  setAiProcessing: (value: boolean) => void;
  checkAndUpdateTitle: (conversation_id: string, input: string) => void;
  addOrUpdateMessage: (message: TMessage, prepend?: boolean) => void;
};

/**
 * Side-effect-only hook that checks sessionStorage for an initial message
 * and sends it when the ACP conversation first mounts.
 */
export const useAcpInitialMessage = ({
  conversation_id,
  backend,
  workspacePath,
  setAiProcessing,
  checkAndUpdateTitle,
  addOrUpdateMessage,
}: UseAcpInitialMessageParams): void => {
  const { t } = useTranslation();

  useEffect(() => {
    const storageKey = `acp_initial_message_${conversation_id}`;
    const storedMessage = sessionStorage.getItem(storageKey);

    if (!storedMessage) return;

    // Clear immediately to prevent duplicate sends (e.g., if component remounts while sendMessage is pending)
    sessionStorage.removeItem(storageKey);

    const sendInitialMessage = async () => {
      try {
        const initialMessage = JSON.parse(storedMessage);
        const input = typeof initialMessage.input === 'string' ? initialMessage.input : '';
        const files = Array.isArray(initialMessage.files) ? initialMessage.files : [];
        const displayMessage = buildDisplayMessage(input, files, workspacePath || '');

        setAiProcessing(true);

        // POST first to obtain the server-assigned msg_id, then render the
        // optimistic user bubble with that canonical id. Doing it in this
        // order prevents `useMessageLstCache` from treating the optimistic
        // row as a separate "streaming-only" entry when the DB load races
        // with sendMessage — which previously produced two duplicated user
        // bubbles on the first conversation render.
        void checkAndUpdateTitle(conversation_id, input);
        const { msg_id } = await ipcBridge.acpConversation.sendMessage.invoke({
          input: displayMessage,
          conversation_id: conversation_id,
          files,
        });

        // Use add=false (compose mode) so composeMessageWithIndex can de-dup
        // by msg_id — this prevents a duplicate bubble if useMessageLstCache
        // already inserted the DB row for this same msg_id.
        addOrUpdateMessage({
          id: msg_id,
          msg_id,
          type: 'text',
          position: 'right',
          conversation_id,
          content: { content: displayMessage },
          created_at: Date.now(),
        });

        // Initial message sent successfully
        emitter.emit('chat.history.refresh');
      } catch (error) {
        const errorMessageText =
          getConversationRuntimeWorkspaceErrorMessage(error, t) || parseError(error) || t('common.unknownError');
        console.error('[useAcpInitialMessage] Error sending initial message:', error);
        console.error('[useAcpInitialMessage] Error details:', {
          name: (error as Error)?.name,
          message: errorMessageText,
          conversation_id,
        });

        const errorMessage: TMessage = {
          id: uuid(),
          msg_id: uuid(),
          conversation_id: conversation_id,
          type: 'tips',
          position: 'center',
          content: {
            content: errorMessageText,
            type: 'error',
            error: buildSendFailureError(error, errorMessageText),
          },
          created_at: Date.now() + 2,
        };
        addOrUpdateMessage(errorMessage, true);
        setAiProcessing(false); // Stop loading state on error
      }
    };

    sendInitialMessage().catch((error) => {
      console.error('Failed to send initial message:', error);
    });
  }, [addOrUpdateMessage, backend, checkAndUpdateTitle, conversation_id, setAiProcessing, t, workspacePath]);
};
