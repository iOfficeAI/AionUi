import { ipcBridge } from '@/common';
import { transformMessage } from '@/common/chatLib';
import type { IResponseMessage } from '@/common/ipcBridge';
import type { TChatConversation, TokenUsageData } from '@/common/storage';
import { uuid } from '@/common/utils';
import ContextUsageIndicator from '@/renderer/components/ContextUsageIndicator';
import FilePreview from '@/renderer/components/FilePreview';
import HorizontalFileList from '@/renderer/components/HorizontalFileList';
import SendBox from '@/renderer/components/sendbox';
import ThoughtDisplay, { type ThoughtData } from '@/renderer/components/ThoughtDisplay';
import { useLatestRef } from '@/renderer/hooks/useLatestRef';
import { useAutoTitle } from '@/renderer/hooks/useAutoTitle';
import { getSendBoxDraftHook, type FileOrFolderItem } from '@/renderer/hooks/useSendBoxDraft';
import { createSetUploadFile, useSendBoxFiles } from '@/renderer/hooks/useSendBoxFiles';
import { buildDisplayMessage, collectSelectedFiles } from '@/renderer/utils/messageFiles';
import { useAddOrUpdateMessage } from '@/renderer/messages/hooks';
import { usePreviewContext } from '@/renderer/pages/conversation/preview';
import { allSupportedExts } from '@/renderer/services/FileService';
import { iconColors } from '@/renderer/theme/colors';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { mergeFileSelectionItems } from '@/renderer/utils/fileSelection';
import { getModelContextLimit } from '@/renderer/utils/modelContextLimits';
import { Button, Message, Tag } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GeminiModelSelection } from './useGeminiModelSelection';

const useGeminiSendBoxDraft = getSendBoxDraftHook('gemini', {
  _type: 'gemini',
  atPath: [],
  content: '',
  uploadFile: [],
});

