import { ipcBridge } from '@/common';
import { transformMessage } from '@/common/chatLib';
import { uuid } from '@/common/utils';
import SendBox from '@/renderer/components/sendbox';
import { getSendBoxDraftHook } from '@/renderer/hooks/useSendBoxDraft';
import { useAddOrUpdateMessage } from '@/renderer/messages/hooks';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { Button, Tag } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TMessage } from '@/common/chatLib';

const useCodexSendBoxDraft = getSendBoxDraftHook('codex', {
  _type: 'codex',
  atPath: [],
  content: '',
  uploadFile: [],
});

const CodexSendBox: React.FC<{ conversation_id: string }> = ({ conversation_id }) => {
  const { t } = useTranslation();
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const [running, setRunning] = useState(false);
  const { content, setContent, atPath, setAtPath, uploadFile, setUploadFile } = (function useDraft() {
    const { data, mutate } = useCodexSendBoxDraft(conversation_id);
    const EMPTY: string[] = [];
    const atPath = data?.atPath ?? EMPTY;
    const uploadFile = data?.uploadFile ?? EMPTY;
    const content = data?.content ?? '';
    return {
      atPath,
      uploadFile,
      content,
      setAtPath: (val: string[]) => mutate((prev) => ({ ...(prev as any), atPath: val })),
      setUploadFile: (val: string[]) => mutate((prev) => ({ ...(prev as any), uploadFile: val })),
      setContent: (val: string) => mutate((prev) => ({ ...(prev as any), content: val })),
    };
  })();

  useEffect(() => {
    return ipcBridge.codexConversation.responseStream.on(async (message) => {
      if (conversation_id !== message.conversation_id) return;
      if (message.type === 'start') setRunning(true);
      if (message.type === 'finish') setRunning(false);
      if (message.type === 'content' || message.type === 'user_content' || message.type === 'error' || message.type === 'acp_permission') {
        addOrUpdateMessage(transformMessage(message));
      }
    });
  }, [conversation_id]);

  useAddEventListener('codex.selected.file', setAtPath);

  const onSendHandler = async (message: string) => {
    const msg_id = uuid();
    const loading_id = uuid();

    if (atPath.length || uploadFile.length) {
      message = uploadFile.map((p) => '@' + p.split(/[\\/]/).pop()).join(' ') + ' ' + atPath.map((p) => '@' + p).join(' ') + ' ' + message;
    }
    // 前端先写入用户消息，避免导航/事件竞争导致看不到消息
    const userMessage: TMessage = {
      id: msg_id,
      msg_id,
      conversation_id,
      type: 'text',
      position: 'right',
      content: { content: message },
      createdAt: Date.now(),
    };
    addOrUpdateMessage(userMessage, true); // 立即保存到存储，避免刷新丢失

    await ipcBridge.codexConversation.sendMessage.invoke({
      input: message,
      msg_id,
      conversation_id,
      files: [...uploadFile, ...atPath], // 包含上传文件和选中的工作空间文件
      loading_id,
    });

    setContent('');
    emitter.emit('codex.selected.file.clear');
    setAtPath([]);
    setUploadFile([]);
  };

  // 处理从引导页带过来的 initial message，确保页面加载后再发送
  useEffect(() => {
    const storageKey = `codex_initial_message_${conversation_id}`;
    const stored = sessionStorage.getItem(storageKey);
    if (!stored) return;
    try {
      const { input, files = [] } = JSON.parse(stored) as { input: string; files?: string[] };
      const msg_id = uuid();
      const loading_id = uuid();

      // 先写入用户消息
      const userMessage: TMessage = {
        id: msg_id,
        msg_id,
        conversation_id,
        type: 'text',
        position: 'right',
        content: { content: input },
        createdAt: Date.now(),
      };
      addOrUpdateMessage(userMessage, true); // 立即保存初始消息到存储

      ipcBridge.codexConversation.sendMessage.invoke({ input, msg_id, conversation_id, files, loading_id }).finally(() => {
        sessionStorage.removeItem(storageKey);
      });
    } catch {
      sessionStorage.removeItem(storageKey);
    }
  }, [conversation_id]);

  return (
    <div className='max-w-800px w-full mx-auto flex flex-col'>
      <SendBox
        value={content}
        onChange={setContent}
        loading={running}
        disabled={false}
        placeholder={t('acp.sendbox.placeholder', { backend: 'Codex', defaultValue: `Send message to Codex...` })}
        onStop={() => {
          return ipcBridge.conversation.stop.invoke({ conversation_id }).then(() => {});
        }}
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
                  emitter.emit('codex.selected.file', newAtPath);
                  setAtPath(newAtPath);
                }}
              >
                {path}
              </Tag>
            ))}
          </>
        }
        tools={
          <>
            <Button
              type='secondary'
              shape='circle'
              icon={<Plus theme='outline' size='14' strokeWidth={2} fill='#333' />}
              onClick={() => {
                ipcBridge.dialog.showOpen.invoke({ properties: ['openFile', 'multiSelections'] }).then((files) => setUploadFile(files || []));
              }}
            ></Button>
          </>
        }
        onSend={onSendHandler}
      ></SendBox>
    </div>
  );
};

export default CodexSendBox;
