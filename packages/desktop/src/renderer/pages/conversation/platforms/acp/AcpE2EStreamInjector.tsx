/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chat/chatLib';
import { useAddOrUpdateMessage } from '@/renderer/pages/conversation/Messages/hooks';
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
  emitFollowUpExchange: () => Promise<void>;
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

    registry.controllers[conversationId] = {
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
