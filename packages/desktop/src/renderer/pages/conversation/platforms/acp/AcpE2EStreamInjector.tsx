/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chat/chatLib';
import { useAddOrUpdateMessage } from '@/renderer/pages/conversation/Messages/hooks';
import type { TConversationRuntimeSummary } from '@/common/config/storage';
import {
  localSendAccepted,
  localSendStarted,
  turnCompleted,
} from '@/renderer/pages/conversation/runtime/conversationRuntimeViewStore';
import React, { useEffect } from 'react';

const STREAM_TICK_MS = 35;
const ENABLED_CONVERSATION_KEY = 'aionui:e2e-message-stream-conversation-id';

type RunScenarioOptions = {
  historyPairs?: number;
  lines?: number;
  seedHistoryOnly?: boolean;
};

type StreamController = {
  runScenario: (options?: RunScenarioOptions) => Promise<void>;
  emitInfoTip: (code: string, content: string) => Promise<void>;
  emitErrorTip: (content: string, error?: Record<string, unknown>) => Promise<void>;
  emitToolError: (toolName: string, description: string) => Promise<void>;
  emitFileChange: (path: string, oldText: string, newText: string) => Promise<void>;
  emitAgentStatusError: (agentName: string) => Promise<void>;
  emitFollowUpExchange: () => Promise<void>;
  emitPlan: (
    entries: Array<{ content: string; status: 'pending' | 'in_progress' | 'completed' }>,
    options?: { msgId?: string; turnId?: string }
  ) => Promise<void>;
  endPlanTurn: (options?: { turnId?: string }) => Promise<void>;
};

type StreamRegistry = {
  controllers: Record<string, StreamController>;
};

declare global {
  interface Window {
    __AIONUI_E2E_MESSAGE_STREAM__?: StreamRegistry;
  }
}

const createSeedMessages = (conversationId: string, historyPairs: number): TMessage[] => {
  const baseCreatedAt = Date.now() - 100_000;
  const messages: TMessage[] = [];

  for (let index = 0; index < historyPairs; index += 1) {
    messages.push({
      id: `e2e-seed-user-${index}`,
      msg_id: `e2e-seed-user-${index}`,
      conversation_id: conversationId,
      type: 'text',
      position: 'right',
      created_at: baseCreatedAt + index * 2,
      content: {
        content: `User seed message ${index + 1}: keep the list tall enough to overflow.`,
      },
    });

    messages.push({
      id: `e2e-seed-assistant-${index}`,
      msg_id: `e2e-seed-assistant-${index}`,
      conversation_id: conversationId,
      type: 'text',
      position: 'left',
      created_at: baseCreatedAt + index * 2 + 1,
      content: {
        content: `Assistant seed reply ${index + 1}: this is stable history used to create a realistic scroll range.`,
      },
    });
  }

  messages.push({
    id: 'e2e-seed-user-final',
    msg_id: 'e2e-seed-user-final',
    conversation_id: conversationId,
    type: 'text',
    position: 'right',
    created_at: baseCreatedAt + historyPairs * 2 + 1,
    content: {
      content: 'Please stream a long reply line by line so the message list keeps growing.',
    },
  });

  return messages;
};

const createStreamChunks = (lines: number): string[] => {
  return Array.from(
    { length: lines },
    (_, index) =>
      `${index + 1}. Streamed line ${index + 1} keeps extending the assistant reply to stress-test bottom-follow scrolling.\n`
  );
};

