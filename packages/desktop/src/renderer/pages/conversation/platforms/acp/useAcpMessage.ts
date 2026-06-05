/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isErrorTipMessage, transformMessage } from '@/common/chat/chatLib';
import type { AvailableCommand } from '@/common/chat/chatLib';
import type { SlashCommandItem } from '@/common/chat/slash/types';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { TokenUsageData } from '@/common/config/storage';
import { useAddOrUpdateMessage } from '@/renderer/pages/conversation/Messages/hooks';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { isConversationProcessing } from '@/renderer/pages/conversation/utils/conversationRuntime';
import { warmupConversation } from '@/renderer/pages/conversation/utils/warmupConversation';
import type { ThoughtData } from '@/renderer/components/chat/ThoughtDisplay';
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
  context_limit: number;
  hasThinkingMessage: boolean;
  slashCommands: SlashCommandItem[];
  fetchSlashCommands: () => void;
};

export const useAcpMessage = (conversation_id: string, options?: { skipWarmup?: boolean }): UseAcpMessageReturn => {
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
  const [context_limit, setContextLimit] = useState<number>(0);
  const [slashCommands, setSlashCommands] = useState<SlashCommandItem[]>([]);

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
  const activeThinkingRef = useRef<{ msgId: string; startedAt: number } | null>(null);

  // Track request trace state for displaying complete request lifecycle
  const requestTraceRef = useRef<{
    startTime: number;
    backend: string;
    model_id: string;
    session_mode?: string;
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

  const completeActiveThinking = useCallback(
    (
      boundaryMessage: Pick<IResponseMessage, 'conversation_id' | 'created_at'>,
      completeOptions?: {
        duration?: number;
      }
    ) => {
      const activeThinking = activeThinkingRef.current;
      if (!activeThinking) return;

      const endTime = boundaryMessage.created_at ?? Date.now();
      const duration = completeOptions?.duration ?? Math.max(0, endTime - activeThinking.startedAt);

      addOrUpdateMessage({
        id: `${activeThinking.msgId}-thinking-done`,
        type: 'thinking',
        msg_id: activeThinking.msgId,
        conversation_id: boundaryMessage.conversation_id,
        position: 'left',
        created_at: endTime,
        content: {
          content: '',
          duration,
          status: 'done',
        },
      });

      activeThinkingRef.current = null;
    },
    [addOrUpdateMessage]
  );

  const handleResponseMessage = useCallback(
    (message: IResponseMessage) => {
      if (conversation_id !== message.conversation_id) {
        return;
      }

      if (message.type === 'skill_suggest' || message.type === 'cron_trigger') {
        return;
      }

      if (isErrorTipMessage(message)) {
        turnFinishedRef.current = true;
        setRunning(false);
        runningRef.current = false;
        setAiProcessing(false);
        aiProcessingRef.current = false;
        setThought({ subject: '', description: '' });
        hasContentInTurnRef.current = false;
        hasThinkingMessageRef.current = false;
        activeThinkingRef.current = null;
        setHasThinkingMessage(false);
        const transformedMessage = transformMessage(message);
        if (transformedMessage) {
          addOrUpdateMessage(transformedMessage);
        }
        return;
      }

      const shouldCompleteThinking =
        activeThinkingRef.current &&
        ![
          'thought',
          'thinking',
          'start',
          'request_trace',
          'acp_context_usage',
          'acp_model_info',
          'codex_model_info',
          'available_commands',
          'slash_commands_updated',
          'agent_status',
          'user_content',
          'teammate_message',
        ].includes(message.type);

      if (shouldCompleteThinking) {
        completeActiveThinking(message);
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
          const thinkingData = message.data as { status?: string; duration?: number; duration_ms?: number };
          if (thinkingData?.status === 'done') {
            if (activeThinkingRef.current?.msgId === message.msg_id) {
              completeActiveThinking(message, {
                duration: thinkingData.duration ?? thinkingData.duration_ms,
              });
            }
            break;
          }

          // Only set running for active thinking, not for done signal
          if (!runningRef.current && !turnFinishedRef.current) {
            setRunning(true);
            runningRef.current = true;
          }
          if (!activeThinkingRef.current) {
            activeThinkingRef.current = {
              msgId: message.msg_id,
              startedAt: message.created_at ?? Date.now(),
            };
          } else if (activeThinkingRef.current.msgId !== message.msg_id) {
            activeThinkingRef.current = {
              msgId: message.msg_id,
              startedAt: message.created_at ?? Date.now(),
            };
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
            activeThinkingRef.current = null;
            setHasThinkingMessage(false);
            // Log request completion
            if (requestTraceRef.current) {
              const duration = Date.now() - requestTraceRef.current.startTime;
              console.log(
                `%c[RequestTrace]%c FINISH | ${requestTraceRef.current.backend} → ${requestTraceRef.current.model_id} | ${duration}ms | ${new Date().toISOString()}`,
                'color: #52c41a; font-weight: bold',
                'color: inherit'
              );
              requestTraceRef.current = null;
            }
          }
          break;
        case 'text':
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
            if (tmMsg.type === 'text') {
              const raw = tmMsg.content as unknown;
              if (typeof raw === 'string') {
                try {
                  const parsed = JSON.parse(raw) as Record<string, unknown>;
                  if (typeof parsed.content === 'string') {
                    tmMsg.content = {
                      content: parsed.content,
                      ...(parsed.teammate_message ? { teammateMessage: true } : {}),
                      ...(parsed.sender_name ? { senderName: parsed.sender_name as string } : {}),
                      ...(parsed.sender_backend ? { senderAgentType: parsed.sender_backend as string } : {}),
                      ...(parsed.sender_conversation_id
                        ? { senderConversationId: parsed.sender_conversation_id as string }
                        : {}),
                    };
                  }
                } catch {
                  /* keep original */
                }
              } else if (typeof raw === 'object' && raw !== null) {
                const obj = raw as Record<string, unknown>;
                if (obj.teammate_message && !obj.teammateMessage) {
                  tmMsg.content = {
                    content: (obj.content as string) ?? '',
                    teammateMessage: true,
                    ...(obj.sender_name ? { senderName: obj.sender_name as string } : {}),
                    ...(obj.sender_backend ? { senderAgentType: obj.sender_backend as string } : {}),
                    ...(obj.sender_conversation_id
                      ? { senderConversationId: obj.sender_conversation_id as string }
                      : {}),
                  };
                }
              }
            }
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
        case 'available_commands': {
          const cmdData = message.data as { commands?: AvailableCommand[] };
          if (cmdData?.commands && Array.isArray(cmdData.commands)) {
            setSlashCommands(
              cmdData.commands.map((c) => ({
                name: c.name,
                description: c.description,
                kind: 'template' as const,
                source: 'acp' as const,
                selectionBehavior: 'insert' as const,
              }))
            );
          }
          break;
        }
        case 'acp_context_usage': {
          const usageData = message.data as { used: number; size: number };
          if (usageData && typeof usageData.used === 'number') {
            setTokenUsage({ total_tokens: usageData.used });
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
              model_id: String(trace.model_id || 'unknown'),
              session_mode: trace.session_mode as string | undefined,
            };
            console.log(
              `%c[RequestTrace]%c START | ${trace.backend} → ${trace.model_id} | ${new Date().toISOString()}`,
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
          activeThinkingRef.current = null;
          addOrUpdateMessage(transformedMessage);
          // Log request error
          if (requestTraceRef.current) {
            const duration = Date.now() - requestTraceRef.current.startTime;
            console.log(
              `%c[RequestTrace]%c ERROR | ${requestTraceRef.current.backend} → ${requestTraceRef.current.model_id} | ${duration}ms | ${new Date().toISOString()}`,
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
    [
      conversation_id,
      addOrUpdateMessage,
      completeActiveThinking,
      throttledSetThought,
      setThought,
      setRunning,
      setAiProcessing,
      setAcpStatus,
    ]
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
    setSlashCommands([]);
    hasContentInTurnRef.current = false;
    turnFinishedRef.current = false;
    hasThinkingMessageRef.current = false;
    activeThinkingRef.current = null;
    setHasThinkingMessage(false);
    setHasHydratedRunningState(false);

    // Clear running/processing immediately for the new conversation. Hydration only
    // turns these back on when the backend reports runtime processing state. Otherwise
    // conversation.get's idle branch raced with useAcpInitialMessage's
    // setAiProcessing(true) and hid ThoughtDisplay until the first stream event.
    setRunning(false);
    runningRef.current = false;
    setAiProcessing(false);
    aiProcessingRef.current = false;

    void getConversationOrNull(conversation_id)
      .then((res) => {
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
        const isRunning = isConversationProcessing(res);
        setRunning(isRunning);
        runningRef.current = isRunning;
        if (isRunning) {
          setAiProcessing(true);
          aiProcessingRef.current = true;
        }
        setHasHydratedRunningState(true);

        // Restore persisted context usage data
        if (res.type === 'acp' && res.extra?.last_token_usage) {
          const { last_token_usage, last_context_limit } = res.extra;
          if (last_token_usage.total_tokens > 0) {
            setTokenUsage(last_token_usage);
          }
          if (last_context_limit && last_context_limit > 0) {
            setContextLimit(last_context_limit);
          }
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setRunning(false);
        runningRef.current = false;
        setAiProcessing(false);
        aiProcessingRef.current = false;
        setHasHydratedRunningState(true);

        if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
          console.warn('[useAcpMessage] Failed to hydrate conversation state:', error);
          return;
        }

        throw error;
      });

    return () => {
      cancelled = true;
    };
  }, [conversation_id]);

  // Fetch slash commands via HTTP after warmup completes.
  // WebSocket push of available_commands arrives during warmup when no
  // StreamRelay is listening, so the initial load must come from HTTP.
  // Mirrors the aionrs pattern: warmup first, then fetch.
  // In team mode, warmup is deferred to first user input — skip here.
  useEffect(() => {
    if (options?.skipWarmup) return;
    let cancelled = false;
    void warmupConversation(conversation_id)
      .then(() => {
        if (cancelled) return;
        return ipcBridge.conversation.getSlashCommands.invoke({ conversation_id });
      })
      .then((result) => {
        if (cancelled) return;
        if (!result || !Array.isArray(result) || result.length === 0) return;
        setSlashCommands(
          result.map((c) => ({
            name: c.command,
            description: c.description,
            kind: 'template' as const,
            source: 'acp' as const,
            selectionBehavior: 'insert' as const,
          }))
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [conversation_id, options?.skipWarmup]);

  const resetState = useCallback(() => {
    turnFinishedRef.current = true;
    setRunning(false);
    runningRef.current = false;
    setAiProcessing(false);
    aiProcessingRef.current = false;
    setThought({ subject: '', description: '' });
    hasContentInTurnRef.current = false;
    hasThinkingMessageRef.current = false;
    activeThinkingRef.current = null;
    setHasThinkingMessage(false);
  }, []);

  const fetchSlashCommands = useCallback(() => {
    void ipcBridge.conversation.getSlashCommands
      .invoke({ conversation_id })
      .then((result) => {
        if (!result || !Array.isArray(result) || result.length === 0) return;
        setSlashCommands(
          result.map((c) => ({
            name: c.command,
            description: c.description,
            kind: 'template' as const,
            source: 'acp' as const,
            selectionBehavior: 'insert' as const,
          }))
        );
      })
      .catch(() => {});
  }, [conversation_id]);

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
    context_limit,
    hasThinkingMessage,
    slashCommands,
    fetchSlashCommands,
  };
};
