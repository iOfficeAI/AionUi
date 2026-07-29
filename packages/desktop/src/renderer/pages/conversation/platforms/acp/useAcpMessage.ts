/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isErrorTipMessage, normalizeTextMessageContent, transformMessage } from '@/common/chat/chatLib';
import type { AvailableCommand, TMessage } from '@/common/chat/chatLib';
import { mapAcpCommandsToSlashCommands } from '@/common/chat/slash/acpMapping';
import type { SlashCommandItem } from '@/common/chat/slash/types';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { TokenUsageBreakdown, TokenUsageData } from '@/common/config/storage';
import { useMergeLiveMessage } from '@/renderer/pages/conversation/Messages/hooks';
import { logStreamTerminalObserved } from '@/renderer/pages/conversation/runtime/useConversationRuntimeView';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { isConversationProcessing } from '@/renderer/pages/conversation/utils/conversationRuntime';
import { beginConversationTurn, endConversationTurn } from '@/renderer/pages/conversation/utils/conversationTurnClock';
import { ensureConversationRuntime } from '@/renderer/pages/conversation/utils/ensureConversationRuntime';
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
  /**
   * Absolute start timestamp (ms) of the in-flight turn, persisted per
   * conversation so the elapsed indicator survives conversation switches.
   * Null when no turn is running.
   */
  turnStartedAtMs: number | null;
  resetState: () => void;
  tokenUsage: TokenUsageData | null;
  context_limit: number;
  hasThinkingMessage: boolean;
  slashCommands: SlashCommandItem[];
  fetchSlashCommands: () => void;
};

const BREAKDOWN_KEYS = [
  'input_tokens',
  'output_tokens',
  'thought_tokens',
  'cached_read_tokens',
  'cached_write_tokens',
] as const;

/**
 * Convert an ACP UsageUpdate payload (live acp_context_usage frame or
 * GET /usage snapshot — same shape) into TokenUsageData. Per-turn counters
 * ride under `_meta`; cost is the agent's cumulative session cost.
 */
export function tokenUsageFromAcpUsage(data: {
  used: number;
  cost?: { amount: number; currency: string };
  _meta?: Record<string, unknown>;
}): TokenUsageData {
  const usage: TokenUsageData = { total_tokens: data.used };
  if (data.cost && typeof data.cost.amount === 'number' && data.cost.amount > 0) {
    usage.cost = { amount: data.cost.amount, currency: data.cost.currency || 'USD' };
  }
  if (data._meta) {
    const breakdown: TokenUsageBreakdown = {};
    for (const key of BREAKDOWN_KEYS) {
      const value = data._meta[key];
      if (typeof value === 'number' && value >= 0) {
        breakdown[key] = value;
      }
    }
    if (Object.keys(breakdown).length > 0) {
      usage.breakdown = breakdown;
    }
  }
  return usage;
}

const slashCommandsInFlight = new Map<string, Promise<SlashCommandItem[]>>();

function fetchAcpSlashCommands(conversation_id: string): Promise<SlashCommandItem[]> {
  const existing = slashCommandsInFlight.get(conversation_id);
  if (existing) return existing;

  const promise = ipcBridge.conversation.getSlashCommands
    .invoke({ conversation_id })
    .then((result) => {
      if (!result || !Array.isArray(result) || result.length === 0) return [];
      return mapAcpCommandsToSlashCommands(result);
    })
    .finally(() => {
      if (slashCommandsInFlight.get(conversation_id) === promise) {
        slashCommandsInFlight.delete(conversation_id);
      }
    });
  slashCommandsInFlight.set(conversation_id, promise);
  return promise;
}

