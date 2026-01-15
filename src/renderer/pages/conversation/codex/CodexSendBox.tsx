import { ipcBridge } from '@/common';
import type { TMessage } from '@/common/chatLib';
import { transformMessage } from '@/common/chatLib';
import { uuid } from '@/common/utils';
import SendBox from '@/renderer/components/sendbox';
import { getSendBoxDraftHook, type FileOrFolderItem } from '@/renderer/hooks/useSendBoxDraft';
import { useAddOrUpdateMessage } from '@/renderer/messages/hooks';
import { allSupportedExts, type FileMetadata } from '@/renderer/services/FileService';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { mergeFileSelectionItems } from '@/renderer/utils/fileSelection';
import { Button, Tag } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import { iconColors } from '@/renderer/theme/colors';
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildDisplayMessage } from '@/renderer/utils/messageFiles';
import ThoughtDisplay, { type ThoughtData } from '@/renderer/components/ThoughtDisplay';
import FilePreview from '@/renderer/components/FilePreview';
import HorizontalFileList from '@/renderer/components/HorizontalFileList';
import { usePreviewContext } from '@/renderer/pages/conversation/preview';
import { useLatestRef } from '@/renderer/hooks/useLatestRef';
import { useAutoTitle } from '@/renderer/hooks/useAutoTitle';

interface CodexDraftData {
  _type: 'codex';
  atPath: Array<string | FileOrFolderItem>;
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
  const [workspacePath, setWorkspacePath] = useState('');
  const { t } = useTranslation();
  const { checkAndUpdateTitle } = useAutoTitle();
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const { setSendBoxHandler } = usePreviewContext();

  const [running, setRunning] = useState(false);
  const [aiProcessing, setAiProcessing] = useState(false); // New loading state for AI response
  const [codexStatus, setCodexStatus] = useState<string | null>(null);
  const [thought, setThought] = useState<ThoughtData>({
    description: '',
    subject: '',
  });

  const { content, setContent, atPath, setAtPath, uploadFile, setUploadFile } = (function useDraft() {
    const { data, mutate } = useCodexSendBoxDraft(conversation_id);
    const EMPTY: Array<string | FileOrFolderItem> = [];
    const atPath = data?.atPath ?? EMPTY;
    const uploadFile = data?.uploadFile ?? [];
    const content = data?.content ?? '';
    return {
      atPath,
      uploadFile,
      content,
      setAtPath: (val: Array<string | FileOrFolderItem>) => mutate((prev) => ({ ...(prev as CodexDraftData), atPath: val })),
      setUploadFile: (val: string[]) => mutate((prev) => ({ ...(prev as CodexDraftData), uploadFile: val })),
      setContent: (val: string) => mutate((prev) => ({ ...(prev as CodexDraftData), content: val })),
    };
  })();

  // 使用 useLatestRef 保存最新的 setContent/atPath，避免重复注册 handler
  // Use useLatestRef to keep latest setters to avoid re-registering handler
  const setContentRef = useLatestRef(setContent);
  const atPathRef = useLatestRef(atPath);

  // 当会话ID变化时，清理所有状态避免状态污染
  useEffect(() => {
    // 重置所有运行状态，避免切换会话时状态污染
    setRunning(false);
    setAiProcessing(false);
    setCodexStatus(null);
    setThought({ subject: '', description: '' });
  }, [conversation_id]);

  // 注册预览面板添加到发送框的 handler
  // Register handler for adding text from preview panel to sendbox
  useEffect(() => {
    const handler = (text: string) => {
      // 如果已有内容，添加换行和新文本；否则直接设置文本
      // If there's existing content, add newline and new text; otherwise just set the text
      const newContent = content ? `${content}\n${text}` : text;
      setContentRef.current(newContent);
    };
    setSendBoxHandler(handler);
  }, [setSendBoxHandler, content]);

