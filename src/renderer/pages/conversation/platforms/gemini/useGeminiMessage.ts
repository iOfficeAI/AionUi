import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import { transformMessage } from '@/common/chat/chatLib';
import type { TChatConversation, TokenUsageData } from '@/common/config/storage';
import type { ThoughtData } from '@/renderer/components/chat/ThoughtDisplay';
import { useAddOrUpdateMessage } from '@/renderer/pages/conversation/Messages/hooks';
import { emitter } from '@/renderer/utils/emitter';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type UseGeminiMessageReturn = {
  thought: ThoughtData;
  setThought: React.Dispatch<React.SetStateAction<ThoughtData>>;
  running: boolean;
  hasHydratedRunningState: boolean;
  tokenUsage: TokenUsageData | null;
  hasStreamingContent: boolean;
  setActiveMsgId: (msgId: string | null) => void;
  setWaitingResponse: React.Dispatch<React.SetStateAction<boolean>>;
  resetState: () => void;
  hasThinkingMessage: boolean;
};

export const useGeminiMessage = (
  conversation_id: string,
  onError?: (message: IResponseMessage) => void
): UseGeminiMessageReturn => {
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const [streamRunning, setStreamRunning] = useState(false);
  const [hasActiveTools, setHasActiveTools] = useState(false);
  const [waitingResponse, setWaitingResponse] = useState(false);
  const [hasHydratedRunningState, setHasHydratedRunningState] = useState(false);
  const [thought, setThought] = useState<ThoughtData>({
    description: '',
    subject: '',
  });
  const [tokenUsage, setTokenUsage] = useState<TokenUsageData | null>(null);
  const [hasStreamingContent, setHasStreamingContent] = useState(false);
  const hasStreamingContentRef = useRef(false);

  const activeMsgIdRef = useRef<string | null>(null);
  const hasActiveToolsRef = useRef(hasActiveTools);
  const streamRunningRef = useRef(streamRunning);
  const waitingResponseRef = useRef(waitingResponse);
  const hasContentInTurnRef = useRef(false);
  const hasThinkingMessageRef = useRef(false);
  const waitingResponseClearFrameRef = useRef<number | null>(null);
  const [hasThinkingMessage, setHasThinkingMessage] = useState(false);

  const requestTraceRef = useRef<{
    startTime: number;
    provider: string;
    modelId: string;
  } | null>(null);

  useEffect(() => {
    hasActiveToolsRef.current = hasActiveTools;
  }, [hasActiveTools]);

  useEffect(() => {
    streamRunningRef.current = streamRunning;
  }, [streamRunning]);

  const setStreamingContent = useCallback(
    (nextValue: boolean) => {
      if (hasStreamingContentRef.current === nextValue) {
        return;
      }
      hasStreamingContentRef.current = nextValue;
      setHasStreamingContent(nextValue);
      emitter.emit('conversation.streaming', {
        conversationId: conversation_id,
        isStreaming: nextValue,
      });
    },
    [conversation_id]
  );

  const cancelWaitingResponseClear = useCallback(() => {
    if (typeof window !== 'undefined' && waitingResponseClearFrameRef.current !== null) {
      window.cancelAnimationFrame(waitingResponseClearFrameRef.current);
    }
    waitingResponseClearFrameRef.current = null;
  }, []);

  const clearWaitingResponseAfterPaint = useCallback(() => {
    cancelWaitingResponseClear();

    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      setWaitingResponse(false);
      waitingResponseRef.current = false;
      return;
    }

    waitingResponseClearFrameRef.current = window.requestAnimationFrame(() => {
      waitingResponseClearFrameRef.current = window.requestAnimationFrame(() => {
        waitingResponseClearFrameRef.current = null;
        setWaitingResponse(false);
        waitingResponseRef.current = false;
      });
    });
  }, [cancelWaitingResponseClear]);

  const thoughtThrottleRef = useRef<{
    lastUpdate: number;
    pending: ThoughtData | null;
    timer: ReturnType<typeof setTimeout> | null;
  }>({ lastUpdate: 0, pending: null, timer: null });

  const throttledSetThought = useMemo(() => {
    const THROTTLE_MS = 50;
    return (data: ThoughtData) => {
      const now = Date.now();
      const ref = thoughtThrottleRef.current;

      if (now - ref.lastUpdate >= THROTTLE_MS) {
        ref.lastUpdate = now;
        ref.pending = null;
        if (ref.timer) {
          clearTimeout(ref.timer);
          ref.timer = null;
        }
        setThought(data);
      } else {
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

  useEffect(() => {
    return () => {
      if (thoughtThrottleRef.current.timer) {
        clearTimeout(thoughtThrottleRef.current.timer);
      }
      cancelWaitingResponseClear();
    };
  }, [cancelWaitingResponseClear]);

  const running = waitingResponse || streamRunning || hasActiveTools;

  const setActiveMsgId = useCallback((msgId: string | null) => {
    activeMsgIdRef.current = msgId;
  }, []);

  useEffect(() => {
    return ipcBridge.geminiConversation.responseStream.on((message) => {
      if (conversation_id !== message.conversation_id) {
        return;
      }

      if (activeMsgIdRef.current && message.msg_id && message.msg_id !== activeMsgIdRef.current) {
        if (message.type === 'thought') {
          return;
        }
      }

      switch (message.type) {
        case 'thought':
          if (!streamRunningRef.current) {
            setStreamRunning(true);
            streamRunningRef.current = true;
          }
          throttledSetThought(message.data as ThoughtData);
          break;
        case 'thinking': {
          const thinkingData = message.data as { status?: string };
          if (thinkingData?.status !== 'done' && !streamRunningRef.current) {
            setStreamRunning(true);
            streamRunningRef.current = true;
          }
          hasThinkingMessageRef.current = true;
          setHasThinkingMessage(true);
          addOrUpdateMessage(transformMessage(message));
          break;
        }
        case 'start':
          cancelWaitingResponseClear();
          hasContentInTurnRef.current = false;
          setStreamingContent(false);
          setStreamRunning(true);
          streamRunningRef.current = true;
          break;
        case 'finish': {
          cancelWaitingResponseClear();
          setStreamRunning(false);
          streamRunningRef.current = false;
          setWaitingResponse(false);
          waitingResponseRef.current = false;
          setThought({ subject: '', description: '' });
          hasContentInTurnRef.current = false;
          setStreamingContent(false);
          hasThinkingMessageRef.current = false;
          setHasThinkingMessage(false);
          if (requestTraceRef.current) {
            const duration = Date.now() - requestTraceRef.current.startTime;
            console.log(
              `%c[RequestTrace]%c FINISH | ${requestTraceRef.current.provider} -> ${requestTraceRef.current.modelId} | ${duration}ms | ${new Date().toISOString()}`,
              'color: #52c41a; font-weight: bold',
              'color: inherit'
            );
            requestTraceRef.current = null;
          }
          break;
        }
        case 'tool_group': {
          hasContentInTurnRef.current = true;

          if (!streamRunningRef.current) {
            setStreamRunning(true);
            streamRunningRef.current = true;
          }

          const tools = message.data as Array<{ status: string; name?: string }>;
          const activeStatuses = new Set(['Executing', 'Confirming', 'Pending']);
          const hasActive = tools.some((tool) => activeStatuses.has(tool.status));
          const wasActive = hasActiveToolsRef.current;

          setHasActiveTools(hasActive);
          hasActiveToolsRef.current = hasActive;

          if (wasActive && !hasActive && tools.length > 0) {
            setWaitingResponse(true);
            waitingResponseRef.current = true;
          }

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
            setThought({ subject: '', description: '' });
          }

          addOrUpdateMessage(transformMessage(message));
          break;
        }
        case 'finished': {
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
          break;
        }
        case 'request_trace': {
          const trace = message.data as Record<string, unknown>;
          requestTraceRef.current = {
            startTime: Number(trace.timestamp) || Date.now(),
            provider: String(trace.platform || trace.provider || 'unknown'),
            modelId: String(trace.modelId || 'unknown'),
          };
          console.log(
            `%c[RequestTrace]%c START | ${requestTraceRef.current.provider} -> ${trace.modelId} | ${new Date().toISOString()}`,
            'color: #1890ff; font-weight: bold',
            'color: inherit',
            trace
          );
          break;
        }
        default: {
          const transformedMessage = transformMessage(message);
          if (message.type === 'error') {
            cancelWaitingResponseClear();
            setWaitingResponse(false);
            waitingResponseRef.current = false;
            setStreamingContent(false);
            onError?.(message as IResponseMessage);
            if (requestTraceRef.current) {
              const duration = Date.now() - requestTraceRef.current.startTime;
              console.log(
                `%c[RequestTrace]%c ERROR | ${requestTraceRef.current.provider} -> ${requestTraceRef.current.modelId} | ${duration}ms | ${new Date().toISOString()}`,
                'color: #ff4d4f; font-weight: bold',
                'color: inherit',
                message.data
              );
              requestTraceRef.current = null;
            }
          } else {
            if (message.type === 'content') {
              const isFirstContentChunk = !hasContentInTurnRef.current;
              hasContentInTurnRef.current = true;
              setStreamingContent(true);
              if (isFirstContentChunk) {
                clearWaitingResponseAfterPaint();
              }
            }
            if (!streamRunningRef.current) {
              setStreamRunning(true);
              streamRunningRef.current = true;
            }
          }
          addOrUpdateMessage(transformedMessage);
          break;
        }
      }
    });
  }, [
    addOrUpdateMessage,
    cancelWaitingResponseClear,
    clearWaitingResponseAfterPaint,
    conversation_id,
    onError,
    setStreamingContent,
    throttledSetThought,
  ]);

  useEffect(() => {
    let cancelled = false;

    setThought({ subject: '', description: '' });
    setTokenUsage(null);
    hasContentInTurnRef.current = false;
    setStreamingContent(false);
    hasThinkingMessageRef.current = false;
    setHasThinkingMessage(false);
    setHasHydratedRunningState(false);
    cancelWaitingResponseClear();

    void ipcBridge.conversation.get.invoke({ id: conversation_id }).then((res) => {
      if (cancelled) {
        return;
      }

      if (!res) {
        setStreamRunning(false);
        streamRunningRef.current = false;
        setHasActiveTools(false);
        hasActiveToolsRef.current = false;
        setWaitingResponse(false);
        waitingResponseRef.current = false;
        setStreamingContent(false);
        setHasHydratedRunningState(true);
        return;
      }

      const isRunning = res.status === 'running';
      setStreamRunning(isRunning);
      streamRunningRef.current = isRunning;
      setHasActiveTools(false);
      hasActiveToolsRef.current = false;
      setWaitingResponse(isRunning);
      waitingResponseRef.current = isRunning;
      setStreamingContent(false);

      if (res.type === 'gemini' && res.extra?.lastTokenUsage) {
        const { lastTokenUsage } = res.extra;
        if (lastTokenUsage.totalTokens > 0) {
          setTokenUsage(lastTokenUsage);
        }
      }
      setHasHydratedRunningState(true);
    });

    return () => {
      cancelled = true;
      emitter.emit('conversation.streaming', {
        conversationId: conversation_id,
        isStreaming: false,
      });
    };
  }, [conversation_id, setStreamingContent]);

  const resetState = useCallback(() => {
    setWaitingResponse(false);
    waitingResponseRef.current = false;
    setStreamRunning(false);
    streamRunningRef.current = false;
    setHasActiveTools(false);
    hasActiveToolsRef.current = false;
    setThought({ subject: '', description: '' });
    hasContentInTurnRef.current = false;
    setStreamingContent(false);
    hasThinkingMessageRef.current = false;
    setHasThinkingMessage(false);
    activeMsgIdRef.current = null;
    cancelWaitingResponseClear();
  }, [cancelWaitingResponseClear, setStreamingContent]);

  return {
    thought,
    setThought,
    running,
    hasHydratedRunningState,
    tokenUsage,
    hasStreamingContent,
    setActiveMsgId,
    setWaitingResponse,
    resetState,
    hasThinkingMessage,
  };
};
