import { ipcBridge } from '@/common';
import type { AcpBackend } from '@/types/acpTypes';
import { transformMessage, type TMessage } from '@/common/chatLib';
import type { IResponseMessage } from '@/common/ipcBridge';
import { uuid } from '@/common/utils';
import SendBox from '@/renderer/components/sendbox';
import ShimmerText from '@/renderer/components/ShimmerText';
import ThoughtDisplay, { type ThoughtData } from '@/renderer/components/ThoughtDisplay';
import { getSendBoxDraftHook } from '@/renderer/hooks/useSendBoxDraft';
import { createSetUploadFile, useSendBoxFiles } from '@/renderer/hooks/useSendBoxFiles';
import { useAddOrUpdateMessage } from '@/renderer/messages/hooks';
import { allSupportedExts } from '@/renderer/services/FileService';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { Button, Tag } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { iconColors } from '@/renderer/theme/colors';
import FilePreview from '@/renderer/components/FilePreview';

const useAcpSendBoxDraft = getSendBoxDraftHook('acp', {
  _type: 'acp',
  atPath: [],
  content: '',
  uploadFile: [],
});

const useAcpMessage = (conversation_id: string) => {
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const [running, setRunning] = useState(false);
  const [thought, setThought] = useState<ThoughtData>({
    description: '',
    subject: '',
  });
  const [acpStatus, setAcpStatus] = useState<'connecting' | 'connected' | 'authenticated' | 'session_active' | 'disconnected' | 'error' | null>(null);
  const [aiProcessing, setAiProcessing] = useState(false); // New loading state for AI response

  const handleResponseMessage = useCallback(
    (message: IResponseMessage) => {
      if (conversation_id !== message.conversation_id) {
        return;
      }
      const transformedMessage = transformMessage(message);
      switch (message.type) {
        case 'thought':
          setThought(message.data);
          break;
        case 'start':
          setRunning(true);
          break;
        case 'finish':
          setRunning(false);
          setAiProcessing(false);
          setThought({ subject: '', description: '' });
          break;
        case 'content':
          // Clear thought when final answer arrives
          setThought({ subject: '', description: '' });
          addOrUpdateMessage(transformedMessage);
          break;
        case 'agent_status':
          // Update ACP/Agent status
          if (message.data?.status) {
            setAcpStatus(message.data.status);
            // Reset running state when authentication is complete
            if (['authenticated', 'session_active'].includes(message.data.status)) {
              setRunning(false);
            }
          }
          addOrUpdateMessage(transformedMessage);
          break;
        case 'user_content':
          addOrUpdateMessage(transformedMessage);
          break;
        case 'acp_permission':
          addOrUpdateMessage(transformedMessage);
          break;
        case 'error':
          // Stop AI processing state when error occurs
          setAiProcessing(false);
          addOrUpdateMessage(transformedMessage);
          break;
        default:
          addOrUpdateMessage(transformedMessage);
          break;
      }
    },
    [conversation_id, addOrUpdateMessage, setThought, setRunning, setAiProcessing, setAcpStatus]
  );

  useEffect(() => {
    return ipcBridge.acpConversation.responseStream.on(handleResponseMessage);
  }, [handleResponseMessage]);

  // Reset state when conversation changes
  useEffect(() => {
    setRunning(false);
    setThought({ subject: '', description: '' });
    setAcpStatus(null);
    setAiProcessing(false);
  }, [conversation_id]);

  return { thought, setThought, running, acpStatus, aiProcessing, setAiProcessing };
};

const EMPTY_ARRAY: string[] = [];

const useSendBoxDraft = (conversation_id: string) => {
  const { data, mutate } = useAcpSendBoxDraft(conversation_id);
  const atPath = data?.atPath ?? EMPTY_ARRAY;
  const uploadFile = data?.uploadFile ?? EMPTY_ARRAY;
  const content = data?.content ?? '';

  const setAtPath = useCallback(
    (atPath: string[]) => {
      mutate((prev) => ({ ...prev, atPath }));
    },
    [data, mutate]
  );

  const setUploadFile = createSetUploadFile(mutate, data);

  const setContent = useCallback(
    (content: string) => {
      mutate((prev) => ({ ...prev, content }));
    },
    [data, mutate]
  );

  return {
    atPath,
    uploadFile,
    setAtPath,
    setUploadFile,
    content,
    setContent,
  };
};

