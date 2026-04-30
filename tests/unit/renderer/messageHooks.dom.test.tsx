import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MessageListProvider,
  useAddOrUpdateMessage,
  useMessageList,
  useMessageLstCache,
  useReloadMessageListFromDatabase,
  useRemoveMessageByMsgId,
} from '@/renderer/pages/conversation/Messages/hooks';

const mockGetConversationMessagesInvoke = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    database: {
      getConversationMessages: {
        invoke: (...args: unknown[]) => mockGetConversationMessagesInvoke(...args),
      },
    },
  },
}));

type TestMessage = {
  id: string;
  msg_id?: string;
  conversation_id: string;
  type: string;
  position?: string;
  content: {
    content: string;
  };
  createdAt?: number;
};

const CacheProbe = ({ conversationId }: { conversationId: string }) => {
  const cacheState = useMessageLstCache(conversationId);
  const messages = useMessageList();
  return (
    <>
      <pre data-testid='messages'>{JSON.stringify(messages)}</pre>
      <pre data-testid='cache-state'>{JSON.stringify(cacheState)}</pre>
    </>
  );
};

const CacheRetryProbe = ({ conversationId }: { conversationId: string }) => {
  const cacheState = useMessageLstCache(conversationId);
  const messages = useMessageList();
  return (
    <>
      <button type='button' onClick={() => void cacheState.reload().catch(() => {})}>
        retry-cache
      </button>
      <pre data-testid='messages'>{JSON.stringify(messages)}</pre>
      <pre data-testid='cache-state'>{JSON.stringify(cacheState)}</pre>
      <div data-testid='cache-error'>{cacheState.error?.message ?? ''}</div>
    </>
  );
};

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const MutationProbe = ({ conversationId = 'conv-1' }: { conversationId?: string }) => {
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const removeMessageByMsgId = useRemoveMessageByMsgId();
  const reloadMessageListFromDatabase = useReloadMessageListFromDatabase(conversationId);
  const messages = useMessageList();

  return (
    <div>
      <button
        type='button'
        onClick={() =>
          addOrUpdateMessage(
            {
              id: 'msg-1',
              msg_id: 'msg-1',
              conversation_id: conversationId,
              type: 'text',
              position: 'right',
              content: { content: 'queued message' },
            },
            true
          )
        }
      >
        add-message
      </button>
      <button type='button' onClick={() => removeMessageByMsgId('msg-1')}>
        remove-message
      </button>
      <button type='button' onClick={() => void reloadMessageListFromDatabase()}>
        reload-messages
      </button>
      <pre data-testid='mutated-messages'>{JSON.stringify(messages)}</pre>
    </div>
  );
};

