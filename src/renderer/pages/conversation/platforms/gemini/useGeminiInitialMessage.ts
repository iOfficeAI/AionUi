import { ipcBridge } from '@/common';
import { uuid } from '@/common/utils';
import { useAutoTitle } from '@/renderer/hooks/chat/useAutoTitle';
import { useLatestRef } from '@/renderer/hooks/ui/useLatestRef';
import { useAddOrUpdateMessage } from '@/renderer/pages/conversation/Messages/hooks';
import { assertBridgeSuccess } from '@/renderer/pages/conversation/platforms/assertBridgeSuccess';
import { emitter } from '@/renderer/utils/emitter';
import { useEffect } from 'react';

type UseGeminiInitialMessageParams = {
  conversationId: string;
  currentModelId: string | undefined;
  hasNoAuth: boolean;
  setContent: (content: string) => void;
  setActiveMsgId: (msgId: string | null) => void;
  setWaitingResponse: (waiting: boolean) => void;
  autoSwitchTriggeredRef: React.MutableRefObject<boolean>;
  setShowSetupCard: (show: boolean) => void;
  performFullCheck: () => Promise<void>;
};

/**
 * Side-effect hook that handles sending (or storing) the initial message
 * from the guide page, which is passed via sessionStorage.
 */
export const useGeminiInitialMessage = ({
  conversationId,
  currentModelId,
  hasNoAuth,
  setContent,
  setActiveMsgId,
  setWaitingResponse,
  autoSwitchTriggeredRef,
  setShowSetupCard,
  performFullCheck,
}: UseGeminiInitialMessageParams): void => {
  const { checkAndUpdateTitle } = useAutoTitle();
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const performFullCheckRef = useLatestRef(performFullCheck);

  useEffect(() => {
    const storageKey = `gemini_initial_message_${conversationId}`;
    const storedMessage = sessionStorage.getItem(storageKey);

    if (!storedMessage) return;

    // If no auth, store message in input box and trigger auto-detection from this new message point.
    // Keep sessionStorage intact so auth loading later can pick it up and send.
    if (hasNoAuth) {
      try {
        const { input } = JSON.parse(storedMessage) as { input: string };
        setContent(input);
      } catch {
        // Ignore parse errors
      }
      // Detection start point = new message: only trigger when there's an initial message to send
      if (!autoSwitchTriggeredRef.current) {
        autoSwitchTriggeredRef.current = true;
        setShowSetupCard(true);
        void performFullCheckRef.current();
      }
      return;
    }

    if (!currentModelId) return;

    // Clear immediately to prevent duplicate sends
    sessionStorage.removeItem(storageKey);

    const sendInitialMessage = async () => {
      try {
        const { input, files } = JSON.parse(storedMessage) as { input: string; files?: string[] };

        // Clear input box content (may have been placed there during hasNoAuth phase)
        setContent('');

        const msg_id = uuid();
        setActiveMsgId(msg_id);
        setWaitingResponse(true); // Set waiting state immediately to show stop button

        // Display user message immediately
        addOrUpdateMessage(
          {
            id: msg_id,
            type: 'text',
            position: 'right',
            conversation_id: conversationId,
            content: {
              content: input,
            },
            createdAt: Date.now(),
          },
          true
        );

        // Send message to backend
        void checkAndUpdateTitle(conversationId, input);
        const result = await ipcBridge.geminiConversation.sendMessage.invoke({
          input,
          msg_id,
          conversation_id: conversationId,
          files: files || [],
        });
        assertBridgeSuccess(result, 'Failed to send initial message to Gemini');

        emitter.emit('chat.history.refresh');
        if (files && files.length > 0) {
          emitter.emit('gemini.workspace.refresh');
        }
      } catch (error) {
        console.error('Failed to send initial message:', error);
      }
    };

    void sendInitialMessage();
  }, [conversationId, currentModelId, hasNoAuth]);
};
