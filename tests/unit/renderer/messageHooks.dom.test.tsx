import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MessageListProvider,
  useAddOrUpdateMessage,
  useMessageList,
  useMessageLstCache,
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
    replace?: boolean;
  };
  created_at?: number;
};

const CacheProbe = ({ conversation_id }: { conversation_id: string }) => {
  useMessageLstCache(conversation_id);
  const messages = useMessageList();
  return <pre data-testid='messages'>{JSON.stringify(messages)}</pre>;
};

const MutationProbe = () => {
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const removeMessageByMsgId = useRemoveMessageByMsgId();
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
              conversation_id: 'conv-1',
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
      <button
        type='button'
        onClick={() =>
          addOrUpdateMessage({
            id: 'stream-1',
            msg_id: 'stream-1',
            conversation_id: 'conv-1',
            type: 'text',
            position: 'left',
            content: { content: 'draft [CRON_CREATE]' },
          })
        }
      >
        add-stream-start
      </button>
      <button
        type='button'
        onClick={() =>
          addOrUpdateMessage({
            id: 'stream-append',
            msg_id: 'stream-1',
            conversation_id: 'conv-1',
            type: 'text',
            position: 'left',
            content: { content: ' tail' },
          })
        }
      >
        add-stream-append
      </button>
      <button
        type='button'
        onClick={() =>
          addOrUpdateMessage({
            id: 'stream-replace',
            msg_id: 'stream-1',
            conversation_id: 'conv-1',
            type: 'text',
            position: 'left',
            content: { content: 'clean final', replace: true },
          })
        }
      >
        add-stream-replace
      </button>
      <button type='button' onClick={() => removeMessageByMsgId('msg-1')}>
        remove-message
      </button>
      <pre data-testid='mutated-messages'>{JSON.stringify(messages)}</pre>
    </div>
  );
};

describe('message hooks cache merge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    mockGetConversationMessagesInvoke.mockResolvedValue({ items: dbMessages });

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
        <CacheProbe conversation_id='conv-1' />
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

  it('adds optimistic messages and removes them by msg id', async () => {
    mockGetConversationMessagesInvoke.mockResolvedValue({ items: [] });

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

  it('appends streamed text by default and replaces it when replacement is signaled', async () => {
    mockGetConversationMessagesInvoke.mockResolvedValue({ items: [] });

    render(
      <MessageListProvider value={[]}>
        <MutationProbe />
      </MessageListProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'add-stream-start' }));
    fireEvent.click(screen.getByRole('button', { name: 'add-stream-append' }));

    await waitFor(() => {
      expect(screen.getByTestId('mutated-messages').textContent).toContain('draft [CRON_CREATE] tail');
    });

    fireEvent.click(screen.getByRole('button', { name: 'add-stream-replace' }));

    await waitFor(() => {
      const messages = JSON.parse(screen.getByTestId('mutated-messages').textContent ?? '[]') as TestMessage[];
      const streamMessage = messages.find((message) => message.msg_id === 'stream-1');
      expect(streamMessage?.content.content).toBe('clean final');
      expect(streamMessage?.content.replace).toBe(true);
    });
  });

  it('prefers replacement-signaled hydrated text over a longer dirty streaming version', async () => {
    const dbMessages: TestMessage[] = [
      {
        id: 'db-1',
        msg_id: 'shared-msg',
        conversation_id: 'conv-1',
        type: 'text',
        content: { content: 'clean final', replace: true },
      },
    ];

    mockGetConversationMessagesInvoke.mockResolvedValue({ items: dbMessages });

    const initialMessages: TestMessage[] = [
      {
        id: 'stream-1',
        msg_id: 'shared-msg',
        conversation_id: 'conv-1',
        type: 'text',
        content: { content: 'dirty [CRON_CREATE] instructions that should lose by length alone' },
      },
    ];

    render(
      <MessageListProvider value={initialMessages}>
        <CacheProbe conversation_id='conv-1' />
      </MessageListProvider>
    );

    await waitFor(() => {
      const messages = JSON.parse(screen.getByTestId('messages').textContent ?? '[]') as TestMessage[];
      expect(messages).toHaveLength(1);
      expect(messages[0]?.content.content).toBe('clean final');
      expect(messages[0]?.content.replace).toBe(true);
    });
  });
});
