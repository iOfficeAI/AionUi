import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chatLib';
import { transformMessage } from '@/common/chatLib';
import { uuid } from '@/common/utils';
import SendBox from '@/renderer/components/sendbox';
import { getSendBoxDraftHook } from '@/renderer/hooks/useSendBoxDraft';
import { useAddOrUpdateMessage } from '@/renderer/messages/hooks';
import { allSupportedExts, type FileMetadata } from '@/renderer/services/FileService';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { Button, Tag } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ShimmerText from '@renderer/components/ShimmerText';
import ThoughtDisplay, { type ThoughtData } from '@/renderer/components/ThoughtDisplay';

interface CodexDraftData {
  _type: 'codex';
  atPath: string[];
  content: string;
  uploadFile: string[];
}

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
  const [aiProcessing, setAiProcessing] = useState(false); // New loading state for AI response
  const [codexStatus, setCodexStatus] = useState<string | null>(null);
  const [thought, setThought] = useState<ThoughtData | null>(null);

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
      setAtPath: (val: string[]) => mutate((prev) => ({ ...(prev as CodexDraftData), atPath: val })),
      setUploadFile: (val: string[]) => mutate((prev) => ({ ...(prev as CodexDraftData), uploadFile: val })),
      setContent: (val: string) => mutate((prev) => ({ ...(prev as CodexDraftData), content: val })),
    };
  })();

  // 当会话ID变化时，清理所有状态避免状态污染
  useEffect(() => {
    // 重置所有运行状态，避免切换会话时状态污染
    setRunning(false);
    setAiProcessing(false);
    setCodexStatus(null);
  }, [conversation_id]);

  useEffect(() => {
    return ipcBridge.codexConversation.responseStream.on((message) => {
      if (conversation_id !== message.conversation_id) {
        return;
      }
      switch (message.type) {
        case 'thought':
          setThought(message.data);
          break;
        case 'finish':
          setThought(message.data);
          setAiProcessing(false);
          break;
        case 'content':
        case 'codex_permission': {
          setThought(null);
          // 通用消息类型使用标准转换器
          const transformedMessage = transformMessage(message);
          addOrUpdateMessage(transformedMessage);
          break;
        }
        case 'codex_status': {
          const statusData = message.data as { status: string; message: string };
          setCodexStatus(statusData.status);
          // 将状态消息添加到 MessageList 中显示
          const transformedMessage = transformMessage(message);
          if (transformedMessage) {
            addOrUpdateMessage(transformedMessage);
          }
          break;
        }
        default: {
          setRunning(false);
          setThought(null);
          // 处理其他消息类型，包括 tool_group
          const transformedMessage = transformMessage(message);
          if (transformedMessage) {
            addOrUpdateMessage(transformedMessage);
          }
        }
      }
    });
  }, [conversation_id, addOrUpdateMessage]);

  // 处理粘贴的文件 - Codex专用逻辑
  const handleFilesAdded = useCallback(
    (pastedFiles: FileMetadata[]) => {
      // 将粘贴的文件添加到uploadFile中
      const filePaths = pastedFiles.map((file) => file.path);
      setUploadFile([...uploadFile, ...filePaths]);
    },
    [uploadFile, setUploadFile]
  );

  useAddEventListener('codex.selected.file', (files: string[]) => {
    // Add a small delay to ensure state persistence and prevent flashing
    setTimeout(() => {
      setAtPath(files);
    }, 10);
  });

  const onSendHandler = async (message: string) => {
    const msg_id = uuid();
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
    setAiProcessing(true);
    try {
      await ipcBridge.codexConversation.sendMessage.invoke({
        input: message,
        msg_id,
        conversation_id,
        files: [...currentUploadFile, ...currentAtPath], // 包含上传文件和选中的工作空间文件
      });
    } finally {
      // Clear waiting state when done
      setAiProcessing(false);
    }
  };

  // 处理从引导页带过来的 initial message，等待连接状态建立后再发送
  useEffect(() => {
    if (!conversation_id || !codexStatus) return;

    // 只有在连接状态为 session_active 时才发送初始化消息
    if (codexStatus !== 'session_active') return;

    const storageKey = `codex_initial_message_${conversation_id}`;
    const processedKey = `codex_initial_processed_${conversation_id}`;

    const processInitialMessage = async () => {
      const stored = sessionStorage.getItem(storageKey);
      if (!stored) return;

      // 双重检查锁定模式，防止竞态条件
      if (sessionStorage.getItem(processedKey)) {
        return;
      }

      // 立即标记为已处理，防止重复处理
      sessionStorage.setItem(processedKey, 'true');

      try {
        // Set waiting state when processing initial message
        setAiProcessing(true);

        const { input, files = [] } = JSON.parse(stored) as { input: string; files?: string[] };
        // 使用固定的msg_id，基于conversation_id确保唯一性
        const msg_id = `initial_${conversation_id}_${Date.now()}`;
        const loading_id = uuid();

        // 前端先写入用户消息，避免导航/事件竞争导致看不到消息
        const userMessage: TMessage = {
          id: msg_id,
          msg_id,
          conversation_id,
          type: 'text',
          position: 'right',
          content: { content: input },
          createdAt: Date.now(),
        };
        addOrUpdateMessage(userMessage, true); // 立即保存到存储，避免刷新丢失

        // 发送消息到后端处理
        await ipcBridge.codexConversation.sendMessage.invoke({ input, msg_id, conversation_id, files, loading_id });

        // 成功后移除初始消息存储
        sessionStorage.removeItem(storageKey);
      } catch (err) {
        // 发送失败时清理处理标记，允许重试
        sessionStorage.removeItem(processedKey);
      } finally {
        // Clear waiting state
        setAiProcessing(false);
      }
    };

    // 小延迟确保状态消息已经完全处理
    const timer = setTimeout(() => {
      void processInitialMessage();
    }, 200);

    return () => {
      clearTimeout(timer);
    };
  }, [conversation_id, codexStatus, addOrUpdateMessage]);

  return (
    <div className='max-w-800px w-full mx-auto flex flex-col'>
      {aiProcessing && <ShimmerText duration={2}>{t('common.loading', { defaultValue: 'Please wait...' })}</ShimmerText>}
      {thought && <ThoughtDisplay thought={thought} style='compact' />}
      <SendBox
        value={content}
        onChange={(val) => {
          // Only allow content changes when not waiting for session or thinking
          if (!aiProcessing) {
            setContent(val);
          }
        }}
        loading={running}
        disabled={aiProcessing}
        placeholder={
          aiProcessing
            ? 'Please wait...'
            : t('acp.sendbox.placeholder', {
                backend: 'Codex',
                defaultValue: `Send message to Codex...`,
              })
        }
        onStop={() => {
          return ipcBridge.conversation.stop.invoke({ conversation_id }).then(() => {});
        }}
        onFilesAdded={handleFilesAdded}
        supportedExts={allSupportedExts}
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
                void ipcBridge.dialog.showOpen.invoke({ properties: ['openFile', 'multiSelections'] }).then((files) => setUploadFile(files || []));
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
