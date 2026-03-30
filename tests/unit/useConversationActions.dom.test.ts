// @vitest-environment jsdom

import { renderHook, act } from '@testing-library/react';
import type { TChatConversation } from '@/common/config/storage';
import { useConversationActions } from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversationActions';

const { updateConversationMock, emitMock, refreshConversationCacheMock, updateTabNameMock, navigateMock } = vi.hoisted(
  () => ({
    updateConversationMock: vi.fn(),
    emitMock: vi.fn(),
    refreshConversationCacheMock: vi.fn(),
    updateTabNameMock: vi.fn(),
    navigateMock: vi.fn(),
  })
);

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      update: {
        invoke: updateConversationMock,
      },
    },
  },
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    emit: emitMock,
  },
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  refreshConversationCache: refreshConversationCacheMock,
}));

vi.mock('@/renderer/utils/ui/focus', () => ({
  blockMobileInputFocus: vi.fn(),
  blurActiveElement: vi.fn(),
}));

vi.mock('@arco-design/web-react', () => ({
  Message: {
    success: vi.fn(),
    error: vi.fn(),
  },
  Modal: {
    confirm: vi.fn(),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  useParams: () => ({ id: 'conversation-1' }),
}));

vi.mock('@/renderer/pages/conversation/hooks/ConversationTabsContext', () => ({
  useConversationTabs: () => ({
    openTab: vi.fn(),
    closeAllTabs: vi.fn(),
    activeTab: null,
    updateTabName: updateTabNameMock,
  }),
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/utils/groupingHelpers', () => ({
  isConversationPinned: vi.fn(() => false),
}));

describe('useConversationActions', () => {
  beforeEach(() => {
    updateConversationMock.mockReset();
    emitMock.mockReset();
    refreshConversationCacheMock.mockReset();
    updateTabNameMock.mockReset();
    navigateMock.mockReset();
  });

  it('refreshes the active conversation cache after a successful rename', async () => {
    updateConversationMock.mockResolvedValue(true);

    const { result } = renderHook(() =>
      useConversationActions({
        batchMode: false,
        selectedConversationIds: new Set<string>(),
        setSelectedConversationIds: vi.fn(),
        toggleSelectedConversation: vi.fn(),
        markAsRead: vi.fn(),
      })
    );

    const conversation = {
      id: 'conversation-1',
      name: 'Old title',
    } as unknown as TChatConversation;

    act(() => {
      result.current.handleEditStart(conversation);
    });

    act(() => {
      result.current.setRenameModalName('New title');
    });

    await act(async () => {
      await result.current.handleRenameConfirm();
    });

    expect(updateConversationMock).toHaveBeenCalledWith({
      id: 'conversation-1',
      updates: { name: 'New title' },
    });
    expect(refreshConversationCacheMock).toHaveBeenCalledWith('conversation-1');
    expect(updateTabNameMock).toHaveBeenCalledWith('conversation-1', 'New title');
    expect(emitMock).toHaveBeenCalledWith('chat.history.refresh');
  });
});
