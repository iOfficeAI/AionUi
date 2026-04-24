/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IConversationTurnCompletedEvent, IResponseMessage } from '@/common/adapter/ipcBridge';
import { transformMessage } from '@/common/chat/chatLib';
import type { TokenUsageData } from '@/common/config/storage';
import type { ThoughtData } from '@/renderer/components/chat/ThoughtDisplay';
import { useAddOrUpdateMessage } from '@/renderer/pages/conversation/Messages/hooks';
import { emitter } from '@/renderer/utils/emitter';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type UseAcpMessageReturn = {
  thought: ThoughtData;
  setThought: React.Dispatch<React.SetStateAction<ThoughtData>>;
  running: boolean;
  hasHydratedRunningState: boolean;
  acpStatus: 'connecting' | 'connected' | 'authenticated' | 'session_active' | 'disconnected' | 'error' | null;
  aiProcessing: boolean;
  setAiProcessing: React.Dispatch<React.SetStateAction<boolean>>;
  resetState: () => void;
  tokenUsage: TokenUsageData | null;
  contextLimit: number;
  hasThinkingMessage: boolean;
  hasStreamingContent: boolean;
  activity: AcpActivity | null;
};

export type AcpActivity =
  | { phase: 'recovering' }
  | { phase: 'waiting' }
  | { phase: 'thinking' }
  | { phase: 'streaming' }
  | { phase: 'permission' }
  | { phase: 'tool'; title?: string; status?: string };

