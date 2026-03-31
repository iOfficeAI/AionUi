import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutoTitle } from '@/renderer/hooks/chat/useAutoTitle';
import type { TMessage } from '@/common/chat/chatLib';

const conversationGetMock = vi.fn();
const conversationUpdateMock = vi.fn();
const getConversationMessagesMock = vi.fn();
const updateTabNameMock = vi.fn();
const emitterEmitMock = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      get: {
        invoke: (...args: unknown[]) => conversationGetMock(...args),
      },
      update: {
        invoke: (...args: unknown[]) => conversationUpdateMock(...args),
      },
    },
    database: {
      getConversationMessages: {
        invoke: (...args: unknown[]) => getConversationMessagesMock(...args),
      },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: () => 'New Chat',
  }),
}));

vi.mock('@/renderer/pages/conversation/hooks/ConversationTabsContext', () => ({
  useConversationTabs: () => ({
    updateTabName: updateTabNameMock,
  }),
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    emit: (...args: unknown[]) => emitterEmitMock(...args),
  },
}));

const createUserMessage = (content: string): TMessage => ({
  id: content,
  conversation_id: 'conv-1',
  type: 'text',
  position: 'right',
  content: { content },
  createdAt: Date.now(),
});

describe('useAutoTitle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the first user message from history for the title', async () => {
    conversationGetMock.mockResolvedValue({ id: 'conv-1', name: 'New Chat' });
    getConversationMessagesMock.mockResolvedValue([
      createUserMessage('帮我整理一个 monorepo CI 失败排查清单'),
      createUserMessage('继续'),
    ]);
    conversationUpdateMock.mockResolvedValue(true);

    const { result } = renderHook(() => useAutoTitle());

    await result.current.checkAndUpdateTitle('conv-1', '继续');

    expect(conversationUpdateMock).toHaveBeenCalledWith({
      id: 'conv-1',
      updates: { name: '帮我整理一个 monorepo CI 失败排查清单' },
    });
    expect(updateTabNameMock).toHaveBeenCalledWith('conv-1', '帮我整理一个 monorepo CI 失败排查清单');
    expect(emitterEmitMock).toHaveBeenCalledWith('chat.history.refresh');
  });

  it('falls back to the current input when history is still empty', async () => {
    conversationGetMock.mockResolvedValue({ id: 'conv-1', name: 'New Chat' });
    getConversationMessagesMock.mockResolvedValue([]);
    conversationUpdateMock.mockResolvedValue(true);

    const { result } = renderHook(() => useAutoTitle());

    await result.current.checkAndUpdateTitle('conv-1', '继续');

    expect(conversationUpdateMock).toHaveBeenCalledWith({
      id: 'conv-1',
      updates: { name: '继续' },
    });
  });
});
