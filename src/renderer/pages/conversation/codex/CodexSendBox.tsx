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
import { CodexMessageTransformer } from '@/process/task/codex/CodexMessageTransformer';

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

      // 处理消息
      if (message.type === 'content' || message.type === 'user_content' || message.type === 'error') {
        // 通用消息类型使用标准转换器
        addOrUpdateMessage(transformMessage(message));
      } else if (CodexMessageTransformer.isCodexSpecificMessage(message.type)) {
        // Codex 特定消息类型使用专用转换器
        const transformedMessage = CodexMessageTransformer.transformCodexMessage(message);
        if (transformedMessage) {
          addOrUpdateMessage(transformedMessage);
        }
      }
    });
  }, [conversation_id]);

  useAddEventListener('codex.selected.file', (files: string[]) => setAtPath(files));

  const onSendHandler = async (message: string) => {
    const msg_id = uuid();
    const loading_id = uuid();

    // 立即清空输入框和选择的文件，提升用户体验
    setContent('');
    emitter.emit('codex.selected.file.clear');
    const currentAtPath = [...atPath];
    const currentUploadFile = [...uploadFile];
    setAtPath([]);
    setUploadFile([]);

    if (currentAtPath.length || currentUploadFile.length) {
      message = currentUploadFile.map((p) => '@' + p.split(/[\\/]/).pop()).join(' ') + ' ' + currentAtPath.map((p) => '@' + p).join(' ') + ' ' + message;
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
      files: [...currentUploadFile, ...currentAtPath], // 包含上传文件和选中的工作空间文件
      loading_id,
    });
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