describe('message hooks cache merge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('keeps same-conversation streaming messages while filtering out messages from the previous conversation', async () => {
    const dbMessages: TestMessage[] = [
      {
        id: 'db-1',
        msg_id: 'db-1',
        conversation_id: 'conv-1',
        type: 'text',
        content: { content: 'from db' },
      },
    ];

    mockGetConversationMessagesInvoke.mockResolvedValue(dbMessages);

    const initialMessages: TestMessage[] = [
      {
        id: 'stream-1',
        msg_id: 'stream-1',
        conversation_id: 'conv-1',
        type: 'text',
        content: { content: 'streaming current conversation' },
      },
      {
        id: 'stream-2',
        msg_id: 'stream-2',
        conversation_id: 'conv-2',
        type: 'text',
        content: { content: 'streaming stale conversation' },
      },
    ];

    render(
      <MessageListProvider value={initialMessages}>
        <CacheProbe conversationId='conv-1' />
      </MessageListProvider>
    );

    await waitFor(() => {
      const content = screen.getByTestId('messages').textContent;
      expect(content).toContain('db-1');
      expect(content).toContain('stream-1');
    });

    const merged = JSON.parse(screen.getByTestId('messages').textContent ?? '[]') as TestMessage[];

    expect(merged.map((message) => message.id)).toEqual(['db-1', 'stream-1']);
  });

  it('sets an error state and recovers with retry when history loading fails', async () => {
    mockGetConversationMessagesInvoke.mockRejectedValueOnce(new Error('history failed')).mockResolvedValueOnce([
      {
        id: 'retry-1',
        msg_id: 'retry-1',
        conversation_id: 'conv-retry',
        type: 'text',
        content: { content: 'loaded after retry' },
      },
    ]);

    render(
      <MessageListProvider value={[]}>
        <CacheRetryProbe conversationId='conv-retry' />
      </MessageListProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('cache-error').textContent).toBe('history failed');
      expect(screen.getByTestId('cache-state').textContent).toContain('"isLoading":false');
    });

    fireEvent.click(screen.getByRole('button', { name: 'retry-cache' }));

    await waitFor(() => {
      expect(screen.getByTestId('messages').textContent).toContain('loaded after retry');
      expect(screen.getByTestId('cache-error').textContent).toBe('');
    });
  });

  it('retries a failed empty history load when the window regains focus', async () => {
    mockGetConversationMessagesInvoke
      .mockRejectedValueOnce(new Error('temporary network failure'))
      .mockResolvedValueOnce([
        {
          id: 'focus-retry-1',
          msg_id: 'focus-retry-1',
          conversation_id: 'conv-focus-retry',
          type: 'text',
          content: { content: 'loaded after focus' },
        },
      ]);

    render(
      <MessageListProvider value={[]}>
        <CacheRetryProbe conversationId='conv-focus-retry' />
      </MessageListProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('cache-error').textContent).toBe('temporary network failure');
    });

    window.dispatchEvent(new Event('focus'));

    await waitFor(() => {
      expect(screen.getByTestId('messages').textContent).toContain('loaded after focus');
      expect(screen.getByTestId('cache-error').textContent).toBe('');
    });
    expect(mockGetConversationMessagesInvoke).toHaveBeenCalledTimes(2);
  });

  it('reports loading while conversation history is still pending', async () => {
    const deferred = createDeferred<TestMessage[]>();
    mockGetConversationMessagesInvoke.mockReturnValue(deferred.promise);

    render(
      <MessageListProvider value={[]}>
        <CacheProbe conversationId='conv-loading' />
      </MessageListProvider>
    );

    expect(screen.getByTestId('cache-state').textContent).toContain('"isLoading":true');
    expect(screen.getByTestId('messages').textContent).toBe('[]');

    deferred.resolve([
      {
        id: 'db-loading-1',
        msg_id: 'db-loading-1',
        conversation_id: 'conv-loading',
        type: 'text',
        content: { content: 'loaded after delay' },
      },
    ]);

    await waitFor(() => {
      expect(screen.getByTestId('messages').textContent).toContain('loaded after delay');
      expect(screen.getByTestId('cache-state').textContent).toContain('"isLoading":false');
    });
  });

  it('logs history load payload size when message load debug is enabled', async () => {
    localStorage.setItem('aionui:message-load-debug', '1');
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const dbMessages: TestMessage[] = [
      {
        id: 'db-debug-1',
        msg_id: 'db-debug-1',
        conversation_id: 'conv-debug',
        type: 'text',
        content: { content: 'debug payload' },
      },
    ];
    const payloadBytes = new TextEncoder().encode(JSON.stringify(dbMessages)).length;
    mockGetConversationMessagesInvoke.mockResolvedValueOnce(dbMessages);

    render(
      <MessageListProvider value={[]}>
        <CacheProbe conversationId='conv-debug' />
      </MessageListProvider>
    );

    await waitFor(() => {
      expect(info).toHaveBeenCalledWith('[MessageLoad] conversation history loaded', {
        conversationId: 'conv-debug',
        cached: false,
        partial: false,
        messages: 1,
        payloadBytes,
        dbMs: expect.any(Number),
        totalMs: expect.any(Number),
      });
    });
    info.mockRestore();
  });

  it('ignores stale history responses after switching conversations', async () => {
    const firstConversation = createDeferred<TestMessage[]>();
    const secondConversation = createDeferred<TestMessage[]>();
    mockGetConversationMessagesInvoke
      .mockReturnValueOnce(firstConversation.promise)
      .mockReturnValueOnce(secondConversation.promise);

    const view = render(
      <MessageListProvider value={[]}>
        <CacheProbe conversationId='conv-race-a' />
      </MessageListProvider>
    );

    view.rerender(
      <MessageListProvider value={[]}>
        <CacheProbe conversationId='conv-race-b' />
      </MessageListProvider>
    );

    secondConversation.resolve([
      {
        id: 'race-b-1',
        msg_id: 'race-b-1',
        conversation_id: 'conv-race-b',
        type: 'text',
        content: { content: 'current conversation history' },
      },
    ]);

    await waitFor(() => {
      expect(screen.getByTestId('messages').textContent).toContain('current conversation history');
    });

    firstConversation.resolve([
      {
        id: 'race-a-1',
        msg_id: 'race-a-1',
        conversation_id: 'conv-race-a',
        type: 'text',
        content: { content: 'stale conversation history' },
      },
    ]);

    await waitFor(() => {
      const content = screen.getByTestId('messages').textContent ?? '';
      expect(content).toContain('current conversation history');
      expect(content).not.toContain('stale conversation history');
    });
  });

  it('loads the latest page first before refreshing long conversation history', async () => {
    const latestDescMessages: TestMessage[] = Array.from({ length: 301 }, (_, index) => ({
      id: `latest-${301 - index}`,
      msg_id: `latest-${301 - index}`,
      conversation_id: 'conv-long',
      type: 'text',
      content: { content: `latest ${301 - index}` },
    }));
    const fullDeferred = createDeferred<TestMessage[]>();
    mockGetConversationMessagesInvoke
      .mockResolvedValueOnce(latestDescMessages)
      .mockReturnValueOnce(fullDeferred.promise);

    render(
      <MessageListProvider value={[]}>
        <CacheProbe conversationId='conv-long' />
      </MessageListProvider>
    );

    await waitFor(() => {
      const messages = JSON.parse(screen.getByTestId('messages').textContent ?? '[]') as TestMessage[];
      expect(messages).toHaveLength(300);
      expect(messages[0].id).toBe('latest-2');
      expect(messages[299].id).toBe('latest-301');
      expect(screen.getByTestId('cache-state').textContent).toContain('"isRefreshing":true');
    });
    expect(mockGetConversationMessagesInvoke).toHaveBeenNthCalledWith(1, {
      conversation_id: 'conv-long',
      page: 0,
      pageSize: 301,
      order: 'DESC',
    });
    expect(mockGetConversationMessagesInvoke).toHaveBeenNthCalledWith(2, {
      conversation_id: 'conv-long',
      page: 0,
      pageSize: 10000,
      order: 'ASC',
    });

    fullDeferred.resolve([
      ...latestDescMessages.slice().reverse(),
      {
        id: 'older-1',
        msg_id: 'older-1',
        conversation_id: 'conv-long',
        type: 'text',
        content: { content: 'older message' },
      },
    ]);

    await waitFor(() => {
      expect(screen.getByTestId('messages').textContent).toContain('older message');
      expect(screen.getByTestId('cache-state').textContent).toContain('"isRefreshing":false');
    });
  });

  it('does not start a full refresh when the latest page contains the entire conversation', async () => {
    const shortMessages: TestMessage[] = [
      {
        id: 'short-2',
        msg_id: 'short-2',
        conversation_id: 'conv-short',
        type: 'text',
        content: { content: 'second short message' },
      },
      {
        id: 'short-1',
        msg_id: 'short-1',
        conversation_id: 'conv-short',
        type: 'text',
        content: { content: 'first short message' },
      },
    ];
    mockGetConversationMessagesInvoke.mockResolvedValueOnce(shortMessages);

    render(
      <MessageListProvider value={[]}>
        <CacheProbe conversationId='conv-short' />
      </MessageListProvider>
    );

    await waitFor(() => {
      const messages = JSON.parse(screen.getByTestId('messages').textContent ?? '[]') as TestMessage[];
      expect(messages.map((message) => message.id)).toEqual(['short-1', 'short-2']);
      expect(screen.getByTestId('cache-state').textContent).toContain('"isRefreshing":false');
    });
    expect(mockGetConversationMessagesInvoke).toHaveBeenCalledTimes(1);
    expect(mockGetConversationMessagesInvoke).toHaveBeenCalledWith({
      conversation_id: 'conv-short',
      page: 0,
      pageSize: 301,
      order: 'DESC',
    });
  });

  it('shows cached conversation messages immediately while refreshing in the background', async () => {
    mockGetConversationMessagesInvoke.mockResolvedValueOnce([
      {
        id: 'db-cached-1',
        msg_id: 'db-cached-1',
        conversation_id: 'conv-cached',
        type: 'text',
        content: { content: 'cached message' },
      },
    ]);

    const firstRender = render(
      <MessageListProvider value={[]}>
        <CacheProbe conversationId='conv-cached' />
      </MessageListProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('messages').textContent).toContain('cached message');
    });

    firstRender.unmount();

    const deferred = createDeferred<TestMessage[]>();
    mockGetConversationMessagesInvoke.mockReturnValueOnce(deferred.promise);

    render(
      <MessageListProvider value={[]}>
        <CacheProbe conversationId='conv-cached' />
      </MessageListProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('messages').textContent).toContain('cached message');
      expect(screen.getByTestId('cache-state').textContent).toContain('"isRefreshing":true');
    });
    expect(screen.getByTestId('cache-state').textContent).toContain('"isLoading":false');
    expect(mockGetConversationMessagesInvoke).toHaveBeenLastCalledWith({
      conversation_id: 'conv-cached',
      page: 0,
      pageSize: 10000,
      order: 'ASC',
    });

    deferred.resolve([
      {
        id: 'db-cached-2',
        msg_id: 'db-cached-2',
        conversation_id: 'conv-cached',
        type: 'text',
        content: { content: 'refreshed message' },
      },
    ]);

    await waitFor(() => {
      expect(screen.getByTestId('messages').textContent).toContain('refreshed message');
      expect(screen.getByTestId('messages').textContent).not.toContain('cached message');
      expect(screen.getByTestId('cache-state').textContent).toContain('"isRefreshing":false');
    });
  });

  it('restores cached messages immediately when switching back to a conversation', async () => {
    const deferredB = createDeferred<TestMessage[]>();
    const deferredARefresh = createDeferred<TestMessage[]>();
    mockGetConversationMessagesInvoke
      .mockResolvedValueOnce([
        {
          id: 'back-a-1',
          msg_id: 'back-a-1',
          conversation_id: 'conv-back-a',
          type: 'text',
          content: { content: 'cached conversation a' },
        },
      ])
      .mockReturnValueOnce(deferredB.promise)
      .mockReturnValueOnce(deferredARefresh.promise);

    const view = render(
      <MessageListProvider value={[]}>
        <CacheProbe conversationId='conv-back-a' />
      </MessageListProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('messages').textContent).toContain('cached conversation a');
    });

    view.rerender(
      <MessageListProvider value={[]}>
        <CacheProbe conversationId='conv-back-b' />
      </MessageListProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('messages').textContent).toBe('[]');
      expect(screen.getByTestId('cache-state').textContent).toContain('"isLoading":true');
    });

    view.rerender(
      <MessageListProvider value={[]}>
        <CacheProbe conversationId='conv-back-a' />
      </MessageListProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('messages').textContent).toContain('cached conversation a');
      expect(screen.getByTestId('cache-state').textContent).toContain('"isRefreshing":true');
    });
    expect(screen.getByTestId('messages').textContent).not.toContain('refreshed conversation a');
    expect(mockGetConversationMessagesInvoke).toHaveBeenNthCalledWith(1, {
      conversation_id: 'conv-back-a',
      page: 0,
      pageSize: 301,
      order: 'DESC',
    });
    expect(mockGetConversationMessagesInvoke).toHaveBeenNthCalledWith(2, {
      conversation_id: 'conv-back-b',
      page: 0,
      pageSize: 301,
      order: 'DESC',
    });
    expect(mockGetConversationMessagesInvoke).toHaveBeenNthCalledWith(3, {
      conversation_id: 'conv-back-a',
      page: 0,
      pageSize: 10000,
      order: 'ASC',
    });

    deferredB.resolve([
      {
        id: 'back-b-1',
        msg_id: 'back-b-1',
        conversation_id: 'conv-back-b',
        type: 'text',
        content: { content: 'stale conversation b' },
      },
    ]);
    deferredARefresh.resolve([
      {
        id: 'back-a-2',
        msg_id: 'back-a-2',
        conversation_id: 'conv-back-a',
        type: 'text',
        content: { content: 'refreshed conversation a' },
      },
    ]);

    await waitFor(() => {
      const content = screen.getByTestId('messages').textContent ?? '';
      expect(content).toContain('refreshed conversation a');
      expect(content).not.toContain('stale conversation b');
    });
  });

  it('keeps locally updated messages in cache for immediate conversation returns', async () => {
    mockGetConversationMessagesInvoke.mockResolvedValueOnce([
      {
        id: 'db-fresh-1',
        msg_id: 'db-fresh-1',
        conversation_id: 'conv-fresh-cache',
        type: 'text',
        content: { content: 'cached before local update' },
      },
    ]);

    const firstRender = render(
      <MessageListProvider value={[]}>
        <CacheProbe conversationId='conv-fresh-cache' />
      </MessageListProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('messages').textContent).toContain('cached before local update');
    });

    firstRender.unmount();

    const mutationRender = render(
      <MessageListProvider
        value={[
          {
            id: 'db-fresh-1',
            msg_id: 'db-fresh-1',
            conversation_id: 'conv-fresh-cache',
            type: 'text',
            content: { content: 'cached before local update' },
          },
        ]}
      >
        <MutationProbe conversationId='conv-fresh-cache' />
      </MessageListProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'add-message' }));

    await waitFor(() => {
      expect(screen.getByTestId('mutated-messages').textContent).toContain('queued message');
    });

    mutationRender.unmount();

    const deferred = createDeferred<TestMessage[]>();
    mockGetConversationMessagesInvoke.mockReturnValueOnce(deferred.promise);

    render(
      <MessageListProvider value={[]}>
        <CacheProbe conversationId='conv-fresh-cache' />
      </MessageListProvider>
    );

    await waitFor(() => {
      const content = screen.getByTestId('messages').textContent ?? '';
      expect(content).toContain('cached before local update');
      expect(content).toContain('queued message');
      expect(screen.getByTestId('cache-state').textContent).toContain('"isRefreshing":true');
    });
  });

  it('adds optimistic messages and removes them by msg id', async () => {
    mockGetConversationMessagesInvoke.mockResolvedValue([]);

    render(
      <MessageListProvider value={[]}>
        <MutationProbe />
      </MessageListProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'add-message' }));

    await waitFor(() => {
      expect(screen.getByTestId('mutated-messages').textContent).toContain('msg-1');
    });

    fireEvent.click(screen.getByRole('button', { name: 'remove-message' }));

    await waitFor(() => {
      expect(screen.getByTestId('mutated-messages').textContent).not.toContain('msg-1');
    });
  });

  it('replaces the local list when reloading messages from the database', async () => {
    mockGetConversationMessagesInvoke.mockResolvedValue([
      {
        id: 'db-2',
        msg_id: 'db-2',
        conversation_id: 'conv-1',
        type: 'text',
        position: 'right',
        content: { content: 'database replacement' },
      },
    ]);

    render(
      <MessageListProvider value={[]}>
        <MutationProbe />
      </MessageListProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'add-message' }));

    await waitFor(() => {
      expect(screen.getByTestId('mutated-messages').textContent).toContain('queued message');
    });

    fireEvent.click(screen.getByRole('button', { name: 'reload-messages' }));

    await waitFor(() => {
      const content = screen.getByTestId('mutated-messages').textContent ?? '';
      expect(content).toContain('database replacement');
      expect(content).not.toContain('queued message');
    });
  });
});
