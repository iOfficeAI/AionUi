/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IConversationTurnCompletedEvent, IResponseMessage } from '@/common/adapter/ipcBridge';
import { transformMessage } from '@/common/chat/chatLib';
import type { TChatConversation, TokenUsageData } from '@/common/config/storage';
import type { ThoughtData } from '@/renderer/components/chat/ThoughtDisplay';
import { useAddOrUpdateMessage } from '@/renderer/pages/conversation/Messages/hooks';
import { emitter } from '@/renderer/utils/emitter';
import { useCallback, useEffect, useRef, useState } from 'react';

export type CodexActivity =
  | { phase: 'waiting' }
  | { phase: 'thinking' }
  | { phase: 'streaming' }
  | { phase: 'permission' }
  | { phase: 'tool'; title?: string; status?: string };

export type UseCodexMessageReturn = {
  thought: ThoughtData;
  setThought: React.Dispatch<React.SetStateAction<ThoughtData>>;
  running: boolean;
  hasHydratedRunningState: boolean;
  tokenUsage: TokenUsageData | null;
  contextLimit: number;
  hasStreamingContent: boolean;
  activity: CodexActivity | null;
  resetState: () => void;
};

const ACTIVE_TOOL_STATUSES = new Set(['pending', 'in_progress', 'running', 'executing']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getToolUpdate(data: unknown): { title?: string; status?: string } | null {
  if (!isRecord(data)) return null;

  const update = isRecord(data.update)
    ? data.update
    : isRecord(data.content) && isRecord(data.content.update)
      ? data.content.update
      : data;

  return {
    title:
      typeof update.title === 'string'
        ? update.title
        : typeof update.name === 'string'
          ? update.name
          : typeof update.toolName === 'string'
            ? update.toolName
            : undefined,
    status: typeof update.status === 'string' ? update.status : undefined,
  };
}

function getThoughtData(data: unknown): ThoughtData {
  if (!isRecord(data)) {
    return { subject: '', description: '' };
  }

  return {
    subject: typeof data.subject === 'string' ? data.subject : '',
    description: typeof data.description === 'string' ? data.description : '',
  };
}

function getHydratedTokenState(conversation: TChatConversation | null): {
  tokenUsage: TokenUsageData | null;
  contextLimit: number;
} {
  if (conversation?.type !== 'codex') {
    return { tokenUsage: null, contextLimit: 0 };
  }

  const { lastTokenUsage, lastContextLimit } = (conversation.extra ?? {}) as {
    lastTokenUsage?: TokenUsageData;
    lastContextLimit?: number;
  };
  return {
    tokenUsage: lastTokenUsage && lastTokenUsage.totalTokens > 0 ? lastTokenUsage : null,
    contextLimit: lastContextLimit && lastContextLimit > 0 ? lastContextLimit : 0,
  };
}

export const useCodexMessage = (conversationId: string): UseCodexMessageReturn => {
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const [running, setRunning] = useState(false);
  const [hasHydratedRunningState, setHasHydratedRunningState] = useState(false);
  const [thought, setThought] = useState<ThoughtData>({ subject: '', description: '' });
  const [tokenUsage, setTokenUsage] = useState<TokenUsageData | null>(null);
  const [contextLimit, setContextLimit] = useState(0);
  const [hasStreamingContent, setHasStreamingContent] = useState(false);
  const [activity, setActivity] = useState<CodexActivity | null>(null);

  const runningRef = useRef(false);
  const streamingRef = useRef(false);
  const turnFinishedRef = useRef(true);

  const setRunningState = useCallback((nextRunning: boolean) => {
    runningRef.current = nextRunning;
    setRunning(nextRunning);
  }, []);

  const setStreamingContent = useCallback(
    (nextStreaming: boolean) => {
      if (streamingRef.current === nextStreaming) {
        return;
      }
      streamingRef.current = nextStreaming;
      setHasStreamingContent(nextStreaming);
      emitter.emit('conversation.streaming', {
        conversationId,
        isStreaming: nextStreaming,
      });
    },
    [conversationId]
  );

  const clearRuntimeState = useCallback(() => {
    turnFinishedRef.current = true;
    setRunningState(false);
    setThought({ subject: '', description: '' });
    setActivity(null);
    setStreamingContent(false);
  }, [setRunningState, setStreamingContent]);

  const markActive = useCallback(
    (nextActivity: CodexActivity) => {
      turnFinishedRef.current = false;
      if (!runningRef.current) {
        setRunningState(true);
      }
      setActivity(nextActivity);
    },
    [setRunningState]
  );

  useEffect(() => {
    return ipcBridge.conversation.responseStream.on((message: IResponseMessage) => {
      if (message.conversation_id !== conversationId) {
        return;
      }

      const addTransformedMessage = () => {
        const transformedMessage = transformMessage(message);
        if (transformedMessage) {
          addOrUpdateMessage(transformedMessage);
        }
      };

      switch (message.type) {
        case 'start':
          turnFinishedRef.current = false;
          setStreamingContent(false);
          setRunningState(true);
          setActivity({ phase: 'waiting' });
          break;
        case 'thought':
          markActive({ phase: 'thinking' });
          setThought(message.data as ThoughtData);
          break;
        case 'thinking':
          markActive({ phase: 'thinking' });
          setThought(getThoughtData(message.data));
          addTransformedMessage();
          break;
        case 'content':
          markActive({ phase: 'streaming' });
          setThought({ subject: '', description: '' });
          setStreamingContent(true);
          addTransformedMessage();
          break;
        case 'codex_permission':
        case 'acp_permission':
          markActive({ phase: 'permission' });
          addTransformedMessage();
          break;
        case 'codex_tool_call': {
          const toolUpdate = getToolUpdate(message.data);
          const status = toolUpdate?.status?.toLowerCase();
          if (status && !ACTIVE_TOOL_STATUSES.has(status)) {
            markActive({ phase: 'waiting' });
          } else {
            markActive({
              phase: 'tool',
              title: toolUpdate?.title,
              status: toolUpdate?.status,
            });
          }
          addTransformedMessage();
          break;
        }
        case 'codex_context_event':
          markActive({ phase: 'waiting' });
          addTransformedMessage();
          break;
        case 'codex_agent_event':
          markActive({ phase: 'tool' });
          addTransformedMessage();
          break;
        case 'codex_agent_transcript':
          markActive({ phase: 'tool' });
          addTransformedMessage();
          break;
        case 'acp_context_usage': {
          const usageData = message.data as { used?: unknown; size?: unknown };
          if (typeof usageData?.used === 'number') {
            setTokenUsage({ totalTokens: usageData.used });
          }
          if (typeof usageData?.size === 'number' && usageData.size > 0) {
            setContextLimit(usageData.size);
          }
          break;
        }
        case 'finish':
          clearRuntimeState();
          break;
        case 'error':
          clearRuntimeState();
          addTransformedMessage();
          break;
        case 'user_content':
        case 'teammate_message':
          addTransformedMessage();
          break;
        default:
          if (!runningRef.current && !turnFinishedRef.current) {
            setRunningState(true);
          }
          addTransformedMessage();
          break;
      }
    });
  }, [addOrUpdateMessage, clearRuntimeState, conversationId, markActive, setRunningState, setStreamingContent]);

  useEffect(() => {
    const handleTurnCompleted = (event: IConversationTurnCompletedEvent) => {
      if (event.sessionId !== conversationId) {
        return;
      }

      clearRuntimeState();
    };

    return ipcBridge.conversation.turnCompleted?.on?.(handleTurnCompleted) || (() => {});
  }, [clearRuntimeState, conversationId]);

  useEffect(() => {
    let cancelled = false;

    setThought({ subject: '', description: '' });
    setTokenUsage(null);
    setContextLimit(0);
    setActivity(null);
    setStreamingContent(false);
    setHasHydratedRunningState(false);
    setRunningState(false);
    turnFinishedRef.current = true;

    void ipcBridge.conversation.get.invoke({ id: conversationId }).then((conversation) => {
      if (cancelled) {
        return;
      }

      const isRunning = conversation?.status === 'running';
      setRunningState(isRunning);
      turnFinishedRef.current = !isRunning;
      setActivity(isRunning ? { phase: 'waiting' } : null);

      const hydrated = getHydratedTokenState(conversation ?? null);
      setTokenUsage(hydrated.tokenUsage);
      setContextLimit(hydrated.contextLimit);
      setHasHydratedRunningState(true);
    });

    return () => {
      cancelled = true;
      emitter.emit('conversation.streaming', {
        conversationId,
        isStreaming: false,
      });
    };
  }, [conversationId, setRunningState, setStreamingContent]);

  const resetState = useCallback(() => {
    clearRuntimeState();
  }, [clearRuntimeState]);

  return {
    thought,
    setThought,
    running,
    hasHydratedRunningState,
    tokenUsage,
    contextLimit,
    hasStreamingContent,
    activity,
    resetState,
  };
};
