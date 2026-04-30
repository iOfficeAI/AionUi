import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { TMessage } from '@/common/chat/chatLib';
import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';
import MessageList from '@/renderer/pages/conversation/Messages/MessageList';
import { MessageListProvider } from '@/renderer/pages/conversation/Messages/hooks';

const autoScrollMock = vi.hoisted(() => ({
  showScrollButton: false,
  scrollToBottom: vi.fn(),
  hideScrollButton: vi.fn(),
  scrollToIndex: vi.fn(),
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Button: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => (
      <button type='button' onClick={onClick}>
        {children}
      </button>
    ),
    Image: {
      ...actual.Image,
      PreviewGroup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    },
  };
});

vi.mock('react-virtuoso', () => ({
  Virtuoso: ({
    data,
    itemContent,
    rangeChanged,
  }: {
    data: unknown[];
    itemContent: (index: number, item: unknown) => React.ReactNode;
    rangeChanged?: (range: { startIndex: number; endIndex: number }) => void;
  }) => {
    React.useEffect(() => {
      rangeChanged?.({ startIndex: 0, endIndex: Math.max(0, data.length - 1) });
    }, [data.length, rangeChanged]);
    return <div data-testid='virtuoso'>{data.map((item, index) => itemContent(index, item))}</div>;
  },
}));

vi.mock('@icon-park/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@icon-park/react')>();
  return {
    ...actual,
    Down: () => <span>Down</span>,
  };
});

vi.mock('@/renderer/hooks/file/useAutoPreviewOfficeFiles', () => ({
  useAutoPreviewOfficeFiles: vi.fn(),
}));

vi.mock('@/renderer/pages/conversation/Messages/useAutoScroll', () => ({
  useAutoScroll: () => ({
    handleScrollerRef: vi.fn(),
    handleScroll: vi.fn(),
    handleAtBottomStateChange: vi.fn(),
    handleFollowOutput: vi.fn(),
    virtuosoRef: { current: { scrollToIndex: autoScrollMock.scrollToIndex } },
    showScrollButton: autoScrollMock.showScrollButton,
    scrollToBottom: autoScrollMock.scrollToBottom,
    hideScrollButton: autoScrollMock.hideScrollButton,
  }),
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageText', () => ({
  default: ({ message }: { message: { content: { content: string } } }) => <div>{message.content.content}</div>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

const renderMessageList = (ui: React.ReactElement, messages: TMessage[] = []) =>
  render(
    <MemoryRouter>
      <ConversationProvider value={{ conversationId: 'conv-1', type: 'acp' }}>
        <MessageListProvider value={messages}>{ui}</MessageListProvider>
      </ConversationProvider>
    </MemoryRouter>
  );

afterEach(() => {
  vi.restoreAllMocks();
  autoScrollMock.showScrollButton = false;
  autoScrollMock.scrollToBottom.mockClear();
  autoScrollMock.hideScrollButton.mockClear();
  autoScrollMock.scrollToIndex.mockClear();
  localStorage.clear();
});

describe('MessageList loading state', () => {
  it('renders a visible loading placeholder instead of an empty pane', () => {
    renderMessageList(<MessageList isLoading />);

    expect(screen.getByTestId('message-list-loading')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Loading conversation history…')).toBeInTheDocument();
    expect(screen.queryByTestId('virtuoso')).not.toBeInTheDocument();
  });

  it('renders a subtle refreshing indicator over cached messages', () => {
    renderMessageList(<MessageList isRefreshing />, [
      {
        id: 'msg-refreshing-1',
        msg_id: 'msg-refreshing-1',
        conversation_id: 'conv-1',
        type: 'text',
        position: 'left',
        content: { content: 'cached while refreshing' },
      } as TMessage,
    ]);

    expect(screen.getByTestId('virtuoso')).toHaveTextContent('cached while refreshing');
    expect(screen.getByTestId('message-list-refreshing')).toHaveTextContent('Refreshing history…');
    expect(screen.getByTestId('message-list-refreshing')).toHaveAttribute('role', 'status');
  });

  it('uses an accessible button for scrolling back to the latest message', () => {
    autoScrollMock.showScrollButton = true;
    renderMessageList(<MessageList />, [
      {
        id: 'msg-scroll-1',
        msg_id: 'msg-scroll-1',
        conversation_id: 'conv-1',
        type: 'text',
        position: 'left',
        content: { content: 'older visible message' },
      } as TMessage,
    ]);

    const button = screen.getByRole('button', { name: 'Scroll to bottom' });
    fireEvent.click(button);

    expect(autoScrollMock.hideScrollButton).toHaveBeenCalledTimes(1);
    expect(autoScrollMock.scrollToBottom).toHaveBeenCalledWith('smooth');
  });

  it('renders a message navigation rail with jump targets', () => {
    renderMessageList(<MessageList />, [
      {
        id: 'msg-rail-1',
        msg_id: 'msg-rail-1',
        conversation_id: 'conv-1',
        type: 'text',
        position: 'left',
        content: { content: 'first visible message' },
      } as TMessage,
      {
        id: 'msg-rail-2',
        msg_id: 'msg-rail-2',
        conversation_id: 'conv-1',
        type: 'text',
        position: 'right',
        content: { content: 'second visible message' },
      } as TMessage,
      {
        id: 'msg-rail-3',
        msg_id: 'msg-rail-3',
        conversation_id: 'conv-1',
        type: 'text',
        position: 'left',
        content: { content: 'third visible message' },
      } as TMessage,
    ]);

    expect(screen.getByTestId('message-navigation-rail')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Jump to message 2: second visible message' }));

    expect(autoScrollMock.hideScrollButton).toHaveBeenCalledTimes(1);
    expect(autoScrollMock.scrollToIndex).toHaveBeenCalledWith({
      index: 1,
      align: 'center',
      behavior: 'smooth',
    });
  });

  it('renders an error state with retry when history loading fails', () => {
    const retry = vi.fn();
    renderMessageList(<MessageList loadingError={new Error('network timeout')} onRetryLoad={retry} />);

    expect(screen.getByTestId('message-list-error')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Could not load conversation history')).toBeInTheDocument();
    expect(screen.getByText('network timeout')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('logs render timing diagnostics when message render debug is enabled', async () => {
    localStorage.setItem('aionui:message-render-debug', '1');
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});

    renderMessageList(<MessageList />, [
      {
        id: 'msg-1',
        msg_id: 'msg-1',
        conversation_id: 'conv-1',
        type: 'text',
        position: 'left',
        content: { content: 'rendered message' },
      } as TMessage,
    ]);

    await waitFor(() => {
      expect(info).toHaveBeenCalledWith('[MessageRender] conversation messages rendered', {
        conversationId: 'conv-1',
        rawMessages: 1,
        renderedItems: 1,
        processMs: expect.any(Number),
        renderReadyMs: expect.any(Number),
        totalMs: expect.any(Number),
      });
    });
  });
});
