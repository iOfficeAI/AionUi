import { ipcBridge } from '@/common';
import { transformMessage } from '@/common/chatLib';
import { TModelWithConversation } from '@/common/storage';
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

const useGeminiSendBoxDraft = getSendBoxDraftHook('gemini', {
  _type: 'gemini',
  atPath: [],
  content: '',
  uploadFile: [],
});

const useGeminiMessage = (conversation_id: string) => {
  const addMessage = useAddOrUpdateMessage();
  const [running, setRunning] = useState(false);
  const [thought, setThought] = useState({
    description: '',
    subject: '',
  });
  useEffect(() => {
    return ipcBridge.geminiConversation.responseStream.on(async (message) => {
      if (conversation_id !== message.conversation_id) {
        return;
      }
      console.log('responseStream.message', message);
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
    ipcBridge.conversation.get.invoke({ id: conversation_id }).then((res) => {
      if (!res) return;
      if (res.status === 'running') {
        setRunning(true);
      }
    });
  }, [conversation_id]);

  return { thought, setThought, running };
};

const EMPTY_ARRAY: string[] = [];

const useSendBoxDraft = (conversation_id: string) => {
  const { data, mutate } = useGeminiSendBoxDraft(conversation_id);

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

const GeminiSendBox: React.FC<{
  conversation_id: string;
  model: TModelWithConversation;
}> = ({ conversation_id, model }) => {
  const { t } = useTranslation();
  const { thought, running } = useGeminiMessage(conversation_id);

  const { atPath, uploadFile, setAtPath, setUploadFile, content, setContent } = useSendBoxDraft(conversation_id);

  const addMessage = useAddOrUpdateMessage();

  const onSendHandler = async (message: string) => {
    if (!model?.useModel) return;
    const msg_id = uuid();
    if (atPath.length || uploadFile.length) {
      message = uploadFile.map((p) => '@' + p.split('/').pop()).join(' ') + ' ' + atPath.map((p) => '@' + p).join(' ') + ' ' + message;
    }
    addMessage(
      {
        id: msg_id,
        type: 'text',
        position: 'right',
        conversation_id,
        content: {
          content: message,
        },
      },
      true
    );
    await ipcBridge.geminiConversation.sendMessage.invoke({
      input: message,
      msg_id,
      conversation_id,
      files: uploadFile,
    });
    emitter.emit('gemini.selected.file.clear');
    if (uploadFile.length) {
      emitter.emit('gemini.workspace.refresh');
    }
    setAtPath([]);
    setUploadFile([]);
  };

  useAddEventListener('gemini.selected.file', setAtPath);

  return (
    <div className='max-w-800px w-full  mx-auto flex flex-col'>
      {thought.subject ? (
        <div
          className=' px-10px py-10px rd-20px text-14px pb-40px  lh-20px color-#86909C'
          style={{
            background: 'linear-gradient(90deg, #F0F3FF 0%, #F2F2F2 100%)',
            transform: 'translateY(36px)',
          }}
        >
          <Tag color='arcoblue' size='small' className={'float-left mr-4px'}>
            {thought.subject}
          </Tag>
          {/* <FlexFullContainer> */}
          {/* <div className="text-nowrap overflow-hidden text-ellipsis"> */}
          {thought.description}
          {/* </div> */}
          {/* </FlexFullContainer> */}
        </div>
      ) : null}

      <SendBox
        value={content}
        onChange={setContent}
        loading={running}
        disabled={!model?.useModel}
        placeholder={model?.useModel ? '' : t('conversation.chat.noModelSelected')}
        onStop={() => {
          return ipcBridge.conversation.stop.invoke({ conversation_id }).then(() => {
            console.log('stopStream');
          });
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
            {model && (
              <Button className={'ml-4px'} shape='round'>
                {model.useModel}
              </Button>
            )}
          </>
        }
        prefix={
          <>
            {uploadFile.map((path) => {
              return (
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
              );
            })}
            {atPath.map((path) => (
              <Tag
                key={path}
                color='gray'
                closable
                className={'mr-4px'}
                onClose={() => {
                  const newAtPath = atPath.filter((v) => v !== path);
                  emitter.emit('gemini.selected.file', newAtPath);
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

export default GeminiSendBox;
