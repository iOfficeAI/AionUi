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
  };
  createdAt?: number;
};

const CacheProbe = ({ conversationId }: { conversationId: string }) => {
  useMessageLstCache(conversationId);
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
      <button type='button' onClick={() => removeMessageByMsgId('msg-1')}>
        remove-message
      </button>
      <pre data-testid='mutated-messages'>{JSON.stringify(messages)}</pre>
    </div>
  );
};

const TranscriptProbe = () => {
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const messages = useMessageList();

  return (
    <div>
      <button
        type='button'
        onClick={() => {
          addOrUpdateMessage({
            id: 'transcript-1',
            msg_id: 'agent-message-1',
            conversation_id: 'conv-1',
            type: 'codex_agent_transcript',
            position: 'left',
            content: {
              callId: 'wait-call-1',
              threadId: 'worker-thread-1',
              itemId: 'agent-message-1',
              content: 'first ',
            },
          });
          addOrUpdateMessage({
            id: 'transcript-2',
            msg_id: 'agent-message-1',
            conversation_id: 'conv-1',
            type: 'codex_agent_transcript',
            position: 'left',
            content: {
              callId: 'wait-call-1',
              threadId: 'worker-thread-1',
              itemId: 'agent-message-1',
              content: 'second',
            },
          });
        }}
      >
        add-transcript
      </button>
      <pre data-testid='transcript-messages'>{JSON.stringify(messages)}</pre>
    </div>
  );
};

describe('message hooks cache merge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads the latest database page and restores chronological display order', async () => {
    const dbMessages: TestMessage[] = [
      {
        id: 'new-message',
        msg_id: 'new-message',
        conversation_id: 'conv-latest',
        type: 'text',
        content: { content: 'new' },
      },
      {
        id: 'old-message',
        msg_id: 'old-message',
        conversation_id: 'conv-latest',
        type: 'text',
        content: { content: 'old' },
      },
    ];

    mockGetConversationMessagesInvoke.mockResolvedValue(dbMessages);

    render(
      <MessageListProvider value={[]}>
        <CacheProbe conversationId='conv-latest' />
      </MessageListProvider>
    );

    await waitFor(() => {
      expect(mockGetConversationMessagesInvoke).toHaveBeenCalledWith({
        conversation_id: 'conv-latest',
        page: 0,
        pageSize: 10000,
        order: 'DESC',
      });
    });

    await waitFor(() => {
      const merged = JSON.parse(screen.getByTestId('messages').textContent ?? '[]') as TestMessage[];
      expect(merged.map((message) => message.id)).toEqual(['old-message', 'new-message']);
    });
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

  it('accumulates Codex subagent transcript chunks by message id', async () => {
    mockGetConversationMessagesInvoke.mockResolvedValue([]);

    render(
      <MessageListProvider value={[]}>
        <TranscriptProbe />
      </MessageListProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'add-transcript' }));

    await waitFor(() => {
      const messages = JSON.parse(screen.getByTestId('transcript-messages').textContent ?? '[]') as TestMessage[];
      expect(messages).toHaveLength(1);
      expect(messages[0].content.content).toBe('first second');
    });
  });
});