  useEffect(() => {
    return ipcBridge.codexConversation.responseStream.on((message) => {
      if (conversation_id !== message.conversation_id) {
        return;
      }
      // All messages from Backend are already persisted via emitAndPersistMessage
      // Frontend only needs to update UI
      switch (message.type) {
        case 'thought':
          setThought(message.data as ThoughtData);
          break;
        case 'finish':
          setThought(message.data as ThoughtData);
          setAiProcessing(false);
          break;
        case 'content':
        case 'codex_permission': {
          setThought({ subject: '', description: '' });
          const transformedMessage = transformMessage(message);
          if (transformedMessage) {
            addOrUpdateMessage(transformedMessage);
          }
          break;
        }
        case 'agent_status': {
          const statusData = message.data as { status: string; message: string };
          setCodexStatus(statusData.status);
          const transformedMessage = transformMessage(message);
          if (transformedMessage) {
            addOrUpdateMessage(transformedMessage);
          }
          break;
        }
        default: {
          setRunning(false);
          setThought({ subject: '', description: '' });
          const transformedMessage = transformMessage(message);
          if (transformedMessage) {
            addOrUpdateMessage(transformedMessage);
          }
        }
      }
    });
  }, [conversation_id, addOrUpdateMessage]);

  useEffect(() => {
    void ipcBridge.conversation.get.invoke({ id: conversation_id }).then((res) => {
      if (!res?.extra?.workspace) return;
      setWorkspacePath(res.extra.workspace);
    });
  }, [conversation_id]);

  // 处理粘贴的文件 - Codex专用逻辑
  const handleFilesAdded = useCallback(
    (pastedFiles: FileMetadata[]) => {
      // 将粘贴的文件添加到uploadFile中
      const filePaths = pastedFiles.map((file) => file.path);
      setUploadFile([...uploadFile, ...filePaths]);
    },
    [uploadFile, setUploadFile]
  );

  // 监听从工作空间选择的文件/文件夹（接收对象或路径数组）
  // Listen to files/folders selected from workspace (receives objects or path array)
  useAddEventListener('codex.selected.file', (items: Array<string | FileOrFolderItem>) => {
    // Add a small delay to ensure state persistence and prevent flashing
    setTimeout(() => {
      setAtPath(items);
    }, 10);
  });