const ACTIVE_TOOL_STATUSES = new Set(['pending', 'in_progress']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getAcpToolUpdate(data: unknown): { title?: string; status?: string } | null {
  if (!isRecord(data)) return null;
  const update = isRecord(data.update)
    ? data.update
    : isRecord(data.content) && isRecord(data.content.update)
      ? data.content.update
      : null;
  if (!update) return null;

  return {
    title: typeof update.title === 'string' ? update.title : undefined,
    status: typeof update.status === 'string' ? update.status : undefined,
  };
}

export const useAcpMessage = (conversation_id: string): UseAcpMessageReturn => {
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const [running, setRunning] = useState(false);
  const [hasHydratedRunningState, setHasHydratedRunningState] = useState(false);
  const [thought, setThought] = useState<ThoughtData>({
    description: '',
    subject: '',
  });
  const [acpStatus, setAcpStatus] = useState<
    'connecting' | 'connected' | 'authenticated' | 'session_active' | 'disconnected' | 'error' | null
  >(null);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [tokenUsage, setTokenUsage] = useState<TokenUsageData | null>(null);
  const [contextLimit, setContextLimit] = useState<number>(0);
  const [hasStreamingContent, setHasStreamingContent] = useState(false);
  const [activity, setActivity] = useState<AcpActivity | null>(null);
  const hasStreamingContentRef = useRef(false);

  const runningRef = useRef(running);
  const aiProcessingRef = useRef(aiProcessing);
  const hasContentInTurnRef = useRef(false);
  const turnFinishedRef = useRef(false);
  const hasThinkingMessageRef = useRef(false);
  const aiProcessingClearFrameRef = useRef<number | null>(null);
  const [hasThinkingMessage, setHasThinkingMessage] = useState(false);

  const setAiProcessingState = useCallback((nextValue: React.SetStateAction<boolean>) => {
    setAiProcessing((prevValue) => {
      const resolvedValue =
        typeof nextValue === 'function' ? (nextValue as (value: boolean) => boolean)(prevValue) : nextValue;
      aiProcessingRef.current = resolvedValue;
      return resolvedValue;
    });
  }, []);

  const requestTraceRef = useRef<{
    startTime: number;
    backend: string;
    modelId: string;
    sessionMode?: string;
  } | null>(null);

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

  const cancelAiProcessingClear = useCallback(() => {
    if (typeof window !== 'undefined' && aiProcessingClearFrameRef.current !== null) {
      window.cancelAnimationFrame(aiProcessingClearFrameRef.current);
    }
    aiProcessingClearFrameRef.current = null;
  }, []);

  const clearAiProcessingAfterPaint = useCallback(() => {
    cancelAiProcessingClear();

    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
      setAiProcessingState(false);
      return;
    }

    aiProcessingClearFrameRef.current = window.requestAnimationFrame(() => {
      aiProcessingClearFrameRef.current = window.requestAnimationFrame(() => {
        aiProcessingClearFrameRef.current = null;
        setAiProcessingState(false);
      });
    });
  }, [cancelAiProcessingClear, setAiProcessingState]);

  const resetTurnUi = useCallback(
    (nextRunning: boolean) => {
      cancelAiProcessingClear();
      setRunning(nextRunning);
      runningRef.current = nextRunning;
      setAiProcessingState(false);
      setThought({ subject: '', description: '' });
      setActivity(nextRunning ? { phase: 'waiting' } : null);
      hasContentInTurnRef.current = false;
      setStreamingContent(false);
      hasThinkingMessageRef.current = false;
      setHasThinkingMessage(false);
    },
    [cancelAiProcessingClear, setAiProcessingState, setStreamingContent]
  );

  useEffect(() => {
    return () => {
      if (thoughtThrottleRef.current.timer) {
        clearTimeout(thoughtThrottleRef.current.timer);
      }
      cancelAiProcessingClear();
    };
  }, [cancelAiProcessingClear]);

  const handleResponseMessage = useCallback(
    (message: IResponseMessage) => {
      if (conversation_id !== message.conversation_id) {
        return;
      }

      let hasTransformedMessage = false;
      let transformedMessage: ReturnType<typeof transformMessage>;
      const addTransformedMessage = () => {
        if (!hasTransformedMessage) {
          transformedMessage = transformMessage(message);
          hasTransformedMessage = true;
        }
        if (transformedMessage) {
          addOrUpdateMessage(transformedMessage);
        }
      };

      switch (message.type) {
        case 'thought':
          if (!runningRef.current && !turnFinishedRef.current) {
            setRunning(true);
            runningRef.current = true;
          }
          setActivity({ phase: 'thinking' });
          throttledSetThought(message.data as ThoughtData);
          break;
        case 'thinking': {
          const thinkingData = message.data as { status?: string };
          if (thinkingData?.status !== 'done' && !runningRef.current && !turnFinishedRef.current) {
            setRunning(true);
            runningRef.current = true;
          }
          setActivity({ phase: 'thinking' });
          hasThinkingMessageRef.current = true;
          setHasThinkingMessage(true);
          addTransformedMessage();
          break;
        }
        case 'start':
          cancelAiProcessingClear();
          turnFinishedRef.current = false;
          hasContentInTurnRef.current = false;
          setStreamingContent(false);
          setActivity({ phase: 'waiting' });
          setRunning(true);
          runningRef.current = true;
          break;
        case 'finish': {
          const isFinalizing = message.turnPhase === 'finalizing';
          turnFinishedRef.current = !isFinalizing;
          resetTurnUi(isFinalizing);
          if (requestTraceRef.current) {
            const duration = Date.now() - requestTraceRef.current.startTime;
            console.log(
              `%c[RequestTrace]%c FINISH | ${requestTraceRef.current.backend} -> ${requestTraceRef.current.modelId} | ${duration}ms | ${new Date().toISOString()}`,
              'color: #52c41a; font-weight: bold',
              'color: inherit'
            );
            requestTraceRef.current = null;
          }
          break;
        }
        case 'content': {
          const isFirstContentChunk = !hasContentInTurnRef.current;
          if (isFirstContentChunk) {
            hasContentInTurnRef.current = true;
          }
          setStreamingContent(true);
          setActivity({ phase: 'streaming' });
          if (!runningRef.current && !turnFinishedRef.current) {
            setRunning(true);
            runningRef.current = true;
          }
          setThought({ subject: '', description: '' });
          addTransformedMessage();
          if (isFirstContentChunk) {
            clearAiProcessingAfterPaint();
          }
          break;
        }
        case 'agent_status': {
          const agentData = message.data as {
            status?: 'connecting' | 'connected' | 'authenticated' | 'session_active' | 'disconnected' | 'error';
            backend?: string;
          };
          if (agentData?.status) {
            setAcpStatus(agentData.status);
            if (['error', 'disconnected'].includes(agentData.status)) {
              cancelAiProcessingClear();
              setRunning(false);
              runningRef.current = false;
              setAiProcessingState(false);
              setStreamingContent(false);
              setActivity(null);
            } else {
              const hasActiveTurnActivity =
                runningRef.current ||
                aiProcessingRef.current ||
                hasContentInTurnRef.current ||
                hasStreamingContentRef.current ||
                hasThinkingMessageRef.current;

              if (['authenticated', 'session_active'].includes(agentData.status)) {
                if (!hasActiveTurnActivity) {
                  setRunning(false);
                  runningRef.current = false;
                }
              } else if (!runningRef.current && !turnFinishedRef.current && hasActiveTurnActivity) {
                setRunning(true);
                runningRef.current = true;
              }
            }
          }
          addTransformedMessage();
          break;
        }
        case 'user_content':
          addTransformedMessage();
          break;
        case 'teammate_message': {
          const tmMsg = message.data as import('@/common/chat/chatLib').TMessage;
          if (tmMsg && tmMsg.conversation_id === conversation_id) {
            addOrUpdateMessage(tmMsg);
          }
          break;
        }
        case 'acp_permission':
          turnFinishedRef.current = false;
          if (!runningRef.current) {
            setRunning(true);
            runningRef.current = true;
          }
          setActivity({ phase: 'permission' });
          addTransformedMessage();
          break;
        case 'acp_tool_call': {
          const toolUpdate = getAcpToolUpdate(message.data);
          turnFinishedRef.current = false;
          if (!runningRef.current) {
            setRunning(true);
            runningRef.current = true;
          }
          if (toolUpdate?.status && !ACTIVE_TOOL_STATUSES.has(toolUpdate.status)) {
            setActivity({ phase: 'waiting' });
          } else {
            setActivity({
              phase: 'tool',
              title: toolUpdate?.title,
              status: toolUpdate?.status,
            });
          }
          addTransformedMessage();
          break;
        }
        case 'acp_model_info':
          break;
        case 'slash_commands_updated':
          setAcpStatus((prev) => prev ?? 'session_active');
          break;
        case 'acp_context_usage': {
          const usageData = message.data as { used: number; size: number };
          if (usageData && typeof usageData.used === 'number') {
            setTokenUsage({ totalTokens: usageData.used });
            if (usageData.size > 0) {
              setContextLimit(usageData.size);
            }
          }
          break;
        }
        case 'request_trace': {
          const trace = message.data as Record<string, unknown>;
          requestTraceRef.current = {
            startTime: Number(trace.timestamp) || Date.now(),
            backend: String(trace.backend || 'unknown'),
            modelId: String(trace.modelId || 'unknown'),
            sessionMode: trace.sessionMode as string | undefined,
          };
          setActivity({ phase: 'waiting' });
          console.log(
            `%c[RequestTrace]%c START | ${trace.backend} -> ${trace.modelId} | ${new Date().toISOString()}`,
            'color: #1890ff; font-weight: bold',
            'color: inherit',
            trace
          );
          break;
        }
        case 'error':
          turnFinishedRef.current = true;
          resetTurnUi(false);
          addTransformedMessage();
          if (requestTraceRef.current) {
            const duration = Date.now() - requestTraceRef.current.startTime;
            console.log(
              `%c[RequestTrace]%c ERROR | ${requestTraceRef.current.backend} -> ${requestTraceRef.current.modelId} | ${duration}ms | ${new Date().toISOString()}`,
              'color: #ff4d4f; font-weight: bold',
              'color: inherit',
              message.data
            );
            requestTraceRef.current = null;
          }
          break;
        default:
          if (!runningRef.current && !turnFinishedRef.current) {
            setRunning(true);
            runningRef.current = true;
          }
          addTransformedMessage();
          break;
      }
    },
    [
      addOrUpdateMessage,
      cancelAiProcessingClear,
      clearAiProcessingAfterPaint,
      conversation_id,
      resetTurnUi,
      setAiProcessingState,
      setStreamingContent,
      throttledSetThought,
    ]
  );

  useEffect(() => {
    return ipcBridge.acpConversation.responseStream.on(handleResponseMessage);
  }, [handleResponseMessage]);

  useEffect(() => {
    const handleTurnCompleted = (event: IConversationTurnCompletedEvent) => {
      if (event.sessionId !== conversation_id) {
        return;
      }

      turnFinishedRef.current = true;
      resetTurnUi(false);
    };

    return ipcBridge.conversation.turnCompleted?.on?.(handleTurnCompleted) || (() => {});
  }, [conversation_id, resetTurnUi]);

  useEffect(() => {
    let cancelled = false;

    setThought({ subject: '', description: '' });
    setActivity(null);
    setAcpStatus(null);
    setTokenUsage(null);
    setContextLimit(0);
    hasContentInTurnRef.current = false;
    turnFinishedRef.current = false;
    hasThinkingMessageRef.current = false;
    setHasThinkingMessage(false);
    setStreamingContent(false);
    setHasHydratedRunningState(false);
    cancelAiProcessingClear();
    setRunning(false);
    runningRef.current = false;
    setAiProcessingState(false);
    void ipcBridge.conversation.get.invoke({ id: conversation_id }).then((res) => {
      if (cancelled) {
        return;
      }

      if (!res) {
        setRunning(false);
        runningRef.current = false;
        setAiProcessingState(false);
        setStreamingContent(false);
        setActivity(null);
        setHasHydratedRunningState(true);
        return;
      }

      const isRunning = res.status === 'running';
      setRunning(isRunning);
      runningRef.current = isRunning;
      if (isRunning) {
        setAiProcessingState(true);
        setActivity({ phase: 'recovering' });
      } else if (!aiProcessingRef.current) {
        setActivity(null);
      }
      turnFinishedRef.current = !isRunning;
      setStreamingContent(false);
      setHasHydratedRunningState(true);

      if (res.type === 'acp' && res.extra?.lastTokenUsage) {
        const { lastTokenUsage, lastContextLimit } = res.extra;
        if (lastTokenUsage.totalTokens > 0) {
          setTokenUsage(lastTokenUsage);
        }
        if (lastContextLimit && lastContextLimit > 0) {
          setContextLimit(lastContextLimit);
        }
      }
    });

    return () => {
      cancelled = true;
      emitter.emit('conversation.streaming', {
        conversationId: conversation_id,
        isStreaming: false,
      });
    };
  }, [cancelAiProcessingClear, conversation_id, setAiProcessingState, setStreamingContent]);

  const resetState = useCallback(() => {
    turnFinishedRef.current = true;
    resetTurnUi(false);
  }, [resetTurnUi]);

  return {
    thought,
    setThought,
    running,
    hasHydratedRunningState,
    acpStatus,
    aiProcessing,
    setAiProcessing: setAiProcessingState,
    resetState,
    tokenUsage,
    contextLimit,
    hasThinkingMessage,
    hasStreamingContent,
    activity,
  };
};
