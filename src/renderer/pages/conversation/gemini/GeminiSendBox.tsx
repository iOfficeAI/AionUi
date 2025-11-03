import { ipcBridge } from '@/common';
import { transformMessage } from '@/common/chatLib';
import type { TProviderWithModel } from '@/common/storage';
import { uuid } from '@/common/utils';
import SendBox from '@/renderer/components/sendbox';
import { getSendBoxDraftHook } from '@/renderer/hooks/useSendBoxDraft';
import { createSetUploadFile, useSendBoxFiles } from '@/renderer/hooks/useSendBoxFiles';
import { useAddOrUpdateMessage } from '@/renderer/messages/hooks';
import { allSupportedExts } from '@/renderer/services/FileService';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { Button, Tag } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ThoughtDisplay, { type ThoughtData } from '@/renderer/components/ThoughtDisplay';
import { iconColors } from '@/renderer/theme/colors';
import FilePreview from '@/renderer/components/FilePreview';

const useGeminiSendBoxDraft = getSendBoxDraftHook('gemini', {
  _type: 'gemini',
  atPath: [],
  content: '',
  uploadFile: [],
});

const useGeminiMessage = (conversation_id: string) => {
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const [running, setRunning] = useState(false);
  const [thought, setThought] = useState<ThoughtData>({
    description: '',
    subject: '',
  });

  useEffect(() => {
    return ipcBridge.geminiConversation.responseStream.on((message) => {
      if (conversation_id !== message.conversation_id) {
        return;
      }
      // console.log('responseStream.message', message);
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
            // Backend handles persistence, Frontend only updates UI
            addOrUpdateMessage(transformMessage(message));
          }
          break;
      }
    });
  }, [conversation_id, addOrUpdateMessage]);

  useEffect(() => {
    setRunning(false);
    setThought({ subject: '', description: '' });
    void ipcBridge.conversation.get.invoke({ id: conversation_id }).then((res) => {
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

const GeminiSendBox: React.FC<{
  conversation_id: string;
  model: TProviderWithModel;
}> = ({ conversation_id, model }) => {
  const { t } = useTranslation();
  const { thought, running } = useGeminiMessage(conversation_id);

  const { atPath, uploadFile, setAtPath, setUploadFile, content, setContent } = useSendBoxDraft(conversation_id);

  const addOrUpdateMessage = useAddOrUpdateMessage();

  // 使用共享的文件处理逻辑
  const { handleFilesAdded, processMessageWithFiles, clearFiles } = useSendBoxFiles({
    atPath,
    uploadFile,
    setAtPath,
    setUploadFile,
  });

  const onSendHandler = async (message: string) => {
    if (!model?.useModel) return;
    const msg_id = uuid();
    message = processMessageWithFiles(message);

    // 立即清空输入框，避免用户误以为消息没发送
    // Clear input immediately to avoid user thinking message wasn't sent
    setContent('');
    clearFiles();

    // User message: Display in UI immediately (Backend will persist when receiving from IPC)
    addOrUpdateMessage(
      {
        id: msg_id,
        type: 'text',
        position: 'right',
        conversation_id,
        content: {
          content: message,
        },
        createdAt: Date.now(),
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
  };

  useAddEventListener('gemini.selected.file', setAtPath);

  // 截断过长的模型名称
  const getDisplayModelName = (modelName: string) => {
    const maxLength = 20;
    if (modelName.length > maxLength) {
      return modelName.slice(0, maxLength) + '...';
    }
    return modelName;
  };

  return (
    <div className='max-w-800px w-full mx-auto flex flex-col mt-auto mb-16px'>
      <ThoughtDisplay thought={thought} />

      {/* 显示处理中提示 / Show processing indicator */}
      {running && !thought.subject && <div className='text-left text-t-secondary text-14px py-8px'>{t('conversation.chat.processing')}</div>}

      <SendBox
        value={content}
        onChange={setContent}
        loading={running}
        disabled={!model?.useModel}
        placeholder={model?.useModel ? t('conversation.chat.sendMessageTo', { model: getDisplayModelName(model.useModel) }) : t('conversation.chat.noModelSelected')}
        onStop={() => {
          return ipcBridge.conversation.stop.invoke({ conversation_id }).then(() => {
            console.log('stopStream');
          });
        }}
        className='z-10'
        onFilesAdded={handleFilesAdded}
        supportedExts={allSupportedExts}
        defaultMultiLine={true}
        lockMultiLine={true}
        tools={
          <>
            <Button
              type='secondary'
              shape='circle'
              icon={<Plus theme='outline' size='14' strokeWidth={2} fill={iconColors.primary} />}
              onClick={() => {
                void ipcBridge.dialog.showOpen
                  .invoke({
                    properties: ['openFile', 'multiSelections'],
                  })
                  .then((files) => {
                    if (files && files.length > 0) {
                      setUploadFile((prev) => [...prev, ...files]);
                    }
                  });
              }}
            ></Button>
            {model && (
              <Button className={'ml-4px text-t-primary'} shape='round'>
                {model.useModel}
              </Button>
            )}
          </>
        }
        prefix={
          <div className='flex flex-wrap items-center gap-8px'>
            {uploadFile.map((path) => {
              return <FilePreview key={path} path={path} onRemove={() => setUploadFile(uploadFile.filter((v) => v !== path))} />;
            })}
            {atPath.map((path) => (
              <FilePreview
                key={path}
                path={path}
                onRemove={() => {
                  const newAtPath = atPath.filter((v) => v !== path);
                  emitter.emit('gemini.selected.file', newAtPath);
                  setAtPath(newAtPath);
                }}
              />
            ))}
          </div>
        }
        onSend={onSendHandler}
      ></SendBox>
    </div>
  );
};

export default GeminiSendBox;
