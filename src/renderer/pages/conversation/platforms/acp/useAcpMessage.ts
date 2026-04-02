/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { transformMessage } from '@/common/chat/chatLib';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { TokenUsageData } from '@/common/config/storage';
import { useAddOrUpdateMessage } from '@/renderer/pages/conversation/Messages/hooks';
import type { ThoughtData } from '@/renderer/components/chat/ThoughtDisplay';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type UseAcpMessageReturn = {
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
};

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
  const [aiProcessing, setAiProcessing] = useState(false); // New loading state for AI response
  const [tokenUsage, setTokenUsage] = useState<TokenUsageData | null>(null);
  const [contextLimit, setContextLimit] = useState<number>(0);

  // Use refs to sync state for immediate access in event handlers
  const runningRef = useRef(running);
  const aiProcessingRef = useRef(aiProcessing);

  // Track whether current turn has content output
  const hasContentInTurnRef = useRef(false);

  // Guard: after finish arrives, prevent auto-recover from setting running=true
  // until a new 'start' signal arrives for the next turn
  const turnFinishedRef = useRef(false);

  // Track whether current turn has a thinking message in the conversation
  const hasThinkingMessageRef = useRef(false);
  const [hasThinkingMessage, setHasThinkingMessage] = useState(false);

  // Track request trace state for displaying complete request lifecycle
  const requestTraceRef = useRef<{
    startTime: number;
    backend: string;
    modelId: string;
    sessionMode?: string;
  } | null>(null);

  // Throttle thought updates to reduce render frequency
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

  // Clean up throttle timer
  useEffect(() => {
    return () => {
      if (thoughtThrottleRef.current.timer) {
        clearTimeout(thoughtThrottleRef.current.timer);
      }
    };
  }, []);

  const handleResponseMessage = useCallback(
    (message: IResponseMessage) => {
      if (conversation_id !== message.conversation_id) {
        return;
      }

      const transformedMessage = transformMessage(message);
      switch (message.type) {
        case 'thought':
          // Thought events are now handled by AcpAgentManager (converted to thinking messages)
          // Only auto-recover running state if turn hasn't finished
          if (!runningRef.current && !turnFinishedRef.current) {
            setRunning(true);
            runningRef.current = true;
          }
          break;
        case 'thinking': {
          const thinkingData = message.data as { status?: string };
          // Only set running for active thinking, not for done signal
          if (thinkingData?.status !== 'done' && !runningRef.current && !turnFinishedRef.current) {
            setRunning(true);
            runningRef.current = true;
          }
          hasThinkingMessageRef.current = true;
          setHasThinkingMessage(true);
          addOrUpdateMessage(transformedMessage);
          break;
        }
        case 'start':
          // New turn starting — clear the finished guard and content flag
          turnFinishedRef.current = false;
          hasContentInTurnRef.current = false;
          setRunning(true);
          runningRef.current = true;
          // Don't reset aiProcessing here - let content arrival handle it
          break;
        case 'finish':
          {
            // Mark turn as finished to prevent auto-recover from late messages
            turnFinishedRef.current = true;
            // Immediate state reset (notification is handled by centralized hook)
            setRunning(false);
            runningRef.current = false;
            setAiProcessing(false);
            aiProcessingRef.current = false;
            setThought({ subject: '', description: '' });
            hasContentInTurnRef.current = false;
            hasThinkingMessageRef.current = false;
            setHasThinkingMessage(false);
            // Log request completion
            if (requestTraceRef.current) {
              const duration = Date.now() - requestTraceRef.current.startTime;
              console.log(
                `%c[RequestTrace]%c FINISH | ${requestTraceRef.current.backend} → ${requestTraceRef.current.modelId} | ${duration}ms | ${new Date().toISOString()}`,
                'color: #52c41a; font-weight: bold',
                'color: inherit'
              );
              requestTraceRef.current = null;
            }
          }
          break;
        case 'content': {
          // First content token — AI has started responding, clear processing indicator
          if (!hasContentInTurnRef.current) {
            hasContentInTurnRef.current = true;
            setAiProcessing(false);
            aiProcessingRef.current = false;
          }
          // Auto-recover running state only if turn hasn't finished
          if (!runningRef.current && !turnFinishedRef.current) {
            setRunning(true);
            runningRef.current = true;
          }
          // Clear thought when final answer arrives
          setThought({ subject: '', description: '' });
          addOrUpdateMessage(transformedMessage);
          break;
        }
        case 'agent_status': {
          // Auto-recover running state only if turn hasn't finished
          if (!runningRef.current && !turnFinishedRef.current) {
            setRunning(true);
            runningRef.current = true;
          }
          // Update ACP/Agent status
          const agentData = message.data as {
            status?: 'connecting' | 'connected' | 'authenticated' | 'session_active' | 'disconnected' | 'error';
            backend?: string;
          };
          if (agentData?.status) {
            setAcpStatus(agentData.status);
            // Reset running state when authentication is complete
            if (['authenticated', 'session_active'].includes(agentData.status)) {
              setRunning(false);
              runningRef.current = false;
            }
            // Reset all loading states on error or disconnect so UI doesn't stay stuck
            if (['error', 'disconnected'].includes(agentData.status)) {
              setRunning(false);
              runningRef.current = false;
              setAiProcessing(false);
              aiProcessingRef.current = false;
            }
          }
          addOrUpdateMessage(transformedMessage);
          break;
        }
        case 'user_content':
          addOrUpdateMessage(transformedMessage);
          break;
        case 'teammate_message': {
          const tmMsg = message.data as import('@/common/chat/chatLib').TMessage;
          if (tmMsg && tmMsg.conversation_id === conversation_id) {
            addOrUpdateMessage(tmMsg);
          }
          break;
        }
        case 'acp_permission':
          // Auto-recover running state only if turn hasn't finished
          if (!runningRef.current && !turnFinishedRef.current) {
            setRunning(true);
            runningRef.current = true;
          }
          addOrUpdateMessage(transformedMessage);
          break;
        case 'acp_model_info':
          // Model info updates are handled by AcpModelSelector, no action needed here
          break;
        case 'slash_commands_updated':
          // Slash commands became available (often during bootstrap when
          // agent_status events are suppressed). Update acpStatus so
          // useSlashCommands re-fetches.
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
        case 'request_trace':
          {
            const trace = message.data as Record<string, unknown>;
            requestTraceRef.current = {
              startTime: Number(trace.timestamp) || Date.now(),
              backend: String(trace.backend || 'unknown'),
              modelId: String(trace.modelId || 'unknown'),
              sessionMode: trace.sessionMode as string | undefined,
            };
            console.log(
              `%c[RequestTrace]%c START | ${trace.backend} → ${trace.modelId} | ${new Date().toISOString()}`,
              'color: #1890ff; font-weight: bold',
              'color: inherit',
              trace
            );
          }
          break;
        case 'error':
          // Stop all loading states when error occurs
          turnFinishedRef.current = true;
          setRunning(false);
          runningRef.current = false;
          setAiProcessing(false);
          aiProcessingRef.current = false;
          addOrUpdateMessage(transformedMessage);
          // Log request error
          if (requestTraceRef.current) {
            const duration = Date.now() - requestTraceRef.current.startTime;
            console.log(
              `%c[RequestTrace]%c ERROR | ${requestTraceRef.current.backend} → ${requestTraceRef.current.modelId} | ${duration}ms | ${new Date().toISOString()}`,
              'color: #ff4d4f; font-weight: bold',
              'color: inherit',
              message.data
            );
            requestTraceRef.current = null;
          }
          break;
        default:
          // Auto-recover running state only if turn hasn't finished
          if (!runningRef.current && !turnFinishedRef.current) {
            setRunning(true);
            runningRef.current = true;
          }
          addOrUpdateMessage(transformedMessage);
          break;
      }
    },
    [conversation_id, addOrUpdateMessage, throttledSetThought, setThought, setRunning, setAiProcessing, setAcpStatus]
  );

  useEffect(() => {
    return ipcBridge.acpConversation.responseStream.on(handleResponseMessage);
  }, [handleResponseMessage]);

  // Reset state when conversation changes and restore actual running status
  useEffect(() => {
    let cancelled = false;

    setThought({ subject: '', description: '' });
    setAcpStatus(null);
    setTokenUsage(null);
    setContextLimit(0);
    hasContentInTurnRef.current = false;
    setHasHydratedRunningState(false);

    // Check actual conversation status from backend before resetting running/aiProcessing
    // to avoid flicker when switching to a running conversation
    void ipcBridge.conversation.get.invoke({ id: conversation_id }).then((res) => {
      if (cancelled) {
        return;
      }

      if (!res) {
        setRunning(false);
        runningRef.current = false;
        setAiProcessing(false);
        aiProcessingRef.current = false;
        setHasHydratedRunningState(true);
        return;
      }
      const isRunning = res.status === 'running';
      setRunning(isRunning);
      runningRef.current = isRunning;
      setAiProcessing(isRunning);
      aiProcessingRef.current = isRunning;
      setHasHydratedRunningState(true);

      // Restore persisted context usage data
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
    };
  }, [conversation_id]);

  const resetState = useCallback(() => {
    turnFinishedRef.current = true;
    setRunning(false);
    runningRef.current = false;
    setAiProcessing(false);
    aiProcessingRef.current = false;
    setThought({ subject: '', description: '' });
    hasContentInTurnRef.current = false;
    hasThinkingMessageRef.current = false;
    setHasThinkingMessage(false);
  }, []);

  return {
    thought,
    setThought,
    running,
    hasHydratedRunningState,
    acpStatus,
    aiProcessing,
    setAiProcessing,
    resetState,
    tokenUsage,
    contextLimit,
    hasThinkingMessage,
  };
};
