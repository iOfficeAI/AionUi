/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { AvailableCommand, TMessage, ToolProgress } from '@/common/chat/chatLib';
import { transformMessage } from '@/common/chat/chatLib';
import type { SlashCommandItem } from '@/common/chat/slash/types';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import type { TokenUsageData } from '@/common/config/storage';
import { useAddOrUpdateMessage } from '@/renderer/pages/conversation/Messages/hooks';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import type { ThoughtData } from '@/renderer/components/chat/ThoughtDisplay';
import { uuid } from '@/common/utils';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Notification } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';

/**
 * Best-effort classifier mapping a backend tool_progress payload into the
 * discriminated `ToolProgress` shape consumed by the tool-call renderer. The
 * backend's per-tool normalizer (`normalize_progress_payload`) has already
 * stripped sensitive payload bodies; here we only pick a family discriminator
 * so the UI can pick the right renderer (terminal block / counter / bar).
 */
function classifyProgress(toolName: string | undefined, raw: unknown): ToolProgress {
  if (!raw || typeof raw !== 'object') {
    return { kind: 'unknown', raw };
  }
  const obj = raw as Record<string, unknown>;
  const name = (toolName ?? '').toLowerCase();
  if (name === 'bash' || name === 'shell') {
    return {
      kind: 'bash',
      stdoutChunk: typeof obj.stdoutChunk === 'string' ? obj.stdoutChunk : undefined,
      stderrChunk: typeof obj.stderrChunk === 'string' ? obj.stderrChunk : undefined,
      exitCode: typeof obj.exitCode === 'number' ? obj.exitCode : undefined,
    };
  }
  if (name === 'grep' || name === 'glob') {
    return {
      kind: name as 'grep' | 'glob',
      filesScanned: typeof obj.filesScanned === 'number' ? obj.filesScanned : undefined,
      matches: typeof obj.matches === 'number' ? obj.matches : undefined,
    };
  }
  if (name === 'read' || name === 'write') {
    return {
      kind: name as 'read' | 'write',
      bytesProcessed: typeof obj.bytesProcessed === 'number' ? obj.bytesProcessed : undefined,
      bytesTotal: typeof obj.bytesTotal === 'number' ? obj.bytesTotal : undefined,
    };
  }
  // MCP and anything else with the conventional {step, percent, message} shape.
  if (typeof obj.step === 'string' || typeof obj.percent === 'number' || typeof obj.message === 'string') {
    return {
      kind: 'mcp',
      step: typeof obj.step === 'string' ? obj.step : undefined,
      percent: typeof obj.percent === 'number' ? obj.percent : undefined,
      message: typeof obj.message === 'string' ? obj.message : undefined,
    };
  }
  return { kind: 'unknown', raw };
}

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
  stopState: 'idle' | 'stopping' | 'force_available' | 'stopped';
  beginStop: () => void;
  acknowledgeStopLocally: () => void;
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
  const { t } = useTranslation();
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const [running, setRunning] = useState(false);
  const [hasHydratedRunningState, setHasHydratedRunningState] = useState(false);
  const [thought, setThought] = useState<ThoughtData>({ description: '', subject: '' });
  const [aiProcessing, setAiProcessing] = useState(false);
  const [tokenUsage, setTokenUsage] = useState<TokenUsageData | null>(null);
  const [context_limit, setContextLimit] = useState<number>(0);
  const [slashCommands, setSlashCommands] = useState<SlashCommandItem[]>([]);
  const [stopState, setStopState] = useState<'idle' | 'stopping' | 'force_available' | 'stopped'>('idle');
  const stopTimeoutRef = useRef<number | undefined>(undefined);

  // Refs to sync state for immediate access in event handlers
  const runningRef = useRef(running);
  const aiProcessingRef = useRef(aiProcessing);

  // Track whether the current turn has produced content output
  const hasContentInTurnRef = useRef(false);

  // Guard: after finish arrives, prevent auto-recover from setting running=true
  // until a new 'start' signal arrives for the next turn
  const turnFinishedRef = useRef(false);

  // msg_id of the assistant text bubble currently receiving streamed deltas.
  // Used to flip its `is_finished` content flag to true at end of turn (or
  // when deltas switch to a new msg_id mid-turn, e.g. text → tool → text).
  const streamingTextMsgIdRef = useRef<string | null>(null);

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

  const clearStopTimeout = useCallback(() => {
    if (stopTimeoutRef.current) {
      window.clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = undefined;
    }
  }, []);

  const beginStop = useCallback(() => {
    clearStopTimeout();
    setStopState('stopping');
    stopTimeoutRef.current = window.setTimeout(() => {
      setStopState((current) => (current === 'stopping' ? 'force_available' : current));
    }, 10000);
  }, [clearStopTimeout]);

  const acknowledgeStopLocally = useCallback(() => {
    clearStopTimeout();
    setStopState('stopped');
    setRunning(false);
    runningRef.current = false;
    setAiProcessing(false);
    aiProcessingRef.current = false;
  }, [clearStopTimeout]);

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

      // Flip the in-flight assistant text bubble to finished. Merges an empty
      // delta carrying `is_finished: true` onto the tracked msg_id so the
      // renderer can drop its cheap streaming mode (plain code, deferred
      // KaTeX) and produce the final rich render exactly once.
      const finalizeStreamingText = () => {
        const msgId = streamingTextMsgIdRef.current;
        if (!msgId) return;
        streamingTextMsgIdRef.current = null;
        addOrUpdateMessage({
          id: msgId,
          msg_id: msgId,
          conversation_id: message.conversation_id,
          type: 'text',
          position: 'left',
          content: { content: '', is_finished: true },
          created_at: Date.now(),
        });
      };

      const transformedMessage = transformMessage(message);
      switch (message.type) {
        case 'start':
          // Safety net: a new turn implies the previous one ended even if its
          // terminal event (finish/error/session_idle) was never delivered —
          // don't leave the prior bubble stuck in cheap streaming-render mode.
          finalizeStreamingText();
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
          if (transformedMessage?.type === 'text' && transformedMessage.msg_id) {
            // Deltas switched to a new assistant bubble — finalize the old one
            // so it doesn't stay in cheap streaming-render mode forever.
            if (streamingTextMsgIdRef.current && streamingTextMsgIdRef.current !== transformedMessage.msg_id) {
              finalizeStreamingText();
            }
            streamingTextMsgIdRef.current = transformedMessage.msg_id;
            addOrUpdateMessage({
              ...transformedMessage,
              content: { ...transformedMessage.content, is_finished: false },
            });
          } else {
            addOrUpdateMessage(transformedMessage);
          }
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
          finalizeStreamingText();
          turnFinishedRef.current = true;
          setRunning(false);
          runningRef.current = false;
          setAiProcessing(false);
          aiProcessingRef.current = false;
          setThought({ subject: '', description: '' });
          clearStopTimeout();
          setStopState((current) => (current === 'stopping' || current === 'force_available' ? 'stopped' : 'idle'));
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
          finalizeStreamingText();
          if ((message.data as { kind?: string; recoverable?: boolean } | undefined)?.kind === 'aborted') {
            turnFinishedRef.current = true;
            setRunning(false);
            runningRef.current = false;
            setAiProcessing(false);
            aiProcessingRef.current = false;
            clearStopTimeout();
            setStopState('stopped');
            break;
          }
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
        case 'session_status': {
          const data = message.data as { status?: string };
          if (data.status === 'aborting') {
            setStopState('stopping');
            setAiProcessing(true);
            aiProcessingRef.current = true;
          }
          break;
        }
        case 'session_idle': {
          const data = message.data as { reason?: string; at?: number };
          finalizeStreamingText();
          turnFinishedRef.current = true;
          setRunning(false);
          runningRef.current = false;
          setAiProcessing(false);
          aiProcessingRef.current = false;
          clearStopTimeout();
          setStopState(data.reason === 'aborted' ? 'stopped' : 'idle');
          const labelKey =
            data.reason === 'aborted'
              ? 'conversation.remoteAbort.stopped'
              : `conversation.remoteAbort.${data.reason ?? 'completed'}`;
          addOrUpdateMessage({
            id: uuid(),
            type: 'tips',
            position: 'center',
            conversation_id: message.conversation_id,
            created_at: data.at ?? Date.now(),
            content: {
              content: t(labelKey, {
                defaultValue: data.reason === 'aborted' ? 'Stopped' : (data.reason ?? 'Completed'),
              }),
              type: data.reason === 'errored' ? 'error' : 'success',
            },
          });
          break;
        }
        case 'retry':
        case 'session_error_recovered':
          if (transformedMessage) {
            addOrUpdateMessage(transformedMessage);
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
        case 'opencode_subtask': {
          // Sub-agent (OpenCode child session) lifecycle update. The hook
          // surfaces it as its own message so the renderer can pin the
          // collapsed Task chip + nested transcript at the right point in the
          // parent transcript.
          recoverRunning();
          setThought({ subject: '', description: '' });
          addOrUpdateMessage(transformedMessage);
          break;
        }
        case 'tool_input': {
          // Streamed JSON-construction phase for a tool call. We splice the
          // partial JSON into the matching `acp_tool_call` bubble (by
          // `part_id`/`tool_call_id`) so the renderer can show
          // "Constructing arguments…" without us minting a separate message.
          const data = message.data as {
            session_id?: string;
            parent_session_id?: string;
            part_id?: string;
            phase: 'started' | 'delta' | 'ended';
            tool_name?: string;
            input_delta?: string;
            final_input?: unknown;
          };
          if (!data?.part_id) break;
          // Concatenate deltas into a rolling `partial` string. The renderer
          // tolerates invalid JSON (best-effort prettify) until `ended`.
          const synthetic: TMessage = {
            id: uuid(),
            type: 'acp_tool_call',
            msg_id: data.part_id,
            position: 'left',
            conversation_id: message.conversation_id,
            created_at: message.created_at ?? Date.now(),
            content: {
              sessionUpdate: 'tool_call_update' as any,
              tool_call_id: data.part_id,
              ...(data.parent_session_id ? { parentSessionId: data.parent_session_id } : {}),
              inputStreaming: {
                partial:
                  data.phase === 'ended'
                    ? typeof data.final_input === 'string'
                      ? data.final_input
                      : JSON.stringify(data.final_input ?? {}, null, 2)
                    : (data.input_delta ?? ''),
                phase: data.phase,
                toolName: data.tool_name,
              },
            } as any,
          };
          recoverRunning();
          addOrUpdateMessage(synthetic);
          break;
        }
        case 'tool_progress': {
          const data = message.data as {
            session_id?: string;
            parent_session_id?: string;
            part_id?: string;
            tool_name?: string;
            progress?: unknown;
            at?: number;
          };
          if (!data?.part_id) break;
          const synthetic: TMessage = {
            id: uuid(),
            type: 'acp_tool_call',
            msg_id: data.part_id,
            position: 'left',
            conversation_id: message.conversation_id,
            created_at: message.created_at ?? data.at ?? Date.now(),
            content: {
              sessionUpdate: 'tool_call_update' as any,
              tool_call_id: data.part_id,
              ...(data.parent_session_id ? { parentSessionId: data.parent_session_id } : {}),
              progress: classifyProgress(data.tool_name, data.progress),
            } as any,
          };
          recoverRunning();
          addOrUpdateMessage(synthetic);
          break;
        }
        case 'opencode_session_compacted': {
          const compacted = message.data as {
            summary?: string;
            tokens_reclaimed?: number;
            original_start_message_id?: string;
            original_end_message_id?: string;
          };
          if (compacted) {
            Notification.info({
              title: t('conversation.remoteCompaction.title'),
              content: t('conversation.remoteCompaction.notification', {
                tokens: Math.round((compacted.tokens_reclaimed ?? 0) / 1024),
              }),
              duration: 5000,
            });
          }
          break;
        }
        default:
          // tool_call, acp_tool_call, tool_group, plan, agent_status, system, …
          // (only reachable via the OpenClaw/ACP WebSocket forward path).
          recoverRunning();
          setThought({ subject: '', description: '' });
          addOrUpdateMessage(transformedMessage);
          break;
      }
    },
    [conversation_id, addOrUpdateMessage, fetchSlashCommands, clearStopTimeout, t]
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
    clearStopTimeout();
    setStopState('idle');
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
    stopState,
    beginStop,
    acknowledgeStopLocally,
  };
};
