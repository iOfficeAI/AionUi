import { ipcBridge } from '@/common';
import type { AcpBackend } from '@/common/acpTypes';
import { isRetryableError } from '@/common/acpTypes';
import { transformMessage } from '@/common/chatLib';
// import type { TModelWithConversation } from '@/common/storage';
import { uuid } from '@/common/utils';
import SendBox from '@/renderer/components/sendbox';
import { getSendBoxDraftHook } from '@/renderer/hooks/useSendBoxDraft';
import { useAddOrUpdateMessage } from '@/renderer/messages/hooks';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { Button, Tag } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

const useAcpSendBoxDraft = getSendBoxDraftHook('acp', {
  _type: 'acp',
  atPath: [],
  content: '',
  uploadFile: [],
});

const useAcpMessage = (conversation_id: string) => {
  const addMessage = useAddOrUpdateMessage();
  const [running, setRunning] = useState(false);
  const [thought, setThought] = useState({
    description: '',
    subject: '',
  });

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
            addMessage(transformMessage(message));
          }
          break;
        case 'user_content':
          {
            addMessage(transformMessage(message));
          }
          break;
        case 'acp_status':
          {
            // Reset running state when authentication is complete
            if (message.data && (message.data.status === 'authenticated' || message.data.status === 'session_active')) {
              setRunning(false);
            }
            addMessage(transformMessage(message));
          }
          break;
        case 'error':
          {
            addMessage(transformMessage(message));
          }
          break;
        case 'acp_permission':
          {
            addMessage(transformMessage(message));
          }
          break;
        default:
          {
            addMessage(transformMessage(message));
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

  return { thought, setThought, running };
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
  const { thought, running } = useAcpMessage(conversation_id);
  const { t } = useTranslation();

  const { atPath, uploadFile, setAtPath, setUploadFile, content, setContent } = useSendBoxDraft(conversation_id);
  const navigate = useNavigate();
  const [initialMessageSent, setInitialMessageSent] = useState(false);

  // Check for and send initial message from guid page when ACP connection is ready
  useEffect(() => {
    if (initialMessageSent || running) {
      return;
    }

    const checkAndSendInitialMessage = async () => {
      const storageKey = `acp_initial_message_${conversation_id}`;
      const storedMessage = sessionStorage.getItem(storageKey);

      if (!storedMessage) {
        return;
      }

      try {
        const initialMessage = JSON.parse(storedMessage);
        const { input, files } = initialMessage;

        // Wait for ACP connection to be ready by polling
        const maxAttempts = 30; // 30 seconds max wait
        let attempt = 0;

        const waitForConnection = async (): Promise<boolean> => {
          while (attempt < maxAttempts) {
            try {
              // Try to send the message - if successful, connection is ready
              const msg_id = uuid();

              const result = await ipcBridge.acpConversation.sendMessage.invoke({
                input,
                msg_id,
                conversation_id,
                files,
              });

              // Check if the result indicates success
              if (result && result.success === true) {
                // Success - clear the stored message and mark as sent
                sessionStorage.removeItem(storageKey);
                setInitialMessageSent(true);
                return true;
              } else {
                // Result indicates failure, but no exception was thrown
                const acpError = (result as any)?.error;
                const errorMsg = result?.msg || 'Unknown error';

                if (acpError && isRetryableError(acpError)) {
                  // Continue retrying for retryable errors
                  attempt++;
                  await new Promise((resolve) => setTimeout(resolve, 1000));
                  continue;
                } else {
                  // Non-retryable error or no typed error available
                  throw new Error(acpError?.message || errorMsg);
                }
              }
            } catch (error: any) {
              const errorMsg = error?.message || error.toString();

              // Check if this looks like a connection not ready error (retryable)
              const isConnectionError = errorMsg.includes('ACP connection not ready') || errorMsg.includes('connection') || errorMsg.includes('timeout');

              const isAuthError = errorMsg.includes('[ACP-AUTH-') || errorMsg.includes('authentication failed') || errorMsg.includes('认证失败');

              if (isConnectionError) {
                // Connection not ready yet, wait and retry
                attempt++;
                await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second
                continue;
              } else if (isAuthError) {
                // Authentication error - send error message to conversation

                // Create error message in conversation
                const errorMsg = {
                  id: uuid(),
                  msg_id: uuid(),
                  conversation_id,
                  type: 'error',
                  data: {
                    content: t('acp.auth.failed', {
                      backend,
                      error: error.message,
                      defaultValue: `${backend} authentication failed:\n\n{{error}}\n\nPlease check your local CLI tool authentication status`,
                    }),
                    role: 'system',
                  },
                  createTime: Date.now(),
                };

                // Add error message to conversation
                ipcBridge.acpConversation.responseStream.emit(errorMsg);

                sessionStorage.removeItem(storageKey);
                setInitialMessageSent(true);
                return false;
              } else {
                // Other error - fail silently and remove stored message
                sessionStorage.removeItem(storageKey);
                setInitialMessageSent(true);
                return false;
              }
            }
          }

          // Timeout - remove stored message
          sessionStorage.removeItem(storageKey);
          setInitialMessageSent(true);
          return false;
        };

        waitForConnection();
      } catch (error) {
        console.error('Error parsing initial message:', error);
        sessionStorage.removeItem(storageKey);
        setInitialMessageSent(true);
      }
    };

    checkAndSendInitialMessage();
  }, [conversation_id, backend, navigate, initialMessageSent, running]);

  const onSendHandler = async (message: string) => {
    const msg_id = uuid();
    if (atPath.length || uploadFile.length) {
      message = uploadFile.map((p) => '@' + p.split(/[\\/]/).pop()).join(' ') + ' ' + atPath.map((p) => '@' + p).join(' ') + ' ' + message;
    }

    // User message will be persisted by the backend AcpAgentTask

    // Send message via ACP
    try {
      await ipcBridge.acpConversation.sendMessage.invoke({
        input: message,
        msg_id,
        conversation_id,
        files: uploadFile,
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
