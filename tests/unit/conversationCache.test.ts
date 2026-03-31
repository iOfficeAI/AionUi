import { refreshConversationCache } from '@/renderer/pages/conversation/utils/conversationCache';

const { getConversationMock, mutateMock } = vi.hoisted(() => ({
  getConversationMock: vi.fn(),
  mutateMock: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      get: {
        invoke: getConversationMock,
      },
    },
  },
}));

vi.mock('swr', () => ({
  mutate: mutateMock,
}));

describe('refreshConversationCache', () => {
  beforeEach(() => {
    getConversationMock.mockReset();
    mutateMock.mockReset();
  });

  it('updates the conversation SWR cache with the latest conversation data', async () => {
    const conversation = {
      id: 'conversation-1',
      name: 'Renamed conversation',
    };
    getConversationMock.mockResolvedValue(conversation);

    await refreshConversationCache('conversation-1');

    expect(getConversationMock).toHaveBeenCalledWith({ id: 'conversation-1' });
    expect(mutateMock).toHaveBeenCalledWith('conversation/conversation-1', conversation, false);
  });

  it('skips cache updates when the conversation cannot be loaded', async () => {
    getConversationMock.mockResolvedValue(null);

    await refreshConversationCache('missing-conversation');

    expect(mutateMock).not.toHaveBeenCalled();
  });
});
