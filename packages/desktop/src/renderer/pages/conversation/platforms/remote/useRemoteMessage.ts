/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { AvailableCommand, TMessage } from '@/common/chat/chatLib';
import { transformMessage } from '@/common/chat/chatLib';
import type { SlashCommandItem } from '@/common/chat/slash/types';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { TokenUsageData } from '@/common/config/storage';
import { useAddOrUpdateMessage } from '@/renderer/pages/conversation/Messages/hooks';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import type { ThoughtData } from '@/renderer/components/chat/ThoughtDisplay';
import { useCallback, useEffect, useRef, useState } from 'react';

export type UseRemoteMessageReturn = {
  thought: ThoughtData;
  setThought: React.Dispatch<React.SetStateAction<ThoughtData>>;
  running: boolean;
  hasHydratedRunningState: boolean;
  aiProcessing: boolean;
  setAiProcessing: React.Dispatch<React.SetStateAction<boolean>>;
  resetState: () => void;
  tokenUsage: TokenUsageData | null;
  context_limit: number;
  hasThinkingMessage: boolean;
  slashCommands: SlashCommandItem[];
  fetchSlashCommands: () => void;
};

/**
 * Stream-state hook for remote-agent conversations (OpenCode, OpenClaw, …).
 *
 * Mirrors `useAcpMessage` in shape, but adapts to what AionCore's remote
 * manager actually emits over `ipcBridge.conversation.responseStream`. Key
 * differences vs the ACP hook (verified against the `AgentStreamEvent` enum
 * and `manager/remote/agent.rs`):
 *   - listens on the generic `conversation.responseStream`, not `acpConversation`;
 *   - there is no `thought` event in the remote protocol — reasoning arrives as
 *     `thinking`, so `thought` state stays empty (no throttle machinery);
 *   - `acp_permission` is rewritten to `type: 'permission'` before transform;
 *   - the OpenCode-only `assistant_model_info` stamps the producing model;
 *   - no `acpStatus` (remote has none).
 *
 * `aiProcessing` intentionally spans the whole turn (set true on send/start/
 * thinking/content/permission, cleared only on finish/error) so the send box
 * can keep driving its loading UI off `aiProcessing` alone.
 */
