/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chat/chatLib';
import { uuid } from '@/common/utils';
import { emitter } from '@/renderer/utils/emitter';
import { buildDisplayMessage } from '@/renderer/utils/file/messageFiles';
import { useEffect } from 'react';

const ACP_INITIAL_MESSAGE_MAX_RETRIES = 3;
const ACP_INITIAL_MESSAGE_RETRY_DELAYS_MS = [800, 1600];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type UseAcpInitialMessageParams = {
  conversation_id: string;
  backend: string;
  workspacePath?: string;
  setAiProcessing: (value: boolean) => void;
  checkAndUpdateTitle: (conversation_id: string, input: string) => void;
  addOrUpdateMessage: (message: TMessage, prepend?: boolean) => void;
  fetchSlashCommands?: () => void;
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
  fetchSlashCommands,
}: UseAcpInitialMessageParams): void => {
  useEffect(() => {
    const storageKey = `acp_initial_message_${conversation_id}`;
    const completedKey = `acp_initial_message_completed_${conversation_id}`;
    const processedKey = `acp_initial_message_processed_${conversation_id}`;
    const inflightKey = `acp_initial_message_inflight_${conversation_id}`;
    const storedMessage = sessionStorage.getItem(storageKey);

    if (!storedMessage) return;
    if (sessionStorage.getItem(completedKey) === '1') return;
    if (sessionStorage.getItem(processedKey) === '1') return;

    const inflightSince = Number(sessionStorage.getItem(inflightKey) || '0');
    if (Number.isFinite(inflightSince) && inflightSince > 0 && Date.now() - inflightSince < 15_000) {
      return;
    }

    let cancelled = false;
    sessionStorage.setItem(processedKey, '1');
    sessionStorage.setItem(inflightKey, String(Date.now()));

    const sendInitialMessage = async () => {
      try {
        const initialMessage = JSON.parse(storedMessage);
        const input = typeof initialMessage.input === 'string' ? initialMessage.input : '';
        const files = Array.isArray(initialMessage.files) ? initialMessage.files : [];
        const displayMessage = buildDisplayMessage(input, files, workspacePath || '');

        setAiProcessing(true);

        let msg_id: string | null = null;
        let lastError: unknown = null;

        for (let attempt = 0; attempt < ACP_INITIAL_MESSAGE_MAX_RETRIES && !msg_id; attempt += 1) {
          try {
            await ipcBridge.conversation.warmup.invoke({ conversation_id });
            fetchSlashCommands?.();
            void checkAndUpdateTitle(conversation_id, input);
            const result = await ipcBridge.acpConversation.sendMessage.invoke({
              input: displayMessage,
              conversation_id,
              files,
            });
            msg_id = result.msg_id;
          } catch (error) {
            lastError = error;
            if (attempt < ACP_INITIAL_MESSAGE_MAX_RETRIES - 1) {
              await delay(ACP_INITIAL_MESSAGE_RETRY_DELAYS_MS[attempt] ?? 2000);
              continue;
            }
          }
        }

        if (!msg_id) {
          throw lastError instanceof Error ? lastError : new Error('Failed to send initial ACP message');
        }

        if (cancelled) return;

        addOrUpdateMessage({
          id: msg_id,
          msg_id,
          type: 'text',
          position: 'right',
          conversation_id,
          content: { content: displayMessage },
          created_at: Date.now(),
        });

        sessionStorage.removeItem(storageKey);
        sessionStorage.setItem(completedKey, '1');
        emitter.emit('chat.history.refresh');
      } catch (error) {
        console.error('[useAcpInitialMessage] Error sending initial message:', error);
        console.error('[useAcpInitialMessage] Error details:', {
          name: (error as Error)?.name,
          message: (error as Error)?.message,
          conversation_id,
          backend,
        });
        if (!cancelled) {
          sessionStorage.removeItem(processedKey);
          const errorMessage: TMessage = {
            id: uuid(),
            msg_id: uuid(),
            conversation_id,
            type: 'tips',
            position: 'center',
            content: {
              content: 'Failed to send message. Please try again.',
              type: 'error',
            },
            created_at: Date.now() + 2,
          };
          addOrUpdateMessage(errorMessage, true);
          setAiProcessing(false);
        }
      } finally {
        sessionStorage.removeItem(inflightKey);
      }
    };

    sendInitialMessage().catch((error) => {
      console.error('Failed to send initial message:', error);
    });

    return () => {
      cancelled = true;
    };
  }, [
    addOrUpdateMessage,
    backend,
    checkAndUpdateTitle,
    conversation_id,
    fetchSlashCommands,
    setAiProcessing,
    workspacePath,
  ]);
};