export const useAcpMessage = (
  conversation_id: string,
  options?: { skipWarmup?: boolean; prepareRuntime?: () => Promise<void> }
): UseAcpMessageReturn => {
  const mergeLiveMessage = useMergeLiveMessage();
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
  // Turn start origin for the elapsed indicator; backed by the module-level
  // conversation turn clock so it survives unmount on conversation switches.
  const [turnStartedAtMs, setTurnStartedAtMs] = useState<number | null>(null);
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

      mergeLiveMessage({
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
    [mergeLiveMessage]
  );

  // Drop the persisted turn origin once the turn truly terminates (finish,
  // error, stop). NOT called on the conversation-switch reset, which must keep
  // the origin alive for re-entry hydration.
  const markTurnEnded = useCallback(() => {
    endConversationTurn(conversation_id);
    setTurnStartedAtMs(null);
  }, [conversation_id]);

  // Exported setter: the send box flips this on send / send-failure, so track
  // the turn origin alongside the processing flag.
  const setAiProcessingTracked = useCallback<React.Dispatch<React.SetStateAction<boolean>>>(
    (action) => {
      const next = typeof action === 'function' ? action(aiProcessingRef.current) : action;
      if (next) {
        setTurnStartedAtMs(beginConversationTurn(conversation_id));
      } else {
        endConversationTurn(conversation_id);
        setTurnStartedAtMs(null);
      }
      aiProcessingRef.current = next;
      setAiProcessing(next);
    },
    [conversation_id]
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
        markTurnEnded();
        setThought({ subject: '', description: '' });
        hasContentInTurnRef.current = false;
        hasThinkingMessageRef.current = false;
        activeThinkingRef.current = null;
        setHasThinkingMessage(false);
        const transformedMessage = transformMessage(message);
        if (transformedMessage) {
          mergeLiveMessage(transformedMessage);
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
          'acp_config_option',
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
          mergeLiveMessage(transformedMessage);
          break;
        }
        case 'start':
          // New turn starting — clear the finished guard and content flag
          turnFinishedRef.current = false;
          hasContentInTurnRef.current = false;
          setRunning(true);
          runningRef.current = true;
          // Record the turn origin (keeps the earlier send-time origin if the
          // send box already recorded one for this turn).
          setTurnStartedAtMs(beginConversationTurn(conversation_id, message.created_at ?? Date.now()));
          // Don't reset aiProcessing here - let content arrival handle it
          break;
        case 'finish':
          {
            logStreamTerminalObserved(conversation_id, message.turn_id, 'acp', message.type);
            // Mark turn as finished to prevent auto-recover from late messages
            turnFinishedRef.current = true;
            // Immediate state reset (notification is handled by centralized hook)
            setRunning(false);
            runningRef.current = false;
            setAiProcessing(false);
            aiProcessingRef.current = false;
            markTurnEnded();
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
          mergeLiveMessage(transformedMessage);
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
              markTurnEnded();
            }
          }
          mergeLiveMessage(transformedMessage);
          break;
        }
        case 'user_content':
          mergeLiveMessage(transformedMessage);
          break;
        case 'teammate_message': {
          const tmMsg = message.data as TMessage;
          if (tmMsg && tmMsg.conversation_id === conversation_id) {
            mergeLiveMessage(
              tmMsg.type === 'text'
                ? {
                    ...tmMsg,
                    content: normalizeTextMessageContent(tmMsg.content),
                  }
                : tmMsg
            );
          }
          break;
        }
        case 'acp_permission':
          // Auto-recover running state only if turn hasn't finished
          if (!runningRef.current && !turnFinishedRef.current) {
            setRunning(true);
            runningRef.current = true;
          }
          mergeLiveMessage(transformedMessage);
          break;
        case 'acp_model_info':
          // Model info updates are handled by AcpModelSelector, no action needed here
          break;
        case 'acp_config_option':
          // Config-options catalog updates (async model/mode discovery for the
          // direct-CLI backends) are consumed by useAcpConfigOptions to re-project
          // the picker. No turn-state change here — must NOT fall through to the
          // default arm, which would setRunning(true) and light a spurious timer bar.
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
            setSlashCommands(mapAcpCommandsToSlashCommands(cmdData.commands));
          }
          break;
        }
        case 'acp_context_usage': {
          const usageData = message.data as {
            used: number;
            size: number;
            cost?: { amount: number; currency: string };
            _meta?: Record<string, unknown>;
          };
          if (usageData && typeof usageData.used === 'number') {
            setTokenUsage((prev) => {
              const next = tokenUsageFromAcpUsage(usageData);
              // Mid-turn UsageUpdate notifications carry no per-turn
              // breakdown; keep the last end-of-turn one until replaced.
              if (!next.breakdown && prev?.breakdown) next.breakdown = prev.breakdown;
              if (!next.cost && prev?.cost) next.cost = prev.cost;
              return next;
            });
            if (usageData.size > 0) {
              setContextLimit(usageData.size);
            }
          }
          break;
        }
        case 'tips':
          // Advisory tips (backend `Notice`: a rejected mode/model/effort switch, or a
          // codex out-of-turn warning/deprecation). Render the advisory but do NOT touch
          // turn state — a config-reject Notice can arrive while idle (dispatched by the
          // PUT /config-options path, not a turn), so falling through to the `default`
          // arm's setRunning(true) would light a spurious timer bar with no terminal to
          // clear it (the same regression the `acp_config_option` case guards against).
          // Error-severity tips are handled earlier by isErrorTipMessage; only info/
          // warning advisories reach here.
          mergeLiveMessage(transformedMessage);
          break;
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
          logStreamTerminalObserved(conversation_id, message.turn_id, 'acp', message.type);
          // Stop all loading states when error occurs
          turnFinishedRef.current = true;
          setRunning(false);
          runningRef.current = false;
          setAiProcessing(false);
          aiProcessingRef.current = false;
          markTurnEnded();
          activeThinkingRef.current = null;
          mergeLiveMessage(transformedMessage);
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
          mergeLiveMessage(transformedMessage);
          break;
      }
    },
    [
      conversation_id,
      mergeLiveMessage,
      completeActiveThinking,
      markTurnEnded,
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
    // Note: only the local state is cleared here — the persisted turn clock entry
    // must survive so re-entry hydration can restore the original start time.
    setRunning(false);
    runningRef.current = false;
    setAiProcessing(false);
    aiProcessingRef.current = false;
    setTurnStartedAtMs(null);

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
          endConversationTurn(conversation_id);
          setHasHydratedRunningState(true);
          return;
        }
        const isRunning = isConversationProcessing(res);
        setRunning(isRunning);
        runningRef.current = isRunning;
        if (isRunning) {
          setAiProcessing(true);
          aiProcessingRef.current = true;
          // Restore the persisted origin (fall back to now if the app was
          // relaunched mid-turn and no origin was recorded this session).
          setTurnStartedAtMs(beginConversationTurn(conversation_id));
        } else {
          // Turn ended while this conversation was in the background — drop
          // the stale origin so the next turn starts from its own send time.
          endConversationTurn(conversation_id);
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

  // Fetch slash commands via HTTP after runtime ensure completes.
  // WebSocket push of available_commands arrives during warmup when no
  // StreamRelay is listening, so the initial load must come from HTTP.
  // In team mode, runtime preparation is coordinated by the team send box.
  useEffect(() => {
    if (options?.skipWarmup && !options.prepareRuntime) return;
    let cancelled = false;
    const runtimeReady = options?.prepareRuntime?.() ?? ensureConversationRuntime(conversation_id);
    void runtimeReady
      .then(() => {
        if (cancelled) return;
        return fetchAcpSlashCommands(conversation_id);
      })
      .then((commands) => {
        if (cancelled) return;
        if (!commands?.length) return;
        setSlashCommands(commands);
      })
      .catch(() => {});
    // Hydrate the context-usage indicator from the backend snapshot. Live
    // acp_context_usage stream events may land first, so never overwrite a
    // value that is already set.
    void runtimeReady
      .then(() => ipcBridge.conversation.getUsage.invoke({ conversation_id }))
      .then((usage) => {
        if (cancelled || !usage || typeof usage.used !== 'number' || usage.used <= 0) return;
        setTokenUsage((prev) => prev ?? tokenUsageFromAcpUsage(usage));
        if (usage.size > 0) {
          setContextLimit((prev) => (prev > 0 ? prev : usage.size));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [conversation_id, options?.prepareRuntime, options?.skipWarmup]);

  const resetState = useCallback(() => {
    turnFinishedRef.current = true;
    setRunning(false);
    runningRef.current = false;
    setAiProcessing(false);
    aiProcessingRef.current = false;
    markTurnEnded();
    setThought({ subject: '', description: '' });
    hasContentInTurnRef.current = false;
    hasThinkingMessageRef.current = false;
    activeThinkingRef.current = null;
    setHasThinkingMessage(false);
  }, [markTurnEnded]);

  const fetchSlashCommands = useCallback(() => {
    const runtimeReady = options?.prepareRuntime?.() ?? ensureConversationRuntime(conversation_id);
    void runtimeReady
      .then(() => fetchAcpSlashCommands(conversation_id))
      .then((commands) => {
        if (!commands.length) return;
        setSlashCommands(commands);
      })
      .catch(() => {});
  }, [conversation_id, options?.prepareRuntime]);

  return {
    thought,
    setThought,
    running,
    hasHydratedRunningState,
    acpStatus,
    aiProcessing,
    setAiProcessing: setAiProcessingTracked,
    turnStartedAtMs,
    resetState,
    tokenUsage,
    context_limit,
    hasThinkingMessage,
    slashCommands,
    fetchSlashCommands,
  };
};