  useAddEventListener('codex.selected.file.append', (items: Array<string | FileOrFolderItem>) => {
    setTimeout(() => {
      const merged = mergeFileSelectionItems(atPathRef.current, items);
      if (merged !== atPathRef.current) {
        setAtPath(merged as Array<string | FileOrFolderItem>);
      }
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

    // 不再自动添加 @ 前缀，避免消息显示换行和歧义
    const filePaths = [...currentUploadFile, ...currentAtPath.map((item) => (typeof item === 'string' ? item : item.path))];
    const displayMessage = buildDisplayMessage(message, filePaths, workspacePath);

    // 前端先写入用户消息，避免导航/事件竞争导致看不到消息
    const userMessage: TMessage = {
      id: msg_id,
      msg_id,
      conversation_id,
      type: 'text',
      position: 'right',
      content: { content: displayMessage },
      createdAt: Date.now(),
    };
    addOrUpdateMessage(userMessage, true); // 立即保存到存储，避免刷新丢失
    setAiProcessing(true);
    try {
      // 提取实际的文件路径发送给后端
      const atPathStrings = currentAtPath.map((item) => (typeof item === 'string' ? item : item.path));
      await ipcBridge.codexConversation.sendMessage.invoke({
        input: displayMessage,
        msg_id,
        conversation_id,
        files: [...currentUploadFile, ...atPathStrings], // 包含上传文件和选中的工作空间文件
      });
      void checkAndUpdateTitle(conversation_id, message);
      emitter.emit('chat.history.refresh');
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

        const initialDisplayMessage = buildDisplayMessage(input, files, workspacePath);

        // 前端先写入用户消息，避免导航/事件竞争导致看不到消息
        const userMessage: TMessage = {
          id: msg_id,
          msg_id,
          conversation_id,
          type: 'text',
          position: 'right',
          content: { content: initialDisplayMessage },
          createdAt: Date.now(),
        };
        addOrUpdateMessage(userMessage, true); // 立即保存到存储，避免刷新丢失

        // 发送消息到后端处理
        await ipcBridge.codexConversation.sendMessage.invoke({ input: initialDisplayMessage, msg_id, conversation_id, files, loading_id });
        void checkAndUpdateTitle(conversation_id, input);
        emitter.emit('chat.history.refresh');

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
      processInitialMessage().catch((error) => {
        console.error('Failed to process initial message:', error);
      });
    }, 200);

    return () => {
      clearTimeout(timer);
    };
  }, [conversation_id, codexStatus, addOrUpdateMessage]);

  // 停止会话处理函数 Stop conversation handler
  const handleStop = () => {
    return ipcBridge.conversation.stop.invoke({ conversation_id }).then(() => {});
  };

  return (
    <div className='max-w-800px w-full mx-auto flex flex-col mt-auto mb-16px'>
      <ThoughtDisplay thought={thought} running={aiProcessing || running} onStop={handleStop} />

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
        className='z-10'
        placeholder={
          aiProcessing
            ? t('conversation.chat.processing')
            : t('acp.sendbox.placeholder', {
                backend: 'Codex',
                defaultValue: `Send message to Codex...`,
              })
        }
        onStop={handleStop}
        onFilesAdded={handleFilesAdded}
        supportedExts={allSupportedExts}
        tools={
          <Button
            type='secondary'
            shape='circle'
            icon={<Plus theme='outline' size='14' strokeWidth={2} fill={iconColors.primary} />}
            onClick={() => {
              void ipcBridge.dialog.showOpen.invoke({ properties: ['openFile', 'multiSelections'] }).then((files) => {
                if (files && files.length > 0) {
                  setUploadFile([...uploadFile, ...files]);
                }
              });
            }}
          />
        }
        prefix={
          <>
            {/* Files on top */}
            {(uploadFile.length > 0 || atPath.some((item) => (typeof item === 'string' ? true : item.isFile))) && (
              <HorizontalFileList>
                {uploadFile.map((path) => (
                  <FilePreview key={path} path={path} onRemove={() => setUploadFile(uploadFile.filter((v) => v !== path))} />
                ))}
                {atPath.map((item) => {
                  const isFile = typeof item === 'string' ? true : item.isFile;
                  const path = typeof item === 'string' ? item : item.path;
                  if (isFile) {
                    return (
                      <FilePreview
                        key={path}
                        path={path}
                        onRemove={() => {
                          const newAtPath = atPath.filter((v) => (typeof v === 'string' ? v !== path : v.path !== path));
                          emitter.emit('codex.selected.file', newAtPath);
                          setAtPath(newAtPath);
                        }}
                      />
                    );
                  }
                  return null;
                })}
              </HorizontalFileList>
            )}
            {/* Folder tags below */}
            {atPath.some((item) => (typeof item === 'string' ? false : !item.isFile)) && (
              <div className='flex flex-wrap items-center gap-8px mb-8px'>
                {atPath.map((item) => {
                  if (typeof item === 'string') return null;
                  if (!item.isFile) {
                    return (
                      <Tag
                        key={item.path}
                        color='blue'
                        closable
                        onClose={() => {
                          const newAtPath = atPath.filter((v) => (typeof v === 'string' ? true : v.path !== item.path));
                          emitter.emit('codex.selected.file', newAtPath);
                          setAtPath(newAtPath);
                        }}
                      >
                        {item.name}
                      </Tag>
                    );
                  }
                  return null;
                })}
              </div>
            )}
          </>
        }
        onSend={onSendHandler}
      ></SendBox>
    </div>
  );
};

export default CodexSendBox;