export const useRemoteMessage = (conversation_id: string): UseRemoteMessageReturn => {
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const [running, setRunning] = useState(false);
  const [hasHydratedRunningState, setHasHydratedRunningState] = useState(false);
  const [thought, setThought] = useState<ThoughtData>({ description: '', subject: '' });
  const [aiProcessing, setAiProcessing] = useState(false);
  const [tokenUsage, setTokenUsage] = useState<TokenUsageData | null>(null);
  const [context_limit, setContextLimit] = useState<number>(0);
  const [slashCommands, setSlashCommands] = useState<SlashCommandItem[]>([]);

  // Refs to sync state for immediate access in event handlers
  const runningRef = useRef(running);
  const aiProcessingRef = useRef(aiProcessing);

  // Track whether the current turn has produced content output
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
    model_id: string;
    session_mode?: string;
  } | null>(null);

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

  const handleResponseMessage = useCallback(
    (message: IResponseMessage) => {
      if (conversation_id !== message.conversation_id) {
        return;
      }

      // These never carry a renderable payload for remote conversations.
      if (message.type === 'skill_suggest' || message.type === 'cron_trigger') {
        return;
      }

      // Auto-recover running only while a turn is genuinely in flight.
      const recoverRunning = () => {
        if (!runningRef.current && !turnFinishedRef.current) {
          setRunning(true);
          runningRef.current = true;
        }
      };
      const startProcessing = () => {
        if (!aiProcessingRef.current) {
          setAiProcessing(true);
          aiProcessingRef.current = true;
        }
      };

      const transformedMessage = transformMessage(message);
      switch (message.type) {
        case 'start':
          // New turn starting — clear the finished guard and content flag
          turnFinishedRef.current = false;
          hasContentInTurnRef.current = false;
          setRunning(true);
          runningRef.current = true;
          startProcessing();
          break;
        case 'thinking': {
          const thinkingData = message.data as { status?: string };
          // Only set running for active thinking, not for the done signal
          if (thinkingData?.status !== 'done') {
            recoverRunning();
            startProcessing();
          }
          hasThinkingMessageRef.current = true;
          setHasThinkingMessage(true);
          addOrUpdateMessage(transformedMessage);
          break;
        }
        case 'text':
        case 'content': {
          hasContentInTurnRef.current = true;
          recoverRunning();
          startProcessing();
          // Clear thought when the final answer arrives
          setThought({ subject: '', description: '' });
          addOrUpdateMessage(transformedMessage);
          break;
        }
        case 'acp_permission': {
          recoverRunning();
          startProcessing();
          setThought({ subject: '', description: '' });
          // Remote agents emit `acp_permission`, but the UI renders the generic
          // permission bubble — rewrite the type before transforming.
          const permissionMessage = transformMessage({ ...message, type: 'permission' });
          if (permissionMessage) {
            addOrUpdateMessage(permissionMessage);
          }
          break;
        }
        case 'assistant_model_info': {
          // OpenCode-only: stamp the producing model onto the in-flight
          // assistant text bubble. Arrives once per assistant message at
          // creation (before the first text delta) with the same msg_id that
          // the first text segment will use, so composeMessage merges the
          // `model` field onto the same bubble.
          const modelData = message.data as
            | { message_id?: string; provider_id?: string; model_id?: string }
            | undefined;
          if (modelData?.provider_id && modelData?.model_id) {
            const placeholder: TMessage = {
              id: message.msg_id,
              msg_id: message.msg_id,
              conversation_id: message.conversation_id,
              type: 'text',
              position: 'left',
              content: {
                content: '',
                model: {
                  providerId: modelData.provider_id,
                  modelId: modelData.model_id,
                },
              },
              created_at: message.created_at ?? Date.now(),
            };
            addOrUpdateMessage(placeholder);
          }
          break;
        }
        case 'finish':
          turnFinishedRef.current = true;
          setRunning(false);
          runningRef.current = false;
          setAiProcessing(false);
          aiProcessingRef.current = false;
          setThought({ subject: '', description: '' });
          hasContentInTurnRef.current = false;
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
          break;
        case 'error':
          turnFinishedRef.current = true;
          setRunning(false);
          runningRef.current = false;
          setAiProcessing(false);
          aiProcessingRef.current = false;
          addOrUpdateMessage(transformedMessage);
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
        case 'acp_model_info':
        case 'acp_mode_info':
          // Mode/model info is consumed by AgentModeSelector / model selectors;
          // no action needed in the message stream.
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
        case 'slash_commands_updated':
          fetchSlashCommands();
          break;
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
        default:
          // tool_call, acp_tool_call, tool_group, plan, agent_status, system, …
          // (only reachable via the OpenClaw/ACP WebSocket forward path).
          recoverRunning();
          setThought({ subject: '', description: '' });
          addOrUpdateMessage(transformedMessage);
          break;
      }
    },
    [conversation_id, addOrUpdateMessage, fetchSlashCommands]
  );

  useEffect(() => {
    return ipcBridge.conversation.responseStream.on(handleResponseMessage);
  }, [handleResponseMessage]);

  // Reset state when conversation changes and restore actual running status
  useEffect(() => {
    let cancelled = false;

    setThought({ subject: '', description: '' });
    setTokenUsage(null);
    setContextLimit(0);
    setSlashCommands([]);
    hasContentInTurnRef.current = false;
    turnFinishedRef.current = false;
    hasThinkingMessageRef.current = false;
    setHasThinkingMessage(false);
    setHasHydratedRunningState(false);

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
        const isRunning = res.status === 'running';
        setRunning(isRunning);
        runningRef.current = isRunning;
        if (isRunning) {
          setAiProcessing(true);
          aiProcessingRef.current = true;
        }
        setHasHydratedRunningState(true);
        // Note: remote conversations do not persist token-usage in `extra`,
        // so there is nothing to restore here (unlike the ACP path).
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setRunning(false);
        runningRef.current = false;
        setAiProcessing(false);
        aiProcessingRef.current = false;
        setHasHydratedRunningState(true);

        if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
          console.warn('[useRemoteMessage] Failed to hydrate conversation state:', error);
          return;
        }

        throw error;
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
