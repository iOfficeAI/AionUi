import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SWRConfig } from 'swr';
import ChatConversationIndex from '@/renderer/pages/conversation';

const openTabMock = vi.fn();
const closePreviewMock = vi.fn();
const conversationGetMock = vi.fn();
const syncTitleFromHistoryMock = vi.fn();
let listChangedHandler:
  | ((event: { conversationId: string; action: 'created' | 'updated' | 'deleted' }) => void)
  | undefined;

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      get: {
        invoke: (...args: unknown[]) => conversationGetMock(...args),
      },
      listChanged: {
        on: (handler: typeof listChangedHandler) => {
          listChangedHandler = handler;
          return vi.fn();
        },
      },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: () => 'New Chat',
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: 'conv-1' }),
  };
});

vi.mock('@/renderer/hooks/chat/useAutoTitle', () => ({
  useAutoTitle: () => ({
    syncTitleFromHistory: syncTitleFromHistoryMock,
  }),
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({
    closePreview: closePreviewMock,
  }),
}));

vi.mock('@/renderer/pages/conversation/hooks/ConversationTabsContext', () => ({
  useConversationTabs: () => ({
    openTab: openTabMock,
  }),
}));

vi.mock('@/renderer/pages/conversation/components/ChatConversation', () => ({
  __esModule: true,
  default: ({ conversation }: { conversation?: { name?: string } }) => (
    <div>{conversation?.name ?? 'missing conversation'}</div>
  ),
}));

describe('ChatConversationIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listChangedHandler = undefined;
  });

  const renderPage = () =>
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <ChatConversationIndex />
      </SWRConfig>
    );

  it('revalidates the active conversation after an update event', async () => {
    conversationGetMock
      .mockResolvedValueOnce({ id: 'conv-1', name: 'New Chat' })
      .mockResolvedValueOnce({ id: 'conv-1', name: 'Discuss roadmap' });

    renderPage();

    expect(await screen.findByText('New Chat')).toBeInTheDocument();
    expect(syncTitleFromHistoryMock).toHaveBeenCalledWith('conv-1');

    act(() => {
      listChangedHandler?.({ conversationId: 'conv-1', action: 'updated' });
    });

    await waitFor(() => {
      expect(conversationGetMock).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText('Discuss roadmap')).toBeInTheDocument();
    expect(openTabMock).toHaveBeenCalledWith(expect.objectContaining({ id: 'conv-1', name: 'Discuss roadmap' }));
  });

  it('ignores update events for other conversations', async () => {
    conversationGetMock.mockResolvedValueOnce({ id: 'conv-1', name: 'New Chat' });

    renderPage();

    expect(await screen.findByText('New Chat')).toBeInTheDocument();

    act(() => {
      listChangedHandler?.({ conversationId: 'conv-2', action: 'updated' });
    });

    await waitFor(() => {
      expect(conversationGetMock).toHaveBeenCalledTimes(1);
    });
  });
});
