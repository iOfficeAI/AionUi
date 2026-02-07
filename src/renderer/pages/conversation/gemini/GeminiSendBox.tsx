import { ipcBridge } from '@/common';
import { transformMessage } from '@/common/chatLib';
import type { IResponseMessage } from '@/common/ipcBridge';
import type { TChatConversation, TokenUsageData } from '@/common/storage';
import { uuid } from '@/common/utils';
import AgentSetupCard from '@/renderer/components/AgentSetupCard';
import ContextUsageIndicator from '@/renderer/components/ContextUsageIndicator';
import FilePreview from '@/renderer/components/FilePreview';
import HorizontalFileList from '@/renderer/components/HorizontalFileList';
import SendBox from '@/renderer/components/sendbox';
import ThoughtDisplay, { type ThoughtData } from '@/renderer/components/ThoughtDisplay';
import { useAgentReadinessCheck } from '@/renderer/hooks/useAgentReadinessCheck';
import { useAutoTitle } from '@/renderer/hooks/useAutoTitle';
import { useLatestRef } from '@/renderer/hooks/useLatestRef';
import { getSendBoxDraftHook, type FileOrFolderItem } from '@/renderer/hooks/useSendBoxDraft';
import { createSetUploadFile, useSendBoxFiles } from '@/renderer/hooks/useSendBoxFiles';
import { useAddOrUpdateMessage } from '@/renderer/messages/hooks';
import { usePreviewContext } from '@/renderer/pages/conversation/preview';
import { allSupportedExts } from '@/renderer/services/FileService';
import { iconColors } from '@/renderer/theme/colors';
import { emitter, useAddEventListener } from '@/renderer/utils/emitter';
import { mergeFileSelectionItems } from '@/renderer/utils/fileSelection';
import { buildDisplayMessage, collectSelectedFiles } from '@/renderer/utils/messageFiles';
import { getModelContextLimit } from '@/renderer/utils/modelContextLimits';
import { Button, Message, Tag } from '@arco-design/web-react';
import { Plus } from '@icon-park/react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const [waitingResponse, setWaitingResponse] = useState(false); // 等待后端响应（发送消息后到收到 start 之前）
  const [thought, setThought] = useState<ThoughtData>({
    description: '',
    subject: '',
  });
  const [tokenUsage, setTokenUsage] = useState<TokenUsageData | null>(null);
  // 当前活跃的消息 ID，用于过滤旧请求的事件（防止 abort 后的事件干扰新请求）
  // Current active message ID to filter out events from old requests (prevents aborted request events from interfering with new ones)
  const activeMsgIdRef = useRef<string | null>(null);

  // Use refs to avoid useEffect re-subscription when these states change
  // 使用 ref 避免状态变化时 useEffect 重新订阅导致事件丢失
  const hasActiveToolsRef = useRef(hasActiveTools);
  const streamRunningRef = useRef(streamRunning);
  useEffect(() => {
    hasActiveToolsRef.current = hasActiveTools;
  }, [hasActiveTools]);
  useEffect(() => {
    streamRunningRef.current = streamRunning;
  }, [streamRunning]);

  // Think 消息节流：限制更新频率，减少渲染次数
  // Throttle thought updates to reduce render frequency
  const thoughtThrottleRef = useRef<{
    lastUpdate: number;
    pending: ThoughtData | null;
    timer: ReturnType<typeof setTimeout> | null;
  }>({ lastUpdate: 0, pending: null, timer: null });

  const throttledSetThought = useMemo(() => {
    const THROTTLE_MS = 50; // 50ms 节流间隔
    return (data: ThoughtData) => {
      const now = Date.now();
      const ref = thoughtThrottleRef.current;

      // 如果距离上次更新超过节流间隔，立即更新
      if (now - ref.lastUpdate >= THROTTLE_MS) {
        ref.lastUpdate = now;
        ref.pending = null;
        if (ref.timer) {
          clearTimeout(ref.timer);
          ref.timer = null;
        }
        setThought(data);
      } else {
        // 否则保存最新数据，等待下次更新
        ref.pending = data;
        if (!ref.timer) {
          ref.timer = setTimeout(
            () => {
              ref.lastUpdate = Date.now();
              ref.timer = null;
              if (ref.pending) {
                setThought(ref.pending);
                ref.pending = null;
              }
            },
            THROTTLE_MS - (now - ref.lastUpdate)
          );
        }
      }
    };
  }, []);

  // 清理节流定时器
  useEffect(() => {
    return () => {
      if (thoughtThrottleRef.current.timer) {
        clearTimeout(thoughtThrottleRef.current.timer);
      }
    };
  }, []);

  // 综合运行状态：等待响应 或 流在运行 或 有工具在执行/等待确认
  // Combined running state: waiting for response OR stream is running OR tools are active
  const running = waitingResponse || streamRunning || hasActiveTools;

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

      switch (message.type) {
        case 'thought':
          throttledSetThought(message.data as ThoughtData);
          break;
        case 'start':
          setStreamRunning(true);
          setWaitingResponse(false); // 收到 start，可以清除等待状态
          break;
        case 'finish':
          {
            setStreamRunning(false);
            // 只有当没有活跃工具时才清除等待状态和 thought
            // Only clear waiting state and thought when no active tools
            // 当有工具在执行时，工具完成后后端还需要继续向模型发送请求
            // When tools are active, backend needs to continue sending requests to model after tool completion
            if (!hasActiveToolsRef.current) {
              setWaitingResponse(false);
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
            const wasActive = hasActiveToolsRef.current;
            setHasActiveTools(hasActive);

            // 当工具从活跃变为非活跃时，设置 waitingResponse=true
            // 因为后端还需要继续向模型发送请求
            // When tools transition from active to inactive, set waitingResponse=true
            // because backend needs to continue sending requests to model
            if (wasActive && !hasActive && tools.length > 0) {
              setWaitingResponse(true);
            }

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
            } else if (!streamRunningRef.current) {
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
            // Note: 'finished' event is for token usage stats only, NOT for stream end
            // Stream end is signaled by 'finish' event
            // 注意：'finished' 事件仅用于 token 统计，不表示流结束
            // 流结束由 'finish' 事件表示
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
            // DO NOT reset streamRunning/waitingResponse here!
            // For OpenAI-compatible APIs, 'finished' events are emitted per chunk
            // Only 'finish' event should reset the stream state
            // 不要在这里重置 streamRunning/waitingResponse！
            // 对于 OpenAI 兼容 API，每个流块都会发送 'finished' 事件
            // 只有 'finish' 事件才应该重置流状态
          }
          break;
        default: {
          if (message.type === 'error') {
            setWaitingResponse(false);
            onError?.(message as IResponseMessage);
          }
          // Backend handles persistence, Frontend only updates UI
          addOrUpdateMessage(transformMessage(message));
          break;
        }
      }
    });
    // Note: hasActiveTools and streamRunning are accessed via refs to avoid re-subscription
    // 注意：hasActiveTools 和 streamRunning 通过 ref 访问，避免重新订阅导致事件丢失
  }, [conversation_id, addOrUpdateMessage, onError]);

  useEffect(() => {
    setStreamRunning(false);
    setHasActiveTools(false);
    setWaitingResponse(false);
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

  const resetState = useCallback(() => {
    setWaitingResponse(false);
    setStreamRunning(false);
    setHasActiveTools(false);
    setThought({ subject: '', description: '' });
  }, []);

  return { thought, setThought, running, tokenUsage, setActiveMsgId, setWaitingResponse, resetState };
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

  // Agent 自动检测状态 - 仅用于新对话+无auth的场景
  // Agent auto-detection state - only for new conversation + no auth scenario
  const [showSetupCard, setShowSetupCard] = useState(false);
  const [isNewConversation, setIsNewConversation] = useState(true); // 是否是新对话（无消息历史）
  const autoSwitchTriggeredRef = useRef(false); // 防止重复触发

  const { currentModel, getDisplayModelName, providers, geminiModeLookup, getAvailableModels, handleSelectModel } = modelSelection;

  // 判断是否无 auth（无 Google 登录且无 API key 配置）
  // Check if no auth (no Google login AND no API key configured)
  const hasNoAuth = providers.length === 0;

  // Agent readiness check - 仅在无 auth 时使用
  // Agent readiness check - only used when no auth
  const {
    isChecking: agentIsChecking,
    error: agentError,
    availableAgents,
    bestAgent,
    progress: checkProgress,
    currentAgent,
    performFullCheck,
    reset: resetAgentCheck,
  } = useAgentReadinessCheck({
    conversationType: 'gemini',
    autoCheck: false,
  });

  const performFullCheckRef = useLatestRef(performFullCheck);

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

  // 检测 API Key 错误（用户配置问题，不应该自动切换）
  // Detect API Key errors (user configuration issue, should not auto-switch)
  const isApiKeyError = useCallback((data: unknown) => {
    let text = '';
    if (typeof data === 'string') {
      text = data.toLowerCase();
    } else if (data && typeof data === 'object') {
      try {
        text = JSON.stringify(data).toLowerCase();
      } catch {
        return false;
      }
    } else {
      return false;
    }

    // 检测 API key 相关错误 - 这些是用户配置问题，应该显示错误而非自动切换
    // Detect API key related errors - these are user config issues, show error instead of auto-switch
    const hasInvalidApiKey = text.includes('api key not valid') || text.includes('api_key_invalid') || text.includes('invalid api key') || text.includes('google_api_key');
    return hasInvalidApiKey;
  }, []);

  // 检测 API 错误（400, 401, 403, 404, 5xx 等，但排除 API key 错误）
  // Detect API errors (400, 401, 403, 404, 5xx, etc., excluding API key errors)
  const isApiErrorMessage = useCallback(
    (data: unknown) => {
      // 如果是 API key 错误，不视为需要自动切换的 API 错误
      // If it's an API key error, don't treat it as an auto-switch API error
      if (isApiKeyError(data)) {
        return false;
      }

      // 将 data 转换为字符串进行检查
      let text = '';
      if (typeof data === 'string') {
        text = data.toLowerCase();
      } else if (data && typeof data === 'object') {
        // 如果是对象，序列化为 JSON 字符串
        try {
          text = JSON.stringify(data).toLowerCase();
        } catch {
          return false;
        }
      } else {
        return false;
      }

      // 检测常见的 API 错误（排除 API key 错误，因为那是用户配置问题）
      const hasStatusError = /(?:status|code|error)[:\s]*(?:400|401|403|404|500|502|503|504)/i.test(text);
      const hasInvalidUrl = text.includes('invalid url');
      const hasNotFound = text.includes('not found') || text.includes('notfound');
      const hasUnauthorized = text.includes('unauthorized') || text.includes('authentication');
      const hasForbidden = text.includes('forbidden') || text.includes('access denied');
      const hasInvalidArgument = text.includes('invalid_argument');
      return hasStatusError || hasInvalidUrl || hasNotFound || hasUnauthorized || hasForbidden || hasInvalidArgument;
    },
    [isApiKeyError]
  );

  const handleGeminiError = useCallback(
    (message: IResponseMessage) => {
      // API 错误不触发 agent 检测，只处理配额错误
      // API errors do NOT trigger agent detection, only handle quota errors
      if (isApiErrorMessage(message.data)) {
        // Just log the error, don't show setup card
        console.info('API error detected. Not triggering agent detection.');
        return;
      }

      // 然后检查是否是配额错误
      // Then check if it's a quota error
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
    [currentModel, handleSelectModel, isApiErrorMessage, isQuotaErrorMessage, resolveFallbackTarget, t]
  );

  const { thought, running, tokenUsage, setActiveMsgId, setWaitingResponse, resetState } = useGeminiMessage(conversation_id, handleGeminiError);

  useEffect(() => {
    void ipcBridge.conversation.get.invoke({ id: conversation_id }).then((res) => {
      if (!res?.extra?.workspace) return;
      setWorkspacePath(res.extra.workspace);
    });
  }, [conversation_id]);

  // 重置对话状态（不再自动触发检测，检测只在发送新消息时触发）
  // Reset conversation state (detection only triggers on new message, not on mount/tab-switch)
  useEffect(() => {
    setShowSetupCard(false);
    setIsNewConversation(true);
    autoSwitchTriggeredRef.current = false;
    resetAgentCheck();

    void ipcBridge.database.getConversationMessages.invoke({ conversation_id, page: 0, pageSize: 1 }).then((messages) => {
      const hasMessages = messages && messages.length > 0;
      setIsNewConversation(!hasMessages);
    });
  }, [conversation_id, resetAgentCheck]);

  // Dismiss the setup card
  const handleDismissSetupCard = useCallback(() => {
    setShowSetupCard(false);
  }, []);

  // Retry agent check
  const handleRetryCheck = useCallback(() => {
    void performFullCheck();
  }, [performFullCheck]);

  const { atPath, uploadFile, setAtPath, setUploadFile, content, setContent } = useSendBoxDraft(conversation_id);

  const addOrUpdateMessage = useAddOrUpdateMessage();
  const { setSendBoxHandler } = usePreviewContext();

  // Handle initial message from guid page (stored in sessionStorage for instant page transition)
  useEffect(() => {
    const storageKey = `gemini_initial_message_${conversation_id}`;
    const storedMessage = sessionStorage.getItem(storageKey);

    if (!storedMessage) return;

    // 如果无 auth，将消息存储到输入框，并以此为起始检测点触发自动检测
    // If no auth, store message in input box and trigger auto-detection from this new message point
    if (hasNoAuth) {
      try {
        const { input } = JSON.parse(storedMessage) as { input: string };
        setContent(input);
        sessionStorage.removeItem(storageKey);
      } catch {
        // Ignore parse errors
      }
      // 以发起新消息为起始检测点：仅在有初始消息时触发自动检测
      // Detection start point = new message: only trigger when there's an initial message to send
      if (!autoSwitchTriggeredRef.current) {
        autoSwitchTriggeredRef.current = true;
        setShowSetupCard(true);
        void performFullCheckRef.current();
      }
      return;
    }

    if (!currentModel?.useModel) return;

    // Clear immediately to prevent duplicate sends
    sessionStorage.removeItem(storageKey);

    const sendInitialMessage = async () => {
      try {
        const { input, files } = JSON.parse(storedMessage) as { input: string; files?: string[] };

        const msg_id = uuid();
        setActiveMsgId(msg_id);
        setWaitingResponse(true); // 立即设置等待状态，确保按钮显示为停止

        // Display user message immediately
        addOrUpdateMessage(
          {
            id: msg_id,
            type: 'text',
            position: 'right',
            conversation_id,
            content: {
              content: input,
            },
            createdAt: Date.now(),
          },
          true
        );

        // Send message to backend
        await ipcBridge.geminiConversation.sendMessage.invoke({
          input,
          msg_id,
          conversation_id,
          files: files || [],
        });

        void checkAndUpdateTitle(conversation_id, input);
        emitter.emit('chat.history.refresh');
        if (files && files.length > 0) {
          emitter.emit('gemini.workspace.refresh');
        }
      } catch (error) {
        console.error('Failed to send initial message:', error);
      }
    };

    void sendInitialMessage();
  }, [conversation_id, currentModel?.useModel]);

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

  // Listen for sendbox.fill event to populate input from external sources
  useAddEventListener(
    'sendbox.fill',
    (text: string) => {
      setContentRef.current(text);
    },
    []
  );

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
    setWaitingResponse(true); // 立即设置等待状态，确保按钮显示为停止

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
  const handleStop = async (): Promise<void> => {
    // Use finally to ensure UI state is reset even if backend stop fails
    try {
      await ipcBridge.conversation.stop.invoke({ conversation_id });
    } finally {
      resetState();
    }
  };

  return (
    <div className='max-w-800px w-full mx-auto flex flex-col mt-auto mb-16px'>
      {/* Agent Setup Card - 仅在新对话+无auth时显示，自动切换到可用agent */}
      {/* Only show for new conversation + no auth, auto-switch to available agent */}
      {showSetupCard && isNewConversation && hasNoAuth && <AgentSetupCard conversationId={conversation_id} currentAgent={currentAgent} error={agentError} isChecking={agentIsChecking} progress={checkProgress} availableAgents={availableAgents} bestAgent={bestAgent} onDismiss={handleDismissSetupCard} onRetry={handleRetryCheck} autoSwitch={true} initialMessage={content} />}

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
