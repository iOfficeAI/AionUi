/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isErrorTipMessage, transformMessage } from '@/common/chat/chatLib';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import { estimateTurnTokenUsage, sumTokenUsages } from '@/common/chat/tokenUsage';
import type { TChatConversation, TokenUsageBreakdown, TokenUsageData } from '@/common/config/storage';
import { uuid } from '@/common/utils';
import type { ThoughtData } from '@/renderer/components/chat/ThoughtDisplay';
import { useMergeLiveMessage } from '@/renderer/pages/conversation/Messages/hooks';
import { logStreamTerminalObserved } from '@/renderer/pages/conversation/runtime/useConversationRuntimeView';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { isConversationProcessing } from '@/renderer/pages/conversation/utils/conversationRuntime';
import { beginConversationTurn, endConversationTurn } from '@/renderer/pages/conversation/utils/conversationTurnClock';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AgentModeOption } from '@/renderer/utils/model/agentTypes';
import { processLocalCronResponse } from './localCronCommands';

type TokenUsage = {
  input_tokens?: number;
  output_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cached_read_tokens?: number;
  cached_write_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  cached_tokens?: number;
  cache_tokens?: number;
  thought_tokens?: number;
  reasoning_tokens?: number;
};

export const useAionrsMessage = (
  conversation_id: string,
  options?: {
    onError?: (message: IResponseMessage) => void;
    onConfigChanged?: (capabilities: Record<string, unknown>) => void;
  }
) => {
  const onError = options?.onError;
  const onConfigChanged = options?.onConfigChanged;
  const onConfigChangedRef = useRef(onConfigChanged);
  const mergeLiveMessage = useMergeLiveMessage();
  const [streamRunning, setStreamRunning] = useState(false);
  const [hasActiveTools, setHasActiveTools] = useState(false);
  const [waitingResponse, setWaitingResponse] = useState(false);
  const [hasHydratedRunningState, setHasHydratedRunningState] = useState(false);
  const [thought, setThought] = useState<ThoughtData>({
    description: '',
    subject: '',
  });
  const [tokenUsage, setTokenUsage] = useState<TokenUsageData | null>(null);
  const [turnsTokenUsage, setTurnsTokenUsage] = useState<Record<string, TokenUsageData>>({});
  const [cumulativeTokenUsage, setCumulativeTokenUsage] = useState<TokenUsageData | null>(null);
  const [dynamicModes, setDynamicModes] = useState<AgentModeOption[]>([]);
  // Turn start origin for the elapsed indicator; backed by the module-level
  // conversation turn clock so it survives unmount on conversation switches.
  const [turnStartedAtMs, setTurnStartedAtMs] = useState<number | null>(null);
  // Conversation whose running state has been hydrated from the backend. Guards
  // the turn-clock cleanup below: a pre-hydration `running === false` (stale
  // state from the previous conversation) must not delete the persisted origin.
  const hydratedConversationRef = useRef<string | null>(null);
  // Current active message ID to filter out events from old requests (prevents aborted request events from interfering with new ones)
  const activeMsgIdRef = useRef<string | null>(null);
  const messageBufferRef = useRef(new Map<string, string>());
  const processedCronMsgIdsRef = useRef(new Set<string>());
  const lastPromptRef = useRef<string>('');

  useEffect(() => {
    if (!ipcBridge.conversation.userCreated?.on) return;
    return ipcBridge.conversation.userCreated.on((evt) => {
      if (evt?.conversation_id === conversation_id && evt?.content) {
        lastPromptRef.current = evt.content;
      }
    });
  }, [conversation_id]);

  // Use refs to avoid useEffect re-subscription when these states change
  const hasActiveToolsRef = useRef(hasActiveTools);
  const streamRunningRef = useRef(streamRunning);
  const waitingResponseRef = useRef(waitingResponse);

  // Track whether current turn has content output
  // Only reset waitingResponse when finish arrives after content (not after tool calls)
  const hasContentInTurnRef = useRef(false);

  useEffect(() => {
    onConfigChangedRef.current = onConfigChanged;
  }, [onConfigChanged]);
  useEffect(() => {
    hasActiveToolsRef.current = hasActiveTools;
  }, [hasActiveTools]);
  useEffect(() => {
    streamRunningRef.current = streamRunning;
  }, [streamRunning]);

  // Throttle thought updates to reduce render frequency
  const thoughtThrottleRef = useRef<{
    lastUpdate: number;
    pending: ThoughtData | null;
    timer: ReturnType<typeof setTimeout> | null;
  }>({ lastUpdate: 0, pending: null, timer: null });

  const throttledSetThought = useMemo(() => {
    const THROTTLE_MS = 50; // 50ms throttle interval
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

  // Cleanup throttle timer
  useEffect(() => {
    return () => {
      if (thoughtThrottleRef.current.timer) {
        clearTimeout(thoughtThrottleRef.current.timer);
      }
    };
  }, []);

  // Combined running state: waiting for response OR stream is running OR tools are active
  const running = waitingResponse || streamRunning || hasActiveTools;

  // Keep the persisted turn origin in sync with the running state so the
  // elapsed indicator does not restart from zero after a conversation switch.
  useEffect(() => {
    if (running) {
      // begin keeps an already-recorded origin, so re-entering a conversation
      // mid-turn restores the original start time instead of resetting it.
      setTurnStartedAtMs(beginConversationTurn(conversation_id));
      return;
    }
    // Only drop the origin once hydration confirmed the idle state belongs to
    // THIS conversation; transient falses during a switch must keep it alive.
    if (hydratedConversationRef.current === conversation_id) {
      endConversationTurn(conversation_id);
    }
    setTurnStartedAtMs(null);
  }, [running, conversation_id]);

  // Set current active message ID
  const setActiveMsgId = useCallback((msgId: string | null) => {
    activeMsgIdRef.current = msgId;
  }, []);

  const processCompletedAssistantMessage = useCallback(
    async (msgId: string) => {
      if (!msgId || processedCronMsgIdsRef.current.has(msgId)) {
        return;
      }

      const rawContent = messageBufferRef.current.get(msgId) ?? '';
      if (!rawContent.trim()) {
        return;
      }

      processedCronMsgIdsRef.current.add(msgId);

      try {
        const result = await processLocalCronResponse(conversation_id, rawContent);
        if (result.displayContent !== undefined && result.displayContent !== rawContent) {
          mergeLiveMessage({
            id: uuid(),
            msg_id: msgId,
            type: 'text',
            position: 'left',
            conversation_id,
            created_at: Date.now(),
            content: {
              content: result.displayContent,
              replace: true,
            },
          });
        }

        for (const response of result.systemResponses) {
          mergeLiveMessage(
            {
              id: uuid(),
              msg_id: `cron-local-${uuid()}`,
              type: 'tips',
              position: 'center',
              conversation_id,
              created_at: Date.now(),
              content: {
                content: response,
                type: response.startsWith('❌') ? 'error' : 'success',
              },
            },
            true
          );
        }
      } catch {
        processedCronMsgIdsRef.current.delete(msgId);
      }
    },
    [mergeLiveMessage, conversation_id]
  );

  useEffect(() => {
    return ipcBridge.conversation.responseStream.on((message) => {
      if (conversation_id !== message.conversation_id) {
        return;
      }
      console.log(
        '[DEBUG aionrs event]',
        message.type,
        'msg_id:',
        message.msg_id,
        'data:',
        JSON.stringify(message.data)
      );

      if (isErrorTipMessage(message)) {
        setStreamRunning(false);
        streamRunningRef.current = false;
        setWaitingResponse(false);
        waitingResponseRef.current = false;
        setHasActiveTools(false);
        hasActiveToolsRef.current = false;
        setThought({ subject: '', description: '' });
        hasContentInTurnRef.current = false;
        const transformedMessage = transformMessage(message);
        if (transformedMessage) {
          mergeLiveMessage(transformedMessage);
        }
        return;
      }

      // Filter out events not belonging to current active request (prevents aborted events from interfering)
      // Note: only filter out thought and start messages, other messages must be rendered
      if (activeMsgIdRef.current && message.msg_id && message.msg_id !== activeMsgIdRef.current) {
        if (message.type === 'thought') {
          return;
        }
      }

      if ((message.type === 'content' || message.type === 'text') && message.msg_id) {
        const payload = message.data;
        const chunk =
          typeof payload === 'string'
            ? payload
            : typeof payload === 'object' &&
                payload !== null &&
                'content' in payload &&
                typeof (payload as { content?: unknown }).content === 'string'
              ? ((payload as { content: string }).content ?? '')
              : '';

        if (chunk) {
          const previous = messageBufferRef.current.get(message.msg_id) ?? '';
          messageBufferRef.current.set(message.msg_id, previous + chunk);
        }
      }

      switch (message.type) {
        case 'thought':
          // Auto-recover streamRunning if thought arrives after finish
          if (!streamRunningRef.current) {
            setStreamRunning(true);
            streamRunningRef.current = true;
          }
          throttledSetThought(message.data as ThoughtData);
          break;
        case 'start':
          setStreamRunning(true);
          streamRunningRef.current = true;
          // Don't reset waitingResponse here - let tool completion flow handle it
          break;
        case 'finish':
          {
            logStreamTerminalObserved(conversation_id, message.turn_id, 'aionrs', message.type);
            // aionrs stream_end carries usage in data field when reported by provider
            const usageData = message.data as TokenUsage | undefined;
            const completedText = message.msg_id ? (messageBufferRef.current.get(message.msg_id) ?? '') : '';
            const rawInputTokens =
              typeof usageData?.input_tokens === 'number'
                ? usageData.input_tokens
                : typeof usageData?.prompt_tokens === 'number'
                  ? usageData.prompt_tokens
                  : undefined;
            const rawOutputTokens =
              typeof usageData?.output_tokens === 'number'
                ? usageData.output_tokens
                : typeof usageData?.completion_tokens === 'number'
                  ? usageData.completion_tokens
                  : undefined;
            const rawTotalTokens =
              typeof usageData?.total_tokens === 'number' && usageData.total_tokens > 0
                ? usageData.total_tokens
                : (rawInputTokens ?? 0) + (rawOutputTokens ?? 0);

            let newTokenUsage: TokenUsageData;
            if (rawTotalTokens > 0) {
              const breakdown: TokenUsageBreakdown = {};
              if (typeof rawInputTokens === 'number') breakdown.input_tokens = rawInputTokens;
              if (typeof rawOutputTokens === 'number') breakdown.output_tokens = rawOutputTokens;
              const cachedRead =
                typeof usageData?.cached_read_tokens === 'number'
                  ? usageData.cached_read_tokens
                  : typeof usageData?.cache_read_input_tokens === 'number'
                    ? usageData.cache_read_input_tokens
                    : undefined;
              if (typeof cachedRead === 'number') breakdown.cached_read_tokens = cachedRead;
              const cachedWrite =
                typeof usageData?.cached_write_tokens === 'number'
                  ? usageData.cached_write_tokens
                  : typeof usageData?.cache_creation_input_tokens === 'number'
                    ? usageData.cache_creation_input_tokens
                    : undefined;
              if (typeof cachedWrite === 'number') breakdown.cached_write_tokens = cachedWrite;
              const cachedTokens =
                typeof usageData?.cached_tokens === 'number'
                  ? usageData.cached_tokens
                  : typeof usageData?.cache_tokens === 'number'
                    ? usageData.cache_tokens
                    : undefined;
              if (typeof cachedTokens === 'number') breakdown.cached_tokens = cachedTokens;
              const thoughtTokens =
                typeof usageData?.thought_tokens === 'number'
                  ? usageData.thought_tokens
                  : typeof usageData?.reasoning_tokens === 'number'
                    ? usageData.reasoning_tokens
                    : undefined;
              if (typeof thoughtTokens === 'number') breakdown.thought_tokens = thoughtTokens;

              newTokenUsage = {
                total_tokens: rawTotalTokens,
                ...(Object.keys(breakdown).length > 0 ? { breakdown } : {}),
              };
            } else {
              newTokenUsage = estimateTurnTokenUsage(completedText, lastPromptRef.current);
            }

            setTokenUsage(newTokenUsage);
            if (message.msg_id) {
              setTurnsTokenUsage((prev) => {
                const updatedTurns = { ...prev, [message.msg_id]: newTokenUsage };
                const nextCumulative = sumTokenUsages(updatedTurns);
                setCumulativeTokenUsage(nextCumulative);
                void ipcBridge.conversation.update.invoke({
                  id: conversation_id,
                  updates: {
                    extra: {
                      last_token_usage: newTokenUsage,
                      turns_token_usage: updatedTurns,
                      cumulative_token_usage: nextCumulative,
                    } as TChatConversation['extra'],
                  },
                  merge_extra: true,
                });
                return updatedTurns;
              });
              mergeLiveMessage({
                id: message.msg_id,
                msg_id: message.msg_id,
                type: 'text',
                position: 'left',
                conversation_id,
                content: {
                  content: '',
                  token_usage: newTokenUsage,
                },
              });
            } else {
              void ipcBridge.conversation.update.invoke({
                id: conversation_id,
                updates: {
                  extra: { last_token_usage: newTokenUsage } as TChatConversation['extra'],
                },
                merge_extra: true,
              });
            }

            setStreamRunning(false);
            setWaitingResponse(false);
            setThought({ subject: '', description: '' });
            if (message.msg_id) {
              void processCompletedAssistantMessage(message.msg_id);
            }
          }
          break;
        case 'tool_group':
          {
            // Mark that current turn has content output
            hasContentInTurnRef.current = true;

            // Auto-recover streamRunning if tool_group arrives after finish
            if (!streamRunningRef.current) {
              setStreamRunning(true);
              streamRunningRef.current = true;
            }

            // Check if any tools are executing or awaiting confirmation
            const tools = message.data as Array<{ status: string; name?: string }>;
            const activeStatuses = new Set(['Executing', 'Confirming', 'Pending']);
            const hasActive = tools.some((tool) => activeStatuses.has(tool.status));
            const wasActive = hasActiveToolsRef.current;

            setHasActiveTools(hasActive);
            hasActiveToolsRef.current = hasActive; // Sync update ref immediately

            // When tools transition from active to inactive, set waitingResponse=true
            // because backend needs to continue sending requests to model
            if (wasActive && !hasActive && tools.length > 0) {
              setWaitingResponse(true);
              waitingResponseRef.current = true;
            }

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
              // All tools completed and stream stopped, clear thought
              setThought({ subject: '', description: '' });
            }

            // Continue passing message to message list update
            mergeLiveMessage(transformMessage(message));
          }
          break;
        case 'permission':
        case 'acp_permission':
          if (!streamRunningRef.current) {
            setStreamRunning(true);
            streamRunningRef.current = true;
          }
          // Backend aionrs emits wire type 'acp_permission' but the payload is
          // Confirmation-shaped (legacy), which matches MessagePermission, not
          // MessageAcpPermission. Re-tag so transformMessage routes it correctly.
          mergeLiveMessage(transformMessage({ ...message, type: 'permission' }));
          break;
        case 'config_changed': {
          const modes = (message.data as { modes?: string[] })?.modes;
          if (modes && modes.length > 0) {
            setDynamicModes(
              modes.map((value) => ({
                value,
                label: value
                  .split('_')
                  .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                  .join(' '),
              }))
            );
          }
          onConfigChangedRef.current?.(message.data as Record<string, unknown>);
          break;
        }
        default: {
          if (message.type === 'error') {
            logStreamTerminalObserved(conversation_id, message.turn_id, 'aionrs', message.type);
            setStreamRunning(false);
            streamRunningRef.current = false;
            setWaitingResponse(false);
            waitingResponseRef.current = false;
            setThought({ subject: '', description: '' });
            onError?.(message as IResponseMessage);
          } else {
            // Mark that current turn has content output (exclude error type)
            hasContentInTurnRef.current = true;
            // Reset waitingResponse when actual content arrives
            if (message.type === 'content') {
              setWaitingResponse(false);
              waitingResponseRef.current = false;
            }
            // Auto-recover streamRunning if content arrives after finish
            if (!streamRunningRef.current) {
              setStreamRunning(true);
              streamRunningRef.current = true;
            }
          }
          // Backend handles persistence, Frontend only updates UI
          mergeLiveMessage(transformMessage(message));
          break;
        }
      }
    });
    // Note: hasActiveTools and streamRunning are accessed via refs to avoid re-subscription
  }, [conversation_id, mergeLiveMessage, onError, processCompletedAssistantMessage]);

  useEffect(() => {
    let cancelled = false;

    setThought({ subject: '', description: '' });
    setTokenUsage(null);
    setTurnsTokenUsage({});
    setCumulativeTokenUsage(null);
    hasContentInTurnRef.current = false;
    setHasHydratedRunningState(false);

    // Check actual conversation status from backend before resetting all running states
    // to avoid flicker when switching to a running conversation
    void getConversationOrNull(conversation_id).then((res) => {
      if (cancelled) {
        return;
      }

      if (!res) {
        hydratedConversationRef.current = conversation_id;
        endConversationTurn(conversation_id);
        setStreamRunning(false);
        streamRunningRef.current = false;
        setHasActiveTools(false);
        hasActiveToolsRef.current = false;
        setWaitingResponse(false);
        waitingResponseRef.current = false;
        setHasHydratedRunningState(true);
        return;
      }
      const isRunning = isConversationProcessing(res);
      hydratedConversationRef.current = conversation_id;
      if (!isRunning) {
        // Turn ended while this conversation was in the background — drop the
        // stale origin so the next turn starts from its own send time. (The
        // sync effect above cannot cover this: running may already be false,
        // so it never re-runs after hydration.)
        endConversationTurn(conversation_id);
      }
      setStreamRunning(isRunning);
      streamRunningRef.current = isRunning;
      // Reset tool states - they will be restored by incoming messages if still active
      setHasActiveTools(false);
      hasActiveToolsRef.current = false;
      setWaitingResponse(isRunning);
      waitingResponseRef.current = isRunning;
      // Load persisted token usage stats
      if (res.type === 'aionrs' && res.extra) {
        const { last_token_usage, turns_token_usage, cumulative_token_usage } = res.extra;
        if (last_token_usage && last_token_usage.total_tokens > 0) {
          setTokenUsage(last_token_usage);
        }
        if (turns_token_usage && Object.keys(turns_token_usage).length > 0) {
          setTurnsTokenUsage(turns_token_usage);
        }
        if (cumulative_token_usage) {
          setCumulativeTokenUsage(cumulative_token_usage);
        } else if (turns_token_usage && Object.keys(turns_token_usage).length > 0) {
          setCumulativeTokenUsage(sumTokenUsages(turns_token_usage));
        } else if (last_token_usage && last_token_usage.total_tokens > 0) {
          setCumulativeTokenUsage(last_token_usage);
        } else {
          // If no token usage was recorded yet, estimate from existing assistant messages
          void ipcBridge.database.getConversationMessages
            .invoke({ conversation_id, limit: 100 })
            .then(
              (page: {
                items?: Array<{ position?: string; type?: string; content?: unknown; msg_id?: string; id?: string }>;
              }) => {
                if (cancelled || !page?.items || page.items.length === 0) return;
                const estimatedTurns: Record<string, TokenUsageData> = {};
                for (const item of page.items) {
                  if (item.position === 'left' && item.type === 'text') {
                    const content =
                      typeof item.content === 'object' && item.content !== null
                        ? (item.content as { content?: string; token_usage?: TokenUsageData }).content
                        : String(item.content || '');
                    const existingUsage =
                      typeof item.content === 'object' && item.content !== null
                        ? (item.content as { token_usage?: TokenUsageData }).token_usage
                        : undefined;
                    const id = item.msg_id || item.id;
                    if (id) {
                      if (existingUsage && existingUsage.total_tokens > 0) {
                        estimatedTurns[id] = existingUsage;
                      } else if (content && typeof content === 'string' && content.trim()) {
                        estimatedTurns[id] = estimateTurnTokenUsage(content);
                      }
                    }
                  }
                }
                if (Object.keys(estimatedTurns).length > 0) {
                  setTurnsTokenUsage(estimatedTurns);
                  const nextCumulative = sumTokenUsages(estimatedTurns);
                  setCumulativeTokenUsage(nextCumulative);
                  void ipcBridge.conversation.update.invoke({
                    id: conversation_id,
                    updates: {
                      extra: {
                        turns_token_usage: estimatedTurns,
                        cumulative_token_usage: nextCumulative,
                      } as TChatConversation['extra'],
                    },
                    merge_extra: true,
                  });
                }
              }
            )
            .catch(() => {});
        }
      }
      setHasHydratedRunningState(true);
    });

    return () => {
      cancelled = true;
    };
  }, [conversation_id]);

  const resetState = useCallback(() => {
    setWaitingResponse(false);
    waitingResponseRef.current = false;
    setStreamRunning(false);
    streamRunningRef.current = false;
    setHasActiveTools(false);
    hasActiveToolsRef.current = false;
    setThought({ subject: '', description: '' });
    hasContentInTurnRef.current = false;
    // Clear active message ID to prevent filtering events from new messages after stop
    activeMsgIdRef.current = null;
  }, []);

  return {
    thought,
    setThought,
    running,
    hasHydratedRunningState,
    turnStartedAtMs,
    tokenUsage,
    turnsTokenUsage,
    cumulativeTokenUsage,
    dynamicModes,
    setActiveMsgId,
    setWaitingResponse,
    resetState,
  };
};

export type UseAionrsMessageReturn = ReturnType<typeof useAionrsMessage>;
