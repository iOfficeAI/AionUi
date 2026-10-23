/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TMessage } from '@/common/chat/chatLib';
import {
  MessageListLoadingProvider,
  MessageListProvider,
  MessagePaginationProvider,
  prefetchConversationMessages,
  useMessageList,
  useMessageListLoading,
  useMessageLstCache,
} from '@/renderer/pages/conversation/Messages/hooks';
import { emitter } from '@/renderer/utils/emitter';

const { loadLatestConversationMessagesMock } = vi.hoisted(() => ({
  loadLatestConversationMessagesMock: vi.fn(),
}));

vi.mock('@/renderer/utils/chat/messagePagination', () => ({
  DEFAULT_MESSAGE_PAGE_LIMIT: 50,
  loadLatestConversationMessages: (...args: unknown[]) => loadLatestConversationMessagesMock(...args),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      userCreated: { on: vi.fn(() => vi.fn()) },
      statusChanged: { on: vi.fn(() => vi.fn()) },
      turnCompleted: { on: vi.fn(() => vi.fn()) },
    },
  },
}));

const Probe: React.FC<{ conversationId: string }> = ({ conversationId }) => {
  useMessageLstCache(conversationId);
  const messages = useMessageList();
  const loading = useMessageListLoading();

  return (
    <div>
      <div data-testid='is-loading'>{String(loading)}</div>
      <div data-testid='message-count'>{messages.length}</div>
      <div data-testid='first-message-id'>{messages[0]?.id ?? ''}</div>
    </div>
  );
};

const renderProbe = (conversationId: string) =>
  render(
    <MessagePaginationProvider>
      <MessageListLoadingProvider>
        <MessageListProvider>
          <Probe conversationId={conversationId} />
        </MessageListProvider>
      </MessageListLoadingProvider>
    </MessagePaginationProvider>
  );

describe('useMessageLstCache instant rehydration & memory caching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('populates messages on initial load and caches them in memory', async () => {
    const mockMessages: TMessage[] = [
      { id: 'msg-1', msg_id: 'msg-1', conversation_id: 'conv-cache-1', type: 'text', content: { content: 'hello' } },
    ];
    loadLatestConversationMessagesMock.mockResolvedValueOnce({
      items: mockMessages,
      has_more_before: false,
      has_more_after: false,
    });

    const { unmount } = renderProbe('conv-cache-1');

    await waitFor(() => {
      expect(screen.getByTestId('message-count')).toHaveTextContent('1');
    });
    expect(screen.getByTestId('first-message-id')).toHaveTextContent('msg-1');
    expect(screen.getByTestId('is-loading')).toHaveTextContent('false');

    unmount();

    // Now re-render with the same conversation ID: it must immediately show cached messages with loading = false
    loadLatestConversationMessagesMock.mockResolvedValueOnce({
      items: mockMessages,
      has_more_before: false,
      has_more_after: false,
    });

    await act(async () => {
      renderProbe('conv-cache-1');
    });

    // On initial mount with cached data, loading is immediately false and message is already present
    expect(screen.getByTestId('first-message-id')).toHaveTextContent('msg-1');
    expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
  });

  it('evicts cached messages when conversation.messages.clear is emitted', async () => {
    const mockMessages: TMessage[] = [
      { id: 'msg-2', msg_id: 'msg-2', conversation_id: 'conv-cache-2', type: 'text', content: { content: 'test' } },
    ];
    loadLatestConversationMessagesMock.mockResolvedValueOnce({
      items: mockMessages,
      has_more_before: false,
      has_more_after: false,
    });

    const { unmount } = renderProbe('conv-cache-2');
    await waitFor(() => {
      expect(screen.getByTestId('message-count')).toHaveTextContent('1');
    });

    act(() => {
      emitter.emit('conversation.messages.clear', 'conv-cache-2');
    });

    unmount();

    // Re-mount: since it was evicted, it should start with loading = true
    loadLatestConversationMessagesMock.mockReturnValue(new Promise(() => {})); // pending
    renderProbe('conv-cache-2');

    expect(screen.getByTestId('is-loading')).toHaveTextContent('true');
    expect(screen.getByTestId('message-count')).toHaveTextContent('0');
  });

  it('pre-warms the memory cache so initial mount is immediately loaded and non-blocking', async () => {
    const prefetchedMessages: TMessage[] = [
      {
        id: 'pre-1',
        msg_id: 'pre-1',
        conversation_id: 'conv-prefetch-1',
        type: 'text',
        content: { content: 'hello prefetch' },
      },
    ];
    loadLatestConversationMessagesMock.mockResolvedValueOnce({
      items: prefetchedMessages,
      has_more_before: false,
      has_more_after: false,
    });

    // Call prefetch before mounting the component
    await prefetchConversationMessages('conv-prefetch-1');

    // Prevent any network response from resolving to prove it came from prefetch cache
    loadLatestConversationMessagesMock.mockReturnValue(new Promise(() => {}));

    renderProbe('conv-prefetch-1');

    // Data is already there immediately on mount without loading spinner
    expect(screen.getByTestId('is-loading')).toHaveTextContent('false');
    expect(screen.getByTestId('message-count')).toHaveTextContent('1');
    expect(screen.getByTestId('first-message-id')).toHaveTextContent('pre-1');
  });
});
