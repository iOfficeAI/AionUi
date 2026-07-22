/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAionrsMessage } from '@/renderer/pages/conversation/platforms/aionrs/useAionrsMessage';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';
import { resetEnsureConversationRuntimeStateForTests } from '@/renderer/pages/conversation/utils/ensureConversationRuntime';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';

const { addOrUpdateMessageMock, responseStreamOnMock, responseStreamHandlerRef } = vi.hoisted(() => ({
  addOrUpdateMessageMock: vi.fn(),
  responseStreamOnMock: vi.fn(),
  responseStreamHandlerRef: {
    current: undefined as ((message: IResponseMessage) => void) | undefined,
  },
}));

vi.mock('@/renderer/pages/conversation/Messages/hooks', () => ({
  useAddOrUpdateMessage: () => addOrUpdateMessageMock,
  useMergeLiveMessage: () => addOrUpdateMessageMock,
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  getConversationOrNull: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      responseStream: {
        on: responseStreamOnMock.mockImplementation((handler: (message: IResponseMessage) => void) => {
          responseStreamHandlerRef.current = handler;
          return vi.fn();
        }),
      },
      update: { invoke: vi.fn() },
    },
  },
}));

describe('useAionrsMessage teammate_message backflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetEnsureConversationRuntimeStateForTests();
    responseStreamHandlerRef.current = undefined;
    vi.mocked(getConversationOrNull).mockResolvedValue(null);
  });

  it('normalizes and merges teammate text messages into the leader conversation', async () => {
    renderHook(() => useAionrsMessage('leader-conversation-1'));

    await waitFor(() => expect(responseStreamHandlerRef.current).toBeTypeOf('function'));

    act(() => {
      responseStreamHandlerRef.current?.({
        type: 'teammate_message',
        data: {
          id: 'projected-message-1',
          type: 'text',
          msg_id: 'projected-message-1',
          conversation_id: 'leader-conversation-1',
          position: 'left',
          status: 'finish',
          content: {
            content: '[Codex Assistant] idle',
            teammate_message: true,
            sender_name: 'Codex Assistant',
            sender_backend: 'codex',
            sender_conversation_id: 'teammate-conversation-1',
          },
        },
        msg_id: 'projected-message-1',
        conversation_id: 'leader-conversation-1',
      } as unknown as IResponseMessage);
    });

    expect(addOrUpdateMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'text',
        msg_id: 'projected-message-1',
        conversation_id: 'leader-conversation-1',
        content: {
          content: '[Codex Assistant] idle',
          teammateMessage: true,
          senderName: 'Codex Assistant',
          senderAgentType: 'codex',
          senderConversationId: 'teammate-conversation-1',
        },
      })
    );
  });

  it('ignores teammate messages addressed to other conversations', async () => {
    renderHook(() => useAionrsMessage('leader-conversation-1'));

    await waitFor(() => expect(responseStreamHandlerRef.current).toBeTypeOf('function'));

    act(() => {
      responseStreamHandlerRef.current?.({
        type: 'teammate_message',
        data: {
          id: 'projected-message-2',
          type: 'text',
          msg_id: 'projected-message-2',
          conversation_id: 'leader-conversation-2',
          position: 'left',
          status: 'finish',
          content: {
            content: 'wrong conversation',
            teammate_message: true,
          },
        },
        msg_id: 'projected-message-2',
        conversation_id: 'leader-conversation-1',
      } as unknown as IResponseMessage);
    });

    expect(addOrUpdateMessageMock).not.toHaveBeenCalled();
  });

  it('merges final teammate messages from multiple agents independently', async () => {
    renderHook(() => useAionrsMessage('leader-conversation-1'));

    await waitFor(() => expect(responseStreamHandlerRef.current).toBeTypeOf('function'));

    act(() => {
      responseStreamHandlerRef.current?.({
        type: 'teammate_message',
        data: {
          id: 'agent-a-msg',
          type: 'text',
          msg_id: 'agent-a-msg',
          conversation_id: 'leader-conversation-1',
          position: 'left',
          status: 'finish',
          content: {
            content: 'Agent A reply',
            teammate_message: true,
            sender_name: 'Agent A',
            sender_backend: 'codex',
            sender_conversation_id: 'conv-a',
          },
        },
        msg_id: 'agent-a-msg',
        conversation_id: 'leader-conversation-1',
      } as unknown as IResponseMessage);
    });

    act(() => {
      responseStreamHandlerRef.current?.({
        type: 'teammate_message',
        data: {
          id: 'agent-b-msg',
          type: 'text',
          msg_id: 'agent-b-msg',
          conversation_id: 'leader-conversation-1',
          position: 'left',
          status: 'finish',
          content: {
            content: 'Agent B reply',
            teammate_message: true,
            sender_name: 'Agent B',
            sender_backend: 'qwen',
            sender_conversation_id: 'conv-b',
          },
        },
        msg_id: 'agent-b-msg',
        conversation_id: 'leader-conversation-1',
      } as unknown as IResponseMessage);
    });

    expect(addOrUpdateMessageMock).toHaveBeenCalledTimes(2);
    expect(addOrUpdateMessageMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        msg_id: 'agent-a-msg',
        content: expect.objectContaining({ senderName: 'Agent A', senderAgentType: 'codex' }),
      })
    );
    expect(addOrUpdateMessageMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        msg_id: 'agent-b-msg',
        content: expect.objectContaining({ senderName: 'Agent B', senderAgentType: 'qwen' }),
      })
    );
  });

  it('deduplicates repeated identical teammate_message events', async () => {
    renderHook(() => useAionrsMessage('leader-conversation-1'));

    await waitFor(() => expect(responseStreamHandlerRef.current).toBeTypeOf('function'));

    const event = {
      type: 'teammate_message',
      data: {
        id: 'dup-msg',
        type: 'text',
        msg_id: 'dup-msg',
        conversation_id: 'leader-conversation-1',
        position: 'left',
        status: 'finish',
        content: {
          content: 'same',
          teammate_message: true,
        },
      },
      msg_id: 'dup-msg',
      conversation_id: 'leader-conversation-1',
    } as unknown as IResponseMessage;

    act(() => {
      responseStreamHandlerRef.current?.(event);
      responseStreamHandlerRef.current?.(event);
    });

    expect(addOrUpdateMessageMock).toHaveBeenCalledTimes(1);
  });
});