const AcpSendBox: React.FC<{
  conversation_id: string;
  backend: AcpBackend;
}> = ({ conversation_id, backend }) => {
  const { thought, running, acpStatus, aiProcessing, setAiProcessing } = useAcpMessage(conversation_id);
  const { t } = useTranslation();
  const { atPath, uploadFile, setAtPath, setUploadFile, content, setContent } = useSendBoxDraft(conversation_id);

  const sendingInitialMessageRef = useRef(false); // Prevent duplicate sends
  const addOrUpdateMessage = useAddOrUpdateMessage(); // Move this here so it's available in useEffect
  const addOrUpdateMessageRef = useRef(addOrUpdateMessage);
  addOrUpdateMessageRef.current = addOrUpdateMessage;

  // 使用共享的文件处理逻辑
  const { handleFilesAdded, processMessageWithFiles, clearFiles } = useSendBoxFiles({
    atPath,
    uploadFile,
    setAtPath,
    setUploadFile,
  });

  // Check for and send initial message from guid page when ACP is authenticated
  useEffect(() => {
    if (!acpStatus) {
      return;
    }
    if (acpStatus !== 'session_active') {
      return;
    }

    const sendInitialMessage = async () => {
      // Check flag at the actual execution time
      if (sendingInitialMessageRef.current) {
        return;
      }
      sendingInitialMessageRef.current = true;
      const storageKey = `acp_initial_message_${conversation_id}`;
      const storedMessage = sessionStorage.getItem(storageKey);

      if (!storedMessage) {
        return;
      }
      try {
        const initialMessage = JSON.parse(storedMessage);
        const { input, files } = initialMessage;
        const msg_id = uuid();

        // Start AI processing loading state (user message will be added via backend response)
        setAiProcessing(true);

        // Send the message
        const result = await ipcBridge.acpConversation.sendMessage.invoke({
          input,
          msg_id,
          conversation_id,
          files,
        });

        if (result && result.success === true) {
          // Initial message sent successfully
          sessionStorage.removeItem(storageKey);
        } else {
          // Handle send failure
          console.error('[ACP-FRONTEND] Failed to send initial message:', result);
          // Create error message in UI
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
            createdAt: Date.now() + 2,
          };
          addOrUpdateMessageRef.current(errorMessage, true);
          sendingInitialMessageRef.current = false; // Reset flag on failure
          setAiProcessing(false); // Stop loading state on failure
        }
      } catch (error) {
        console.error('Error sending initial message:', error);
        sessionStorage.removeItem(storageKey);
        sendingInitialMessageRef.current = false; // Reset flag on error
        setAiProcessing(false); // Stop loading state on error
      }
    };

    sendInitialMessage().catch((error) => {
      console.error('Failed to send initial message:', error);
    });
  }, [conversation_id, backend, acpStatus]);

  const onSendHandler = async (message: string) => {
    const msg_id = uuid();

    message = processMessageWithFiles(message);

    // Start AI processing loading state
    setAiProcessing(true);

    // Send message via ACP
    try {
      await ipcBridge.acpConversation.sendMessage.invoke({
        input: message,
        msg_id,
        conversation_id,
        files: uploadFile,
      });
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      // Check if it's an ACP authentication error
      const isAuthError = errorMsg.includes('[ACP-AUTH-') || errorMsg.includes('authentication failed') || errorMsg.includes('认证失败');

      if (isAuthError) {
        // Create error message in conversation instead of alert
        const errorMessage = {
          id: uuid(),
          msg_id: uuid(),
          conversation_id,
          type: 'error',
          data: t('acp.auth.failed', {
            backend,
            error: errorMsg,
            defaultValue: `${backend} authentication failed:\n\n{{error}}\n\nPlease check your local CLI tool authentication status`,
          }),
        };

        // Add error message to conversation
        ipcBridge.acpConversation.responseStream.emit(errorMessage);

        // Stop loading state since AI won't respond
        setAiProcessing(false);
        return; // Don't re-throw error, just show the message
      }
      // Stop loading state for other errors too
      setAiProcessing(false);
      throw error;
    }

    // Clear input content and selected files (similar to GeminiSendBox)
    emitter.emit('acp.selected.file.clear');
    if (uploadFile.length) {
      emitter.emit('acp.workspace.refresh');
    }
    clearFiles();
  };

  useAddEventListener('acp.selected.file', setAtPath);

  return (
    <div className='max-w-800px w-full mx-auto flex flex-col'>
      <ThoughtDisplay thought={thought} />

      {aiProcessing && <ShimmerText duration={2}>{t('common.loading', { defaultValue: 'Please wait...' })}</ShimmerText>}

      <SendBox
        value={content}
        onChange={setContent}
        loading={running}
        disabled={false}
        placeholder={t('acp.sendbox.placeholder', { backend, defaultValue: `Send message to {{backend}}...` })}
        onStop={() => {
          return ipcBridge.conversation.stop.invoke({ conversation_id }).then(() => {});
        }}
        className='z-10'
        onFilesAdded={handleFilesAdded}
        supportedExts={allSupportedExts}
        tools={
          <>
            <Button
              type='secondary'
              shape='circle'
              icon={<Plus theme='outline' size='14' strokeWidth={2} fill={iconColors.primary} />}
              onClick={() => {
                ipcBridge.dialog.showOpen
                  .invoke({
                    properties: ['openFile', 'multiSelections'],
                  })
                  .then((files) => {
                    if (files && files.length > 0) {
                      setUploadFile((prev) => [...prev, ...files]);
                    }
                  })
                  .catch((error) => {
                    console.error('Failed to open file dialog:', error);
                  });
              }}
            ></Button>
          </>
        }
        prefix={
          <div className='flex flex-wrap items-center gap-8px mb-8px'>
            {uploadFile.map((path) => (
              <FilePreview key={path} path={path} onRemove={() => setUploadFile(uploadFile.filter((v) => v !== path))} />
            ))}
            {atPath.map((path) => (
              <Tag
                key={path}
                color='gray'
                closable
                className={'mr-4px'}
                onClose={() => {
                  const newAtPath = atPath.filter((v) => v !== path);
                  emitter.emit('acp.selected.file', newAtPath);
                  setAtPath(newAtPath);
                }}
              >
                {path}
              </Tag>
            ))}
          </div>
        }
        onSend={onSendHandler}
      ></SendBox>
    </div>
  );
};

export default AcpSendBox;
