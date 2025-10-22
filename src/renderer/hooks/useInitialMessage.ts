/**
 * Hook for managing initial message sending from guid page
 * This is a more elegant solution that could replace the current implementation
 */

import { uuid } from '@/common/utils';
import { useCallback, useEffect, useRef, useState } from 'react';

type InitialMessageState = 'idle' | 'waiting_auth' | 'sending' | 'sent' | 'failed';

interface InitialMessageData {
  input: string;
  files?: string[];
}

export const useInitialMessage = (conversationId: string, acpStatus: string | null, onSend: (msg_id: string, input: string, files: string[]) => Promise<boolean>) => {
  const [state, setState] = useState<InitialMessageState>('idle');
  const [error, setError] = useState<string | null>(null);
  const processedRef = useRef(false);

  const processInitialMessage = useCallback(async () => {
    // Prevent duplicate processing
    if (processedRef.current) return;

    const storageKey = `acp_initial_message_${conversationId}`;
    const storedMessage = sessionStorage.getItem(storageKey);

    if (!storedMessage) {
      setState('idle');
      return;
    }

    // Check ACP status
    if (!acpStatus || (acpStatus !== 'authenticated' && acpStatus !== 'session_active')) {
      setState('waiting_auth');
      return;
    }

    // Mark as processed to prevent duplicates
    processedRef.current = true;
    setState('sending');

    try {
      const { input, files = [] }: InitialMessageData = JSON.parse(storedMessage);

      // Generate ID
      const msg_id = uuid();

      // Send message
      const success = await onSend(msg_id, input, files);

      if (success) {
        sessionStorage.removeItem(storageKey);
        setState('sent');
      } else {
        setState('failed');
        setError('Failed to send initial message');
        processedRef.current = false; // Allow retry
      }
    } catch (err) {
      setState('failed');
      setError(err instanceof Error ? err.message : 'Unknown error');
      sessionStorage.removeItem(storageKey);
    }
  }, [conversationId, acpStatus, onSend]);

  useEffect(() => {
    processInitialMessage().catch((error) => {
      console.error('Failed to process initial message:', error);
    });
  }, [processInitialMessage]);

  return {
    state,
    error,
    retry: () => {
      processedRef.current = false;
      setError(null);
      processInitialMessage().catch((error) => {
        console.error('Failed to retry initial message:', error);
      });
    },
  };
};

/**
 * Example usage in AcpSendBox:
 *
 * const { state: initialMessageState, error: initialMessageError } = useInitialMessage(
 *   conversation_id,
 *   acpStatus,
 *   async (msg_id, input, files) => {
 *     // Create and send messages
 *     const userMessage: TMessage = { ... };
 *     addOrUpdateMessage(userMessage, true);
 *
 *     const result = await ipcBridge.acpConversation.sendMessage.invoke({
 *       input, msg_id, conversation_id, files
 *     });
 *
 *     return result?.success === true;
 *   }
 * );
 */
