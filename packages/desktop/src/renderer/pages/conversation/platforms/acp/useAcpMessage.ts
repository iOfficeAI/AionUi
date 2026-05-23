/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { transformMessage } from '@/common/chat/chatLib';
import type { IMessageAcpToolCall, IMessageText } from '@/common/chat/chatLib';
import type { AvailableCommand } from '@/common/chat/chatLib';
import type { SlashCommandItem } from '@/common/chat/slash/types';
import type { IConversationTurnCompletedEvent, IResponseMessage } from '@/common/adapter/ipcBridge';
import type { TokenUsageData } from '@/common/config/storage';
import { useAddOrUpdateMessage } from '@/renderer/pages/conversation/Messages/hooks';
import type { ThoughtData } from '@/renderer/components/chat/ThoughtDisplay';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export function extractCompletedToolFallbackText(message: IMessageAcpToolCall): string | null {
  const update = message.content.update;
  const sessionUpdate =
    (update as { sessionUpdate?: string; session_update?: string } | undefined)?.sessionUpdate ??
    (update as { sessionUpdate?: string; session_update?: string } | undefined)?.session_update;
  if (!update || sessionUpdate !== 'tool_call_update' || update.status !== 'completed') {
    return null;
  }

  const contentItems = Array.isArray(update.content) ? update.content : [];
  for (let i = contentItems.length - 1; i >= 0; i--) {
    const item = contentItems[i];
    if (item?.type !== 'content') continue;
    const content = item.content;
    if (content?.type !== 'text' || typeof content.text !== 'string') continue;
    const trimmed = content.text.trim();
    if (!trimmed) continue;

    const outputMatch = trimmed.match(/- \*\*output:\*\*\s*([^\n]+)/);
    if (outputMatch?.[1]?.trim()) {
      return outputMatch[1].trim();
    }

    return trimmed;
  }

  const rawOutput =
    (update as { rawOutput?: unknown; raw_output?: unknown }).rawOutput ??
    (update as { rawOutput?: unknown; raw_output?: unknown }).raw_output;
  if (rawOutput && typeof rawOutput === 'object') {
    const output = 'output' in rawOutput ? rawOutput.output : undefined;
    if (typeof output === 'string' && output.trim()) {
      return output.trim();
    }
  }

  return null;
}

export function buildAcpFallbackAssistantText(params: {
  conversationId: string;
  msgId: string;
  content: string;
  createdAt?: number;
}): IMessageText {
  return {
    id: params.msgId,
    msg_id: params.msgId,
    type: 'text',
    position: 'left',
    conversation_id: params.conversationId,
    created_at: params.createdAt ?? Date.now(),
    content: {
      content: params.content,
      replace: true,
    },
  };
}