const useGeminiMessage = (conversation_id: string, onError?: (message: IResponseMessage) => void) => {
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const [streamRunning, setStreamRunning] = useState(false); // API 流是否在运行
  const [hasActiveTools, setHasActiveTools] = useState(false); // 是否有工具在执行或等待确认
  const [thought, setThought] = useState<ThoughtData>({
    description: '',
    subject: '',
  });
  const [tokenUsage, setTokenUsage] = useState<TokenUsageData | null>(null);
  // 当前活跃的消息 ID，用于过滤旧请求的事件（防止 abort 后的事件干扰新请求）
  // Current active message ID to filter out events from old requests (prevents aborted request events from interfering with new ones)
  const activeMsgIdRef = useRef<string | null>(null);

  // 综合运行状态：流在运行 或 有工具在执行/等待确认
  // Combined running state: stream is running OR tools are active
  const running = streamRunning || hasActiveTools;

  // 设置当前活跃的消息 ID / Set current active message ID
  const setActiveMsgId = useCallback((msgId: string | null) => {
    activeMsgIdRef.current = msgId;
  }, []);

  useEffect(() => {
    return ipcBridge.geminiConversation.responseStream.on((message) => {
      if (conversation_id !== message.conversation_id) {
        return;
      }
      // 过滤掉不属于当前活跃请求的事件（防止 abort 后的事件干扰）
      // 注意: 只过滤 thought 和 start 等状态消息，其他消息都必须渲染
      // Filter out events not belonging to current active request (prevents aborted events from interfering)
      // Note: only filter out thought and start messages, other messages must be rendered
      if (activeMsgIdRef.current && message.msg_id && message.msg_id !== activeMsgIdRef.current) {
        // 只过滤掉 thought 和 start，其他消息都需要渲染
        // Only filter out thought and start, other messages need to be rendered
        if (message.type === 'thought') {
          return;
        }
      }
      // console.log('responseStream.message', message);
      switch (message.type) {
        case 'thought':
          setThought(message.data as ThoughtData);
          break;
        case 'start':
          setStreamRunning(true);
          break;
        case 'finish':
          {
            setStreamRunning(false);
            // 只有当没有活跃工具时才清除 thought
            // Only clear thought when no active tools
            if (!hasActiveTools) {
              setThought({ subject: '', description: '' });
            }
          }
          break;
        case 'tool_group':
          {
            // 检查是否有工具在执行或等待确认
            // Check if any tools are executing or awaiting confirmation
            const tools = message.data as Array<{ status: string; name?: string }>;
            const activeStatuses = ['Executing', 'Confirming', 'Pending'];
            const hasActive = tools.some((tool) => activeStatuses.includes(tool.status));
            setHasActiveTools(hasActive);

            // 如果有工具在等待确认，更新 thought 提示
            // If tools are awaiting confirmation, update thought hint
            const confirmingTool = tools.find((tool) => tool.status === 'Confirming');
            if (confirmingTool) {
              setThought({
                subject: 'Awaiting Confirmation',
                description: confirmingTool.name || 'Tool execution',
              });
            } else if (hasActive) {
              const executingTool = tools.find((tool) => tool.status === 'Executing');
              if (executingTool) {
                setThought({
                  subject: 'Executing',
                  description: executingTool.name || 'Tool',
                });
              }
            } else if (!streamRunning) {
              // 所有工具完成且流已停止，清除 thought
              // All tools completed and stream stopped, clear thought
              setThought({ subject: '', description: '' });
            }

            // 继续传递消息给消息列表更新
            // Continue passing message to message list update
            addOrUpdateMessage(transformMessage(message));
          }
          break;
        case 'finished':
          {
            // 处理 Finished 事件，提取 token 使用统计
            const finishedData = message.data as {
              reason?: string;
              usageMetadata?: {
                promptTokenCount?: number;
                candidatesTokenCount?: number;
                totalTokenCount?: number;
                cachedContentTokenCount?: number;
              };
            };
            if (finishedData?.usageMetadata) {
              const newTokenUsage: TokenUsageData = {
                totalTokens: finishedData.usageMetadata.totalTokenCount || 0,
              };
              setTokenUsage(newTokenUsage);
              // 持久化 token 使用统计到会话的 extra.lastTokenUsage 字段
              // 使用 mergeExtra 选项，后端会自动合并 extra 字段，避免两次 IPC 调用
              void ipcBridge.conversation.update.invoke({
                id: conversation_id,
                updates: {
                  extra: {
                    lastTokenUsage: newTokenUsage,
                  } as TChatConversation['extra'],
                },
                mergeExtra: true,
              });
            }
          }
          break;
        default: {
          if (message.type === 'error') {
            onError?.(message as IResponseMessage);
          }
          // Backend handles persistence, Frontend only updates UI
          addOrUpdateMessage(transformMessage(message));
          break;
        }
      }
    });
  }, [conversation_id, addOrUpdateMessage, hasActiveTools, streamRunning, onError]);

  useEffect(() => {
    setStreamRunning(false);
    setHasActiveTools(false);
    setThought({ subject: '', description: '' });
    setTokenUsage(null);
    void ipcBridge.conversation.get.invoke({ id: conversation_id }).then((res) => {
      if (!res) return;
      if (res.status === 'running') {
        setStreamRunning(true);
      }
      // 加载持久化的 token 使用统计
      if (res.type === 'gemini' && res.extra?.lastTokenUsage) {
        const { lastTokenUsage } = res.extra;
        // 只有当 lastTokenUsage 有有效数据时才设置
        if (lastTokenUsage.totalTokens > 0) {
          setTokenUsage(lastTokenUsage);
        }
      }
    });
  }, [conversation_id]);

  return { thought, setThought, running, tokenUsage, setActiveMsgId };
};

const EMPTY_AT_PATH: Array<string | FileOrFolderItem> = [];
const EMPTY_UPLOAD_FILES: string[] = [];

