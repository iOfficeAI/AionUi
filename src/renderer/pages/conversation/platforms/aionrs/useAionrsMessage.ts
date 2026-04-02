/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { transformMessage } from '@/common/chat/chatLib';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { TChatConversation, TokenUsageData } from '@/common/config/storage';
import type { ThoughtData } from '@/renderer/components/chat/ThoughtDisplay';
import { useAddOrUpdateMessage } from '@/renderer/pages/conversation/Messages/hooks';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type TokenUsage = {
  input_tokens?: number;
  output_tokens?: number;
};

export const useAionrsMessage = (conversation_id: string, onError?: (message: IResponseMessage) => void) => {
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
  // Current active message ID to filter out events from old requests (prevents aborted request events from interfering with new ones)
  const activeMsgIdRef = useRef<string | null>(null);

  // Use refs to avoid useEffect re-subscription when these states change
  const hasActiveToolsRef = useRef(hasActiveTools);
  const streamRunningRef = useRef(streamRunning);
  const waitingResponseRef = useRef(waitingResponse);

  // Track whether current turn has content output
  // Only reset waitingResponse when finish arrives after content (not after tool calls)
  const hasContentInTurnRef = useRef(false);

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

  // Set current active message ID
  const setActiveMsgId = useCallback((msgId: string | null) => {
    activeMsgIdRef.current = msgId;
  }, []);

  useEffect(() => {
    return ipcBridge.conversation.responseStream.on((message) => {
      if (conversation_id !== message.conversation_id) {
        return;
      }

      // Filter out events not belonging to current active request (prevents aborted events from interfering)
      // Note: only filter out thought and start messages, other messages must be rendered
      if (activeMsgIdRef.current && message.msg_id && message.msg_id !== activeMsgIdRef.current) {
        if (message.type === 'thought') {
          return;
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
            // aionrs stream_end carries usage in data field
            const usageData = message.data as TokenUsage | undefined;
            if (usageData && typeof usageData === 'object' && 'input_tokens' in usageData) {
              const newTokenUsage: TokenUsageData = {
                totalTokens: (usageData.input_tokens || 0) + (usageData.output_tokens || 0),
              };
              setTokenUsage(newTokenUsage);
              void ipcBridge.conversation.update.invoke({
                id: conversation_id,
                updates: {
                  extra: { lastTokenUsage: newTokenUsage } as TChatConversation['extra'],
                },
                mergeExtra: true,
              });
            }
            setStreamRunning(false);
            setWaitingResponse(false);
            setThought({ subject: '', description: '' });
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
            addOrUpdateMessage(transformMessage(message));
          }
          break;
        default: {
          if (message.type === 'error') {
            setWaitingResponse(false);
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
          addOrUpdateMessage(transformMessage(message));
          break;
        }
      }
    });
    // Note: hasActiveTools and streamRunning are accessed via refs to avoid re-subscription
  }, [conversation_id, addOrUpdateMessage, onError]);

  useEffect(() => {
    let cancelled = false;

    setThought({ subject: '', description: '' });
    setTokenUsage(null);
    hasContentInTurnRef.current = false;
    setHasHydratedRunningState(false);

    // Check actual conversation status from backend before resetting all running states
    // to avoid flicker when switching to a running conversation
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
        setHasHydratedRunningState(true);
        return;
      }
      const isRunning = res.status === 'running';
      setStreamRunning(isRunning);
      streamRunningRef.current = isRunning;
      // Reset tool states - they will be restored by incoming messages if still active
      setHasActiveTools(false);
      hasActiveToolsRef.current = false;
      setWaitingResponse(isRunning);
      waitingResponseRef.current = isRunning;
      // Load persisted token usage stats
      if (res.type === 'aionrs' && res.extra?.lastTokenUsage) {
        const { lastTokenUsage } = res.extra;
        if (lastTokenUsage.totalTokens > 0) {
          setTokenUsage(lastTokenUsage);
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
    tokenUsage,
    setActiveMsgId,
    setWaitingResponse,
    resetState,
  };
};
