import { CodexMessageTransformer } from '@/agent/codex/messaging/CodexMessageTransformer';
import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chatLib';
import { transformMessage, composeMessage } from '@/common/chatLib';
import { uuid } from '@/common/utils';
import SendBox from '@/renderer/components/sendbox';
import { getSendBoxDraftHook } from '@/renderer/hooks/useSendBoxDraft';
import { useAddOrUpdateMessage, useUpdateMessageList } from '@/renderer/messages/hooks';
import { allSupportedExts, type FileMetadata } from '@/renderer/services/FileService';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { Button, Tag } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ShimmerText from '@renderer/components/ShimmerText';

const useCodexSendBoxDraft = getSendBoxDraftHook('codex', {
  _type: 'codex',
  atPath: [],
  content: '',
  uploadFile: [],
});

// Codex专用的消息合并函数，支持在整个列表中查找相同msg_id的消息
const composeCodexMessage = (message: TMessage | undefined, list: TMessage[] | undefined): TMessage[] => {
  if (!message) return list || [];
  if (!list?.length) return [message];

  // 查找整个列表中是否有相同msg_id和type的消息
  const existingMessageIndex = list.findIndex((existingMsg) => existingMsg.msg_id === message.msg_id && existingMsg.type === message.type);

  if (existingMessageIndex === -1) {
    // 没有找到相同msg_id的消息，添加新消息
    return list.concat(message);
  }

  // 找到了相同msg_id的消息，进行合并
  const existingMessage = list[existingMessageIndex];

  if (message.type === 'tips' && existingMessage.type === 'tips') {
    // 对于tips类型消息（错误消息），直接替换内容
    // 这样重试错误消息会更新现有的错误消息
    Object.assign(existingMessage, message);
    return list;
  }

  // 对于其他类型，使用原有的合并逻辑
  return composeMessage(message, list);
};

const CodexSendBox: React.FC<{ conversation_id: string }> = ({ conversation_id }) => {
  const { t } = useTranslation();
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const updateMessageList = useUpdateMessageList();

  // Codex专用的消息更新函数，使用自定义合并逻辑
  const addOrUpdateCodexMessage = useCallback(
    (message: TMessage, add = false) => {
      updateMessageList((list: TMessage[]) => {
        return add ? list.concat(message) : composeCodexMessage(message, list);
      });
    },
    [updateMessageList]
  );
  const [running, setRunning] = useState(false);
  const [waitingForSession, setWaitingForSession] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [codexStatus, setCodexStatus] = useState<string | null>(null);
  const [thought, setThought] = useState<{ subject: string; description: string } | null>(null);

  // 用于跟踪已处理的全局状态消息，避免重复
  const processedGlobalMessages = useRef(new Set<string>());
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

  // 当会话ID变化时，清理所有状态避免状态污染
  useEffect(() => {
    processedGlobalMessages.current.clear();
    // 重置所有运行状态，避免切换会话时状态污染
    setRunning(false);
    setWaitingForSession(false);
    setIsThinking(false);
    setCodexStatus(null);
  }, [conversation_id]);

  useEffect(() => {
    return ipcBridge.codexConversation.responseStream.on(async (message) => {
      if (conversation_id !== message.conversation_id) {
        return;
      }

      if (message.type === 'start') {
        setRunning(true);
        setWaitingForSession(true);
      }
      if (message.type === 'finish') {
        setRunning(false);
        setWaitingForSession(false);
        setIsThinking(false);
      }
      if (message.type === 'thought') {
        setThought(message.data);
      }
      if (message.type === 'content' || message.type === 'user_content' || message.type === 'error') {
        // 收到内容消息时，确保清除思考状态（防止状态卡住）
        setIsThinking(false);
        // 清除思考内容
        setThought(null);
        // 通用消息类型使用标准转换器
        const transformedMessage = transformMessage(message);
        addOrUpdateMessage(transformedMessage);
      } else if (CodexMessageTransformer.isCodexSpecificMessage(message.type)) {
        // 处理状态消息
        if (message.type === 'codex_status') {
          const statusData = message.data as { status: string; message: string };
          setCodexStatus(statusData.status);
        }

        // 当收到agent_message时，确保清除思考状态
        if (message.type === 'agent_message') {
          setIsThinking(false);
        }

        // Codex 特定消息类型使用专用转换器
        const transformedMessage = CodexMessageTransformer.transformCodexMessage(message);
        if (transformedMessage) {
          // 对于全局状态消息，检查是否已经处理过相同的消息
          const isGlobalStatusMessage = ['codex_thinking_global', 'codex_status_global'].includes(transformedMessage.msg_id);

          if (isGlobalStatusMessage) {
            const messageKey = `${transformedMessage.msg_id}_${JSON.stringify(transformedMessage.content)}`;

            // 如果这个全局状态消息已经处理过，跳过
            if (processedGlobalMessages.current.has(messageKey)) {
              return;
            }

            // 标记为已处理
            processedGlobalMessages.current.add(messageKey);
          }

          // 使用Codex专用的消息合并逻辑处理重复msg_id
          addOrUpdateCodexMessage(transformedMessage, false);
        }
      }
    });
  }, [conversation_id, addOrUpdateMessage, addOrUpdateCodexMessage]);

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

    // Set waiting state when sending message
    setWaitingForSession(true);

    try {
      await ipcBridge.codexConversation.sendMessage.invoke({
        input: message,
        msg_id,
        conversation_id,
        files: [...currentUploadFile, ...currentAtPath], // 包含上传文件和选中的工作空间文件
        loading_id,
      });
    } finally {
      // Clear waiting state when done
      setWaitingForSession(false);
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
        setWaitingForSession(true);

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
        setWaitingForSession(false);
      }
    };

    // 小延迟确保状态消息已经完全处理
    const timer = setTimeout(() => {
      processInitialMessage();
    }, 200);

    return () => {
      clearTimeout(timer);
    };
  }, [conversation_id, codexStatus, addOrUpdateMessage]);

  return (
    <div className='max-w-800px w-full mx-auto flex flex-col'>
      {(isThinking || waitingForSession) && <ShimmerText duration={2}>{t('common.loading', { defaultValue: 'Please wait...' })}</ShimmerText>}
      {thought && (
        <div
          className='px-10px py-10px rd-20px text-14px pb-40px  lh-20px color-#86909C mb-8px'
          style={{
            maxHeight: '100px',
            overflow: 'scroll',
            background: 'linear-gradient(90deg, #F0F3FF 0%, #F2F2F2 100%)',
            marginBottom: '-36px',
          }}
        >
          <Tag color='arcoblue' size='small' className={'float-left mr-4px'}>
            {thought.subject}
          </Tag>
          {thought.description}
        </div>
      )}
      <SendBox
        value={content}
        onChange={(val) => {
          // Only allow content changes when not waiting for session or thinking
          if (!waitingForSession && !isThinking) {
            setContent(val);
          }
        }}
        loading={running}
        disabled={waitingForSession || isThinking}
        placeholder={
          waitingForSession || isThinking
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