function extractCompletedThinkingFallbackText(message: ReturnType<typeof transformMessage>): string | null {
  if (message.type !== 'thinking') return null;
  const content = message.content;
  if (!content || typeof content !== 'object' || !('content' in content)) return null;
  const text = content.content;
  return typeof text === 'string' && text.trim() ? text.trim() : null;
}

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
  const [context_limit, setContextLimit] = useState<number>(0);
  const [slashCommands, setSlashCommands] = useState<SlashCommandItem[]>([]);
  const acpSessionIdRef = useRef<string | null>(null);

  // Use refs to sync state for immediate access in event handlers
  const runningRef = useRef(running);
  const aiProcessingRef = useRef(aiProcessing);

  // Track whether current turn has content output
  const hasContentInTurnRef = useRef(false);
  const lastCompletedToolTextRef = useRef<string | null>(null);
  const lastCompletedThinkingTextRef = useRef<string | null>(null);
  const lastFallbackTextMsgIdRef = useRef<string | null>(null);

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

  const finalizeTurn = useCallback(
    (params?: { createdAt?: number; msgId?: string }) => {
      const fallbackText = lastCompletedToolTextRef.current || lastCompletedThinkingTextRef.current;
      if (!hasContentInTurnRef.current && fallbackText) {
        const fallbackMsgId =
          params?.msgId || lastFallbackTextMsgIdRef.current || `acp-fallback-${conversation_id}-${Date.now()}`;
        addOrUpdateMessage(
          buildAcpFallbackAssistantText({
            conversationId: conversation_id,
            msgId: fallbackMsgId,
            content: fallbackText,
            createdAt: params?.createdAt,
          })
        );
        hasContentInTurnRef.current = true;
      }

      turnFinishedRef.current = true;
      setRunning(false);
      runningRef.current = false;
      setAiProcessing(false);
      aiProcessingRef.current = false;
      setThought({ subject: '', description: '' });
      hasContentInTurnRef.current = false;
      lastCompletedToolTextRef.current = null;
      lastCompletedThinkingTextRef.current = null;
      lastFallbackTextMsgIdRef.current = null;
      hasThinkingMessageRef.current = false;
      setHasThinkingMessage(false);

      if (requestTraceRef.current) {
        const duration = Date.now() - requestTraceRef.current.startTime;
        console.log(
          `%c[RequestTrace]%c FINISH | ${requestTraceRef.current.backend} → ${requestTraceRef.current.model_id} | ${duration}ms | ${new Date().toISOString()}`,
          'color: #52c41a; font-weight: bold',
          'color: inherit'
        );
        requestTraceRef.current = null;
      }
    },
    [addOrUpdateMessage, conversation_id, setAiProcessing, setRunning, setThought]
  );

  const handleResponseMessage = useCallback(
    (message: IResponseMessage) => {
      if (conversation_id !== message.conversation_id) {
        return;
      }

      if (message.type === 'skill_suggest' || message.type === 'cron_trigger') {
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
          if (thinkingData?.status === 'done') {
            lastCompletedThinkingTextRef.current = extractCompletedThinkingFallbackText(transformedMessage);
          }
          addOrUpdateMessage(transformedMessage);
          break;
        }
        case 'start':
          // New turn starting — clear the finished guard and content flag
          turnFinishedRef.current = false;
          hasContentInTurnRef.current = false;
          lastCompletedToolTextRef.current = null;
          lastCompletedThinkingTextRef.current = null;
          lastFallbackTextMsgIdRef.current = null;
          setRunning(true);
          runningRef.current = true;
          // Don't reset aiProcessing here - let content arrival handle it
          break;
        case 'finish':
          finalizeTurn({
            createdAt: message.created_at,
            msgId: lastFallbackTextMsgIdRef.current ?? message.msg_id,
          });
          break;
        case 'text':
        case 'content': {
          // First content token — AI has started responding, clear processing indicator
          if (!hasContentInTurnRef.current) {
            hasContentInTurnRef.current = true;
            setAiProcessing(false);
            aiProcessingRef.current = false;
          }
          lastCompletedToolTextRef.current = null;
          lastCompletedThinkingTextRef.current = null;
          lastFallbackTextMsgIdRef.current = null;
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
            session_id?: string;
          };
          if (typeof agentData?.session_id === 'string' && agentData.session_id.trim()) {
            acpSessionIdRef.current = agentData.session_id;
          }
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
        case 'acp_tool_call': {
          const fallbackText = extractCompletedToolFallbackText(transformedMessage as IMessageAcpToolCall);
          if (fallbackText) {
            lastCompletedToolTextRef.current = fallbackText;
            lastFallbackTextMsgIdRef.current = message.msg_id;
          }
          // Auto-recover running state only if turn hasn't finished
          if (!runningRef.current && !turnFinishedRef.current) {
            setRunning(true);
            runningRef.current = true;
          }
          addOrUpdateMessage(transformedMessage);
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
      finalizeTurn,
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

  const handleTurnCompleted = useCallback(
    (event: IConversationTurnCompletedEvent) => {
      const currentSessionId = acpSessionIdRef.current;
      if (!currentSessionId || event.session_id !== currentSessionId) {
        return;
      }
      if (event.status !== 'finished') {
        return;
      }
      if (turnFinishedRef.current) {
        return;
      }
      finalizeTurn({
        createdAt: event.last_message?.created_at,
        msgId:
          lastFallbackTextMsgIdRef.current ||
          `acp-turn-completed-${conversation_id}-${event.last_message?.created_at ?? Date.now()}`,
      });
    },
    [conversation_id, finalizeTurn]
  );

  useEffect(() => {
    return ipcBridge.conversation.turnCompleted.on(handleTurnCompleted);
  }, [handleTurnCompleted]);

  // Reset state when conversation changes and restore actual running status
  useEffect(() => {
    let cancelled = false;

    setThought({ subject: '', description: '' });
    setAcpStatus(null);
    setTokenUsage(null);
    setContextLimit(0);
    setSlashCommands([]);
    acpSessionIdRef.current = null;
    hasContentInTurnRef.current = false;
    turnFinishedRef.current = false;
    lastCompletedToolTextRef.current = null;
    lastCompletedThinkingTextRef.current = null;
    lastFallbackTextMsgIdRef.current = null;
    hasThinkingMessageRef.current = false;
    setHasThinkingMessage(false);
    setHasHydratedRunningState(false);

    // Clear running/processing immediately for the new conversation. Hydration only
    // turns these back on when the backend reports status === 'running'. Otherwise
    // conversation.get's idle branch raced with useAcpInitialMessage's
    // setAiProcessing(true) and hid ThoughtDisplay until the first stream event.
    setRunning(false);
    runningRef.current = false;
    setAiProcessing(false);
    aiProcessingRef.current = false;

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
      acpSessionIdRef.current =
        (res.type === 'acp' ? res.extra?.acp_session_id : undefined) ||
        (res.type === 'acp' ? res.extra?.acp_session_conversation_id : undefined) ||
        null;
      const isRunning = res.status === 'running';
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
    });

    return () => {
      cancelled = true;
    };
  }, [conversation_id]);

  useEffect(() => {
    if (acpSessionIdRef.current) {
      return;
    }

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 20;

    const hydrateSessionId = async () => {
      while (!cancelled && !acpSessionIdRef.current && attempts < maxAttempts) {
        attempts += 1;
        try {
          const res = await ipcBridge.conversation.get.invoke({ id: conversation_id });
          const sessionId =
            (res?.type === 'acp' ? res.extra?.acp_session_id : undefined) ||
            (res?.type === 'acp' ? res.extra?.acp_session_conversation_id : undefined) ||
            null;
          if (sessionId) {
            acpSessionIdRef.current = sessionId;
            return;
          }
        } catch {
          // swallow and retry
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    };

    void hydrateSessionId();

    return () => {
      cancelled = true;
    };
  }, [conversation_id]);

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

  // Fetch slash commands via HTTP after warmup completes.
  // WebSocket push of available_commands arrives during warmup when no
  // StreamRelay is listening, so the initial load must come from HTTP.
  useEffect(() => {
    const inflightKey = `acp_initial_message_inflight_${conversation_id}`;
    const inflightSince = Number(sessionStorage.getItem(inflightKey) || '0');
    if (Number.isFinite(inflightSince) && inflightSince > 0 && Date.now() - inflightSince < 15_000) {
      return;
    }

    let cancelled = false;
    void ipcBridge.conversation.warmup
      .invoke({ conversation_id })
      .then(() => {
        if (!cancelled) {
          fetchSlashCommands();
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [conversation_id, fetchSlashCommands]);

  const resetState = useCallback(() => {
    turnFinishedRef.current = true;
    setRunning(false);
    runningRef.current = false;
    setAiProcessing(false);
    aiProcessingRef.current = false;
    setThought({ subject: '', description: '' });
    hasContentInTurnRef.current = false;
    lastCompletedToolTextRef.current = null;
    lastCompletedThinkingTextRef.current = null;
    lastFallbackTextMsgIdRef.current = null;
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
    context_limit,
    hasThinkingMessage,
    slashCommands,
    fetchSlashCommands,
  };
};
