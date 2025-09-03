import { ipcBridge } from '@/common';
import type { AcpBackend } from '@/common/acpTypes';
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

  const { atPath, uploadFile, setAtPath, setUploadFile, content, setContent } = useSendBoxDraft(conversation_id);
  const navigate = useNavigate();

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
      // Check if it's a Gemini authentication error
      if (error?.message?.includes('[ACP-AUTH-')) {
        console.error('ACP认证错误详情:', error.message);
        const confirmed = window.confirm(`ACP Gemini 认证失败：\n\n${error.message}\n\n是否现在前往设置页面配置？`);
        if (confirmed) {
          navigate('/settings/model');
        }
        return; // Don't re-throw error if user was prompted for authentication
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
            <Button className={'ml-4px'} shape='round'>
              {backend} ACP
            </Button>
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
