/**
 * @license
 * Copyright 2025 Infinity Mind OS
 * Direct connection to FastAPI backend on localhost:8080
 */

import { SendBox } from '@/renderer/components/chat/SendBox';
import { useAutoTitle } from '@/renderer/hooks/chat/useAutoTitle';
import { getSendBoxDraftHook, type FileOrFolderItem } from '@/renderer/hooks/chat/useSendBoxDraft';
import { createSetUploadFile } from '@/renderer/hooks/chat/useSendBoxFiles';
import { useLatestRef } from '@/renderer/hooks/ui/useLatestRef';
import { useAddOrUpdateMessage } from '@/renderer/pages/conversation/Messages/hooks';
import { Message } from '@arco-design/web-react';
import { uuid } from '@/common/utils';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface InfinityMindDraftData {
  _type: 'infinity-mind';
  atPath: Array<string | FileOrFolderItem>;
  content: string;
  uploadFile: string[];
}

const useInfinityMindSendBoxDraft = getSendBoxDraftHook('infinity-mind', {
  _type: 'infinity-mind',
  atPath: [],
  content: '',
  uploadFile: [],
});

const EMPTY_AT_PATH: Array<string | FileOrFolderItem> = [];
const EMPTY_UPLOAD_FILES: string[] = [];

const InfinityMindSendBox: React.FC<{ conversation_id: string }> = ({ conversation_id }) => {
  const { t } = useTranslation();
  const { checkAndUpdateTitle } = useAutoTitle();
  const addOrUpdateMessage = useAddOrUpdateMessage();

  const [aiProcessing, setAiProcessing] = useState(false);
  const aiProcessingRef = useRef(aiProcessing);

  const { data: draftData, mutate: mutateDraft } = useInfinityMindSendBoxDraft(conversation_id);
  const atPath = draftData?.atPath ?? EMPTY_AT_PATH;
  const uploadFile = draftData?.uploadFile ?? EMPTY_UPLOAD_FILES;
  const content = draftData?.content ?? '';

  const setContent = useCallback(
    (val: string) => {
      mutateDraft((prev) => ({ ...(prev as InfinityMindDraftData), content: val }));
    },
    [mutateDraft]
  );

  const contentRef = useLatestRef(content);

  const onSendHandler = useCallback(
    async (message: string) => {
      if (!message.trim()) return;

      setContent('');

      try {
        setAiProcessing(true);
        aiProcessingRef.current = true;

        // Add user message to UI
        const userMessage = {
          id: uuid(),
          msg_id: uuid(),
          role: 'user' as const,
          content: message,
          created_at: Date.now(),
          conversation_id,
        };
        addOrUpdateMessage(userMessage as any);

        // Update title if needed
        void checkAndUpdateTitle();

        // Send to localhost:8080/api/chat
        const response = await fetch('http://localhost:8080/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message,
            conversation_id,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Backend error: ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();

        // Add AI response to UI
        const aiMessage = {
          id: uuid(),
          msg_id: uuid(),
          role: 'assistant' as const,
          content: data.response || data.message || 'No response from backend',
          created_at: Date.now(),
          conversation_id,
        };
        addOrUpdateMessage(aiMessage as any);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('[InfinityMindSendBox] Send failed:', errorMsg);
        Message.error(`Connection error: ${errorMsg}`);
      } finally {
        setAiProcessing(false);
        aiProcessingRef.current = false;
      }
    },
    [addOrUpdateMessage, checkAndUpdateTitle, conversation_id, setContent]
  );

  const handleStop = useCallback(async (): Promise<void> => {
    setAiProcessing(false);
    aiProcessingRef.current = false;
  }, []);

  return (
    <SendBox
      value={content}
      onChange={setContent}
      onSend={onSendHandler}
      isDisabled={false}
      isLoading={aiProcessing}
      onStop={handleStop}
      placeholder={t('conversation.placeholder')}
    />
  );
};

export default InfinityMindSendBox;
