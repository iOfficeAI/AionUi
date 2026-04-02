import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TChatConversation } from '@/common/config/storage';

let responseListener:
  | ((message: { type: string; conversation_id: string; data: unknown; msg_id: string }) => void)
  | null = null;
let turnCompletedListener: ((event: { sessionId: string; state: string }) => void) | null = null;
let listChangedListener: ((event: { conversationId: string; action: string }) => void) | null = null;

const getUserConversationsInvoke = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    database: {
      getUserConversations: {
        invoke: (...args: unknown[]) => getUserConversationsInvoke(...args),
      },
    },
    conversation: {
      responseStream: {
        on: vi.fn((listener: typeof responseListener) => {
          responseListener = listener;
          return () => {
            responseListener = null;
          };
        }),
      },
      turnCompleted: {
        on: vi.fn((listener: typeof turnCompletedListener) => {
          turnCompletedListener = listener;
          return () => {
            turnCompletedListener = null;
          };
        }),
      },
      listChanged: {
        on: vi.fn((listener: typeof listChangedListener) => {
          listChangedListener = listener;
          return () => {
            listChangedListener = null;
          };
        }),
      },
    },
  },
}));

vi.mock('@/renderer/utils/emitter', () => ({
  addEventListener: vi.fn(() => () => {}),
}));

const conversation = {
  id: 'conv-1',
  name: 'New Conversation',
  type: 'acp',
  source: 'aionui',
  createTime: Date.now(),
  modifyTime: Date.now(),
  extra: {},
} as TChatConversation;

// Import after mocks
import { useConversationListSync } from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync';

describe('useConversationListSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    responseListener = null;
    turnCompletedListener = null;
    listChangedListener = null;
    getUserConversationsInvoke.mockResolvedValue([conversation]);
  });

  it('clears sidebar generating state when a finish event arrives', async () => {
    const { result } = renderHook(() => useConversationListSync());

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(1);
    });

    expect(result.current.isConversationGenerating('conv-1')).toBe(false);

    act(() => {
      responseListener?.({
        type: 'start',
        conversation_id: 'conv-1',
        msg_id: 'msg-1',
        data: null,
      });
    });

    expect(result.current.isConversationGenerating('conv-1')).toBe(true);

    act(() => {
      responseListener?.({
        type: 'finish',
        conversation_id: 'conv-1',
        msg_id: 'msg-1',
        data: null,
      });
    });

    expect(result.current.isConversationGenerating('conv-1')).toBe(false);
  });
});
