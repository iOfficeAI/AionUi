/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import { transformMessage } from '@/common/chat/chatLib';
import type { TChatConversation, TokenUsageData } from '@/common/config/storage';
import type { ThoughtData } from '@/renderer/components/chat/ThoughtDisplay';
import { useAddOrUpdateMessage } from '@/renderer/pages/conversation/Messages/hooks';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type TokenUsage = {
  input_tokens?: number;
  output_tokens?: number;
};

export type UseAionrsMessageReturn = {
  thought: ThoughtData;
  setThought: React.Dispatch<React.SetStateAction<ThoughtData>>;
  running: boolean;
  hasHydratedRunningState: boolean;
  tokenUsage: TokenUsageData | null;
  hasStreamingContent: boolean;
  setActiveMsgId: (msgId: string | null) => void;
  setWaitingResponse: React.Dispatch<React.SetStateAction<boolean>>;
  resetState: () => void;
};

export const useAionrsMessage = (
  conversation_id: string,
  onError?: (message: IResponseMessage) => void
): UseAionrsMessageReturn => {
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

  const activeMsgIdRef = useRef<string | null>(null);
  const hasActiveToolsRef = useRef(hasActiveTools);
  const streamRunningRef = useRef(streamRunning);
  const waitingResponseRef = useRef(waitingResponse);
  const hasContentInTurnRef = useRef(false);

  useEffect(() => {
    hasActiveToolsRef.current = hasActiveTools;
  }, [hasActiveTools]);

  useEffect(() => {
    streamRunningRef.current = streamRunning;
  }, [streamRunning]);

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
    };
  }, []);

  const running = waitingResponse || streamRunning || hasActiveTools;

  const setActiveMsgId = useCallback((msgId: string | null) => {
    activeMsgIdRef.current = msgId;
  }, []);

  useEffect(() => {
    return ipcBridge.conversation.responseStream.on((message) => {
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
        case 'start':
          hasContentInTurnRef.current = false;
          setHasStreamingContent(false);
          setStreamRunning(true);
          streamRunningRef.current = true;
          break;
        case 'finish': {
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
          streamRunningRef.current = false;
          setWaitingResponse(false);
          waitingResponseRef.current = false;
          setThought({ subject: '', description: '' });
          hasContentInTurnRef.current = false;
          setHasStreamingContent(false);
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
        default: {
          if (message.type === 'error') {
            setWaitingResponse(false);
            waitingResponseRef.current = false;
            setHasStreamingContent(false);
            onError?.(message as IResponseMessage);
          } else {
            if (message.type === 'content') {
              hasContentInTurnRef.current = true;
              setHasStreamingContent(true);
              setWaitingResponse(false);
              waitingResponseRef.current = false;
            }
            if (!streamRunningRef.current) {
              setStreamRunning(true);
              streamRunningRef.current = true;
            }
          }
          addOrUpdateMessage(transformMessage(message));
          break;
        }
      }
    });
  }, [conversation_id, addOrUpdateMessage, onError, throttledSetThought]);

  useEffect(() => {
    let cancelled = false;

    setThought({ subject: '', description: '' });
    setTokenUsage(null);
    hasContentInTurnRef.current = false;
    setHasStreamingContent(false);
    setHasHydratedRunningState(false);

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
        setHasStreamingContent(false);
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
      setHasStreamingContent(false);

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
    setHasStreamingContent(false);
    activeMsgIdRef.current = null;
  }, []);

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
  };
};