const useSendBoxDraft = (conversation_id: string) => {
  const { data, mutate } = useGeminiSendBoxDraft(conversation_id);

  const atPath = data?.atPath ?? EMPTY_AT_PATH;
  const uploadFile = data?.uploadFile ?? EMPTY_UPLOAD_FILES;
  const content = data?.content ?? '';

  const setAtPath = useCallback(
    (atPath: Array<string | FileOrFolderItem>) => {
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
  modelSelection: GeminiModelSelection;
}> = ({ conversation_id, modelSelection }) => {
  const [workspacePath, setWorkspacePath] = useState('');
  const { t } = useTranslation();
  const { checkAndUpdateTitle } = useAutoTitle();
  const quotaPromptedRef = useRef<string | null>(null);
  const exhaustedModelsRef = useRef(new Set<string>());

  const { currentModel, getDisplayModelName, providers, geminiModeLookup, getAvailableModels, handleSelectModel } = modelSelection;

  const resolveFallbackTarget = useCallback(
    (exhaustedModels: Set<string>) => {
      if (!currentModel) return null;
      const provider = providers.find((item) => item.id === currentModel.id) || providers.find((item) => item.platform?.toLowerCase().includes('gemini-with-google-auth'));
      if (!provider) return null;

      const isGoogleAuthProvider = provider.platform?.toLowerCase().includes('gemini-with-google-auth');
      const manualOption = isGoogleAuthProvider ? geminiModeLookup.get('manual') : undefined;
      const manualModels = manualOption?.subModels?.map((model) => model.value) || [];
      const availableModels = isGoogleAuthProvider ? manualModels : getAvailableModels(provider);
      const candidates = availableModels.filter((model) => model && model !== currentModel.useModel && !exhaustedModels.has(model) && model !== 'manual');

      if (!candidates.length) return null;
      const scoreModel = (modelName: string) => {
        const lower = modelName.toLowerCase();
        let score = 0;
        if (lower.includes('lite')) score -= 2;
        if (lower.includes('flash')) score -= 1;
        if (lower.includes('pro')) score += 2;
        return score;
      };
      const sortedCandidates = [...candidates].sort((a, b) => {
        const scoreA = scoreModel(a);
        const scoreB = scoreModel(b);
        if (scoreA !== scoreB) return scoreA - scoreB;
        return a.localeCompare(b);
      });
      return { provider, model: sortedCandidates[0] };
    },
    [currentModel, providers, geminiModeLookup, getAvailableModels]
  );

  const isQuotaErrorMessage = useCallback((data: unknown) => {
    if (typeof data !== 'string') return false;
    const text = data.toLowerCase();
    const hasQuota = text.includes('quota') || text.includes('resource_exhausted') || text.includes('model_capacity_exhausted') || text.includes('no capacity available');
    const hasLimit = text.includes('limit') || text.includes('exceed') || text.includes('exhaust') || text.includes('status: 429') || text.includes('code 429') || text.includes('429') || text.includes('ratelimitexceeded');
    return hasQuota && hasLimit;
  }, []);

  const handleGeminiError = useCallback(
    (message: IResponseMessage) => {
      if (!isQuotaErrorMessage(message.data)) return;
      const msgId = message.msg_id || 'unknown';
      if (quotaPromptedRef.current === msgId) return;
      quotaPromptedRef.current = msgId;

      if (currentModel?.useModel) {
        exhaustedModelsRef.current.add(currentModel.useModel);
      }
      const fallbackTarget = resolveFallbackTarget(exhaustedModelsRef.current);
      if (!fallbackTarget || !currentModel || fallbackTarget.model === currentModel.useModel) {
        Message.warning(t('conversation.chat.quotaExceededNoFallback', { defaultValue: 'Model quota reached. Please switch to another available model.' }));
        return;
      }

      void handleSelectModel(fallbackTarget.provider, fallbackTarget.model).then(() => {
        Message.success(t('conversation.chat.quotaSwitched', { defaultValue: `Switched to ${fallbackTarget.model}.`, model: fallbackTarget.model }));
      });
    },
    [currentModel, handleSelectModel, isQuotaErrorMessage, resolveFallbackTarget, t]
  );

  const { thought, running, tokenUsage, setActiveMsgId } = useGeminiMessage(conversation_id, handleGeminiError);

  useEffect(() => {
    void ipcBridge.conversation.get.invoke({ id: conversation_id }).then((res) => {
      if (!res?.extra?.workspace) return;
      setWorkspacePath(res.extra.workspace);
    });
  }, [conversation_id]);

  const { atPath, uploadFile, setAtPath, setUploadFile, content, setContent } = useSendBoxDraft(conversation_id);

  const addOrUpdateMessage = useAddOrUpdateMessage();
  const { setSendBoxHandler } = usePreviewContext();

  // 使用 useLatestRef 保存最新的 setContent/atPath，避免重复注册 handler
  // Use useLatestRef to keep latest setters to avoid re-registering handler
  const setContentRef = useLatestRef(setContent);
  const atPathRef = useLatestRef(atPath);

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

  // 使用共享的文件处理逻辑
  const { handleFilesAdded, clearFiles } = useSendBoxFiles({
    atPath,
    uploadFile,
    setAtPath,
    setUploadFile,
  });

  const onSendHandler = async (message: string) => {
    if (!currentModel?.useModel) return;
    const msg_id = uuid();
    // 设置当前活跃的消息 ID，用于过滤掉旧请求的事件
    // Set current active message ID to filter out events from old requests
    setActiveMsgId(msg_id);

    // 保存文件列表（清空前需要保存）/ Save file list before clearing
    const filesToSend = collectSelectedFiles(uploadFile, atPath);
    const hasFiles = filesToSend.length > 0;

    // 立即清空输入框，避免用户误以为消息没发送
    // Clear input immediately to avoid user thinking message wasn't sent
    setContent('');
    clearFiles();

    // User message: Display in UI immediately (Backend will persist when receiving from IPC)
    // 显示原始消息，并附带选中文件名 / Display original message with selected file names
    const displayMessage = buildDisplayMessage(message, filesToSend, workspacePath);
    addOrUpdateMessage(
      {
        id: msg_id,
        type: 'text',
        position: 'right',
        conversation_id,
        content: {
          content: displayMessage,
        },
        createdAt: Date.now(),
      },
      true
    );
    // 文件通过 files 参数传递给后端，不再在消息中添加 @ 前缀
    // Files are passed via files param, no longer adding @ prefix in message
    await ipcBridge.geminiConversation.sendMessage.invoke({
      input: displayMessage,
      msg_id,
      conversation_id,
      files: filesToSend,
    });
    void checkAndUpdateTitle(conversation_id, message);
    emitter.emit('chat.history.refresh');
    emitter.emit('gemini.selected.file.clear');
    if (hasFiles) {
      emitter.emit('gemini.workspace.refresh');
    }
  };

  useAddEventListener('gemini.selected.file', setAtPath);
  useAddEventListener('gemini.selected.file.append', (items: Array<string | FileOrFolderItem>) => {
    const merged = mergeFileSelectionItems(atPathRef.current, items);
    if (merged !== atPathRef.current) {
      setAtPath(merged as Array<string | FileOrFolderItem>);
    }
  });

  // 停止会话处理函数 Stop conversation handler
  const handleStop = () => {
    return ipcBridge.conversation.stop.invoke({ conversation_id }).then(() => {
      console.log('stopStream');
    });
  };

  return (
    <div className='max-w-800px w-full mx-auto flex flex-col mt-auto mb-16px'>
      <ThoughtDisplay thought={thought} running={running} onStop={handleStop} />

      <SendBox
        value={content}
        onChange={setContent}
        loading={running}
        disabled={!currentModel?.useModel}
        // 占位提示同步右上角选择的模型，确保用户感知当前目标
        // Keep placeholder in sync with header selection so users know the active target
        placeholder={currentModel?.useModel ? t('conversation.chat.sendMessageTo', { model: getDisplayModelName(currentModel.useModel) }) : t('conversation.chat.noModelSelected')}
        onStop={handleStop}
        className='z-10'
        onFilesAdded={handleFilesAdded}
        supportedExts={allSupportedExts}
        defaultMultiLine={true}
        lockMultiLine={true}
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
        sendButtonPrefix={<ContextUsageIndicator tokenUsage={tokenUsage} contextLimit={getModelContextLimit(currentModel?.useModel)} size={24} />}
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
                          emitter.emit('gemini.selected.file', newAtPath);
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
                          emitter.emit('gemini.selected.file', newAtPath);
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

export default GeminiSendBox;