const AcpE2EStreamInjector: React.FC<{ conversationId: string }> = ({ conversationId }) => {
  const addOrUpdateMessage = useAddOrUpdateMessage();

  useEffect(() => {
    const enabledConversationId =
      typeof window !== 'undefined' ? window.sessionStorage.getItem(ENABLED_CONVERSATION_KEY) : null;
    if (enabledConversationId !== conversationId) {
      return;
    }

    const registry = (window.__AIONUI_E2E_MESSAGE_STREAM__ ??= { controllers: {} });

    // The plan bar gates on the RUNTIME view (isProcessing + activeTurnId), not
    // on the message list, so injecting a plan row alone would never show it.
    // These controllers drive both halves so an e2e exercises the real gate.
    const runningRuntime = (turnId: string): TConversationRuntimeSummary => ({
      state: 'running',
      can_send_message: false,
      has_task: true,
      is_processing: true,
      pending_confirmations: 0,
      turn_id: turnId,
      supports_midturn_delivery: false,
    });

    registry.controllers[conversationId] = {
      emitPlan: async (entries, options) => {
        const msgId = options?.msgId ?? 'e2e-plan-msg';
        const turnId = options?.turnId ?? 'e2e-plan-turn';
        localSendStarted(conversationId);
        localSendAccepted(conversationId, turnId, runningRuntime(turnId), msgId);
        addOrUpdateMessage({
          // Deterministic id mirroring the persisted row's primary key, so a
          // second emitPlan updates the same card instead of stacking one.
          id: `plan:${msgId}`,
          msg_id: msgId,
          conversation_id: conversationId,
          type: 'plan',
          position: 'left',
          created_at: Date.now(),
          content: { entries, turn_id: turnId },
        } as TMessage);
      },
      endPlanTurn: async (options) => {
        const turnId = options?.turnId ?? 'e2e-plan-turn';
        turnCompleted(conversationId, turnId, {
          state: 'idle',
          can_send_message: true,
          has_task: false,
          is_processing: false,
          pending_confirmations: 0,
          turn_id: null,
        });
      },
      runScenario: async (options?: RunScenarioOptions) => {
        const historyPairs = options?.historyPairs ?? 18;
        const lines = options?.lines ?? 160;
        const streamMsgId = `e2e-stream-${Date.now()}`;

        if (historyPairs > 0) {
          createSeedMessages(conversationId, historyPairs).forEach((message) => addOrUpdateMessage(message, true));
        }

        if (options?.seedHistoryOnly) {
          return;
        }

        const chunks = createStreamChunks(lines);
        await new Promise<void>((resolve) => {
          let chunkIndex = 0;

          const pushNextChunk = () => {
            if (chunkIndex >= chunks.length) {
              resolve();
              return;
            }

            addOrUpdateMessage({
              id: `${streamMsgId}-${chunkIndex}`,
              msg_id: streamMsgId,
              conversation_id: conversationId,
              type: 'text',
              position: 'left',
              created_at: Date.now() + chunkIndex,
              content: {
                content: chunks[chunkIndex],
              },
            });
            chunkIndex += 1;
            window.setTimeout(pushNextChunk, STREAM_TICK_MS);
          };

          pushNextChunk();
        });
      },
      emitInfoTip: async (code: string, content: string) => {
        const msgId = `e2e-info-tip-${Date.now()}`;

        addOrUpdateMessage(
          {
            id: msgId,
            msg_id: msgId,
            conversation_id: conversationId,
            type: 'tips',
            position: 'center',
            status: 'finish',
            created_at: Date.now(),
            content: {
              content,
              type: 'info',
              code,
            },
          },
          true
        );

        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, STREAM_TICK_MS);
        });
      },
      emitErrorTip: async (content: string, error?: Record<string, unknown>) => {
        const msgId = `e2e-error-tip-${Date.now()}`;

        addOrUpdateMessage(
          {
            id: msgId,
            msg_id: msgId,
            conversation_id: conversationId,
            type: 'tips',
            position: 'center',
            status: 'finish',
            created_at: Date.now(),
            content: {
              content,
              type: 'error',
              ...(error ? { error } : {}),
            },
          } as unknown as TMessage,
          true
        );

        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, STREAM_TICK_MS);
        });
      },
      emitToolError: async (toolName: string, description: string) => {
        const msgId = `e2e-tool-error-${Date.now()}`;

        addOrUpdateMessage(
          {
            id: msgId,
            msg_id: msgId,
            conversation_id: conversationId,
            type: 'tool_group',
            position: 'left',
            status: 'finish',
            created_at: Date.now(),
            content: [
              {
                call_id: `${msgId}-call`,
                name: toolName,
                status: 'Error',
                description,
              },
            ],
          } as unknown as TMessage,
          true
        );

        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, STREAM_TICK_MS);
        });
      },
      emitFileChange: async (path: string, oldText: string, newText: string) => {
        const msgId = `e2e-file-change-${Date.now()}`;

        addOrUpdateMessage(
          {
            id: msgId,
            msg_id: msgId,
            conversation_id: conversationId,
            type: 'acp_tool_call',
            position: 'left',
            status: 'finish',
            created_at: Date.now(),
            content: {
              session_id: 'e2e-session',
              update: {
                sessionUpdate: 'tool_call_update',
                tool_call_id: `${msgId}-call`,
                status: 'completed',
                title: `Write ${path}`,
                kind: 'edit',
                rawInput: { path },
                content: [{ type: 'diff', path, old_text: oldText, new_text: newText }],
              },
            },
          } as TMessage,
          true
        );

        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, STREAM_TICK_MS);
        });
      },
      emitAgentStatusError: async (agentName: string) => {
        const msgId = `e2e-agent-status-error-${Date.now()}`;

        addOrUpdateMessage(
          {
            id: msgId,
            msg_id: msgId,
            conversation_id: conversationId,
            type: 'agent_status',
            position: 'center',
            status: 'finish',
            created_at: Date.now(),
            content: {
              backend: 'codex',
              status: 'error',
              agent_name: agentName,
            },
          } as unknown as TMessage,
          true
        );

        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, STREAM_TICK_MS);
        });
      },
      emitFollowUpExchange: async () => {
        const userMsgId = `e2e-follow-up-user-${Date.now()}`;
        const assistantMsgId = `e2e-follow-up-assistant-${Date.now()}`;

        addOrUpdateMessage(
          {
            id: userMsgId,
            msg_id: userMsgId,
            conversation_id: conversationId,
            type: 'text',
            position: 'right',
            status: 'finish',
            created_at: Date.now(),
            content: {
              content: 'Please continue after the neutral info tip.',
            },
          },
          true
        );

        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, STREAM_TICK_MS);
        });

        addOrUpdateMessage(
          {
            id: assistantMsgId,
            msg_id: assistantMsgId,
            conversation_id: conversationId,
            type: 'text',
            position: 'left',
            status: 'finish',
            created_at: Date.now() + 1,
            content: {
              content: 'Follow-up reply arrived after the neutral empty-turn tip.',
            },
          },
          true
        );

        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, STREAM_TICK_MS);
        });
      },
    };

    return () => {
      if (window.__AIONUI_E2E_MESSAGE_STREAM__) {
        delete window.__AIONUI_E2E_MESSAGE_STREAM__.controllers[conversationId];
      }
    };
  }, [addOrUpdateMessage, conversationId]);

  return null;
};

export default AcpE2EStreamInjector;
