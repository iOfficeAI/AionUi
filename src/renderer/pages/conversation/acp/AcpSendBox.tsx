import { ipcBridge } from '@/common';
import type { AcpBackend } from '@/common/acpTypes';
import { isRetryableError } from '@/common/acpTypes';
import { transformMessage, type TMessage } from '@/common/chatLib';
// import type { TModelWithConversation } from '@/common/storage';
import { uuid } from '@/common/utils';
import SendBox from '@/renderer/components/sendbox';
import { getSendBoxDraftHook } from '@/renderer/hooks/useSendBoxDraft';
import { useAddOrUpdateMessage, useUpdateMessageList } from '@/renderer/messages/hooks';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { Button, Tag } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const useAcpSendBoxDraft = getSendBoxDraftHook('acp', {
  _type: 'acp',
  atPath: [],
  content: '',
  uploadFile: [],
});

const useAcpMessage = (conversation_id: string) => {
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const updateMessageList = useUpdateMessageList();
  const [running, setRunning] = useState(false);
  const [thought, setThought] = useState({
    description: '',
    subject: '',
  });
  const [acpStatus, setAcpStatus] = useState<'connecting' | 'connected' | 'authenticated' | 'session_active' | 'disconnected' | 'error' | null>(null);

  useEffect(() => {
    return ipcBridge.acpConversation.responseStream.on(async (message) => {
      if (conversation_id !== message.conversation_id) {
        return;
      }

      switch (message.type) {
        case 'thought':
          setThought(message.data);
          break;
        case 'start':
          setRunning(true);
          break;
        case 'finish':
          {
            setRunning(false);
            setThought({ subject: '', description: '' });
          }
          break;
        case 'content':
          {
            // Clear thought when final answer arrives
            setThought({ subject: '', description: '' });

            // Handle loading replacement specially
            if ((message as any).isLoadingReplacement) {
              // Use our custom replacement function to avoid concatenation
              replaceLoadingMessage(message);
            } else {
              // Normal message processing
              addOrUpdateMessage(transformMessage(message));
            }
          }
          break;
        case 'user_content':
          {
            addOrUpdateMessage(transformMessage(message));
          }
          break;
        case 'acp_status':
          {
            // Update ACP status
            if (message.data && message.data.status) {
              setAcpStatus(message.data.status);
              // Reset running state when authentication is complete
              if (message.data.status === 'authenticated' || message.data.status === 'session_active') {
                setRunning(false);
              }
            }
            addOrUpdateMessage(transformMessage(message));
          }
          break;
        case 'error':
          {
            addOrUpdateMessage(transformMessage(message));
          }
          break;
        case 'acp_permission':
          {
            addOrUpdateMessage(transformMessage(message));
          }
          break;
        default:
          {
            addOrUpdateMessage(transformMessage(message));
          }
          break;
      }
    });
  }, [conversation_id]);

  useEffect(() => {
    setRunning(false);
    setThought({ subject: '', description: '' });

    // Don't automatically set running to true based on conversation status
    // Let the response stream handle the running state properly
    ipcBridge.conversation.get.invoke({ id: conversation_id }).then((res) => {
      if (!res) return;
      // Only set running if there's actually an active operation happening
      // The response stream will handle setting running state for actual operations
    });
  }, [conversation_id]);

  // Add cleanup effect to reset running state when component unmounts or conversation changes
  useEffect(() => {
    return () => {
      setRunning(false);
      setThought({ subject: '', description: '' });
    };
  }, [conversation_id]);

  // Create a custom function to replace loading content without concatenation
  const replaceLoadingMessage = (message: any) => {
    updateMessageList((list: TMessage[]) => {
      let found = false;
      const newList = list.map((msg: TMessage) => {
        if (msg.id === message.msg_id) {
          found = true;
          // Successfully found and replacing loading message
          // Use assistant message ID for proper future composition
          const replacementMessage = {
            ...msg,
            id: message.assistantMsgId || message.msg_id, // Use assistant ID if provided
            msg_id: message.assistantMsgId || message.msg_id, // Use assistant ID for future chunk composition
            content: {
              content: message.data,
            },
            status: undefined, // Clear pending status
          } as TMessage;

          return replacementMessage;
        }
        return msg;
      });

      if (!found) {
        console.warn('[ACP-FRONTEND] Loading message not found for replacement:', message.msg_id);
      }

      return newList;
    });
  };

  return { thought, setThought, running, replaceLoadingMessage, acpStatus };
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

  const setUploadFile = useCallback(
    (uploadFile: string[]) => {
      mutate((prev) => ({ ...prev, uploadFile }));
    },
    [data, mutate]
  );

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
  const { thought, running, replaceLoadingMessage, acpStatus } = useAcpMessage(conversation_id);
  const { t } = useTranslation();

  const { atPath, uploadFile, setAtPath, setUploadFile, content, setContent } = useSendBoxDraft(conversation_id);
  const [initialMessageSent, setInitialMessageSent] = useState(false);
  const sendingInitialMessageRef = useRef(false); // Prevent duplicate sends
  const addOrUpdateMessage = useAddOrUpdateMessage(); // Move this here so it's available in useEffect
  const addOrUpdateMessageRef = useRef(addOrUpdateMessage);
  addOrUpdateMessageRef.current = addOrUpdateMessage;

  // Check for and send initial message from guid page when ACP is authenticated
  useEffect(() => {
    if (initialMessageSent || !acpStatus || sendingInitialMessageRef.current) {
      return;
    }

    // Only proceed when ACP has active session (full authentication and agent ready)
    if (acpStatus !== 'session_active') {
      // Waiting for ACP to complete full authentication and session setup
      return;
    }

    const sendInitialMessage = async () => {
      // Double-check to prevent race conditions
      if (sendingInitialMessageRef.current) {
        // Already sending, skip duplicate
        return;
      }

      const storageKey = `acp_initial_message_${conversation_id}`;
      const storedMessage = sessionStorage.getItem(storageKey);

      if (!storedMessage) {
        return;
      }

      // Mark as sending to prevent duplicate sends
      sendingInitialMessageRef.current = true;

      try {
        const initialMessage = JSON.parse(storedMessage);
        const { input, files } = initialMessage;

        // ACP is authenticated, proceed with sending

        // Generate IDs for messages
        const msg_id = uuid();
        const loading_id = uuid();

        // Create user message
        const userMessage: TMessage = {
          id: msg_id,
          msg_id: msg_id,
          conversation_id,
          type: 'text',
          position: 'right',
          content: {
            content: input,
          },
          createdAt: Date.now(),
        };

        // Create loading message
        const loadingMessage: TMessage = {
          id: loading_id,
          msg_id: loading_id,
          conversation_id,
          type: 'text',
          position: 'left',
          content: {
            content: t('common.loading'),
          },
          createdAt: Date.now() + 1,
        };

        // Add messages to UI
        addOrUpdateMessageRef.current(userMessage, true);
        addOrUpdateMessageRef.current(loadingMessage, true);
        // Messages added to UI

        // Send the message
        const result = await ipcBridge.acpConversation.sendMessage.invoke({
          input,
          msg_id,
          conversation_id,
          files,
          loading_id,
        });

        // Check result
        if (result && result.success === true) {
          // Initial message sent successfully
          sessionStorage.removeItem(storageKey);
          setInitialMessageSent(true);
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
        }
      } catch (error) {
        console.error('Error sending initial message:', error);
        sessionStorage.removeItem(storageKey);
        setInitialMessageSent(true);
        sendingInitialMessageRef.current = false; // Reset flag on error
      }
    };

    sendInitialMessage();
  }, [conversation_id, backend, acpStatus, initialMessageSent]);

  const onSendHandler = async (message: string) => {
    const msg_id = uuid();
    const loading_id = uuid();

    if (atPath.length || uploadFile.length) {
      message = uploadFile.map((p) => '@' + p.split(/[\\/]/).pop()).join(' ') + ' ' + atPath.map((p) => '@' + p).join(' ') + ' ' + message;
    }

    // Create user message first for correct order
    const userMessage: TMessage = {
      id: msg_id,
      msg_id: msg_id,
      conversation_id,
      type: 'text',
      position: 'right',
      content: {
        content: message,
      },
      createdAt: Date.now(),
    };
    addOrUpdateMessage(userMessage, true); // Add user message first

    // Then show loading message for instant feedback
    const loadingMessage: TMessage = {
      id: loading_id,
      msg_id: loading_id,
      conversation_id,
      type: 'text',
      position: 'left',
      content: {
        content: t('common.loading'),
      },
      createdAt: Date.now() + 1, // Slightly later timestamp to ensure correct order
    };

    addOrUpdateMessage(loadingMessage, true); // Use add=true to append to end

    // Send message via ACP with loading ID so backend can replace it
    try {
      await ipcBridge.acpConversation.sendMessage.invoke({
        input: message,
        msg_id,
        conversation_id,
        files: uploadFile,
        loading_id, // Pass loading ID to backend
      });
    } catch (error: any) {
      const errorMsg = error?.message || error.toString();

      // Check if it's an ACP authentication error
      const isAuthError = errorMsg.includes('[ACP-AUTH-') || errorMsg.includes('authentication failed') || errorMsg.includes('认证失败');

      if (isAuthError) {
        // Create error message in conversation instead of alert
        const errorMessage = {
          id: uuid(),
          msg_id: uuid(),
          conversation_id,
          type: 'error',
          data: {
            content: t('acp.auth.failed', {
              backend,
              error: errorMsg,
              defaultValue: `${backend} authentication failed:\n\n{{error}}\n\nPlease check your local CLI tool authentication status`,
            }),
            role: 'system',
          },
          createTime: Date.now(),
        };

        // Add error message to conversation
        ipcBridge.acpConversation.responseStream.emit(errorMessage);

        return; // Don't re-throw error, just show the message
      }
      throw error;
    }

    // Clear input content and selected files (similar to GeminiSendBox)
    setContent('');
    emitter.emit('acp.selected.file.clear');
    if (uploadFile.length) {
      emitter.emit('acp.workspace.refresh');
    }
    setAtPath([]);
    setUploadFile([]);
  };

  useAddEventListener('acp.selected.file', setAtPath);

  return (
    <div className='max-w-800px w-full mx-auto flex flex-col'>
      {thought.subject ? (
        <div
          className=' px-10px py-10px rd-20px text-14px pb-40px lh-20px color-#86909C'
          style={{
            background: 'linear-gradient(90deg, #F0F3FF 0%, #F2F2F2 100%)',
            transform: 'translateY(36px)',
          }}
        >
          <Tag color='arcoblue' size='small' className={'float-left mr-4px'}>
            {thought.subject}
          </Tag>
          {thought.description}
        </div>
      ) : null}

      <SendBox
        value={content}
        onChange={setContent}
        loading={running}
        disabled={false}
        placeholder={`Send message to ${backend}...`}
        onStop={() => {
          return ipcBridge.conversation.stop.invoke({ conversation_id }).then(() => {});
        }}
        className={classNames('z-10 ', {
          'mt-0px': !!thought.subject,
        })}
        tools={
          <>
            <Button
              type='secondary'
              shape='circle'
              icon={<Plus theme='outline' size='14' strokeWidth={2} fill='#333' />}
              onClick={() => {
                ipcBridge.dialog.showOpen
                  .invoke({
                    properties: ['openFile', 'multiSelections'],
                  })
                  .then((files) => {
                    setUploadFile(files || []);
                  });
              }}
            ></Button>
          </>
        }
        prefix={
          <>
            {uploadFile.map((path) => (
              <Tag
                color='blue'
                key={path}
                closable
                className={'mr-4px'}
                onClose={() => {
                  setUploadFile(uploadFile.filter((v) => v !== path));
                }}
              >
                {path.split('/').pop()}
              </Tag>
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
          </>
        }
        onSend={onSendHandler}
      ></SendBox>
    </div>
  );
};

export default AcpSendBox;
