/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * `beforeUpdateMessageList` interceptors used to live in one module-level array
 * that every live-message flush drained. With two conversation views mounted at
 * once, an interceptor registered for one conversation would rewrite whichever
 * conversation's list flushed first. They are keyed by conversation id now; this
 * test mounts both conversations and proves the interceptor only ever sees its
 * own list.
 */

import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TMessage } from '@/common/chat/chatLib';
import {
  beforeUpdateMessageList,
  MessageListProvider,
  useMergeLiveMessage,
  useMessageList,
} from '@/renderer/pages/conversation/Messages/hooks';

afterEach(() => {
  cleanup();
});

const textMessage = (conversation_id: string, msg_id: string): TMessage =>
  ({
    id: msg_id,
    msg_id,
    conversation_id,
    type: 'text',
    position: 'left',
    content: { content: msg_id },
  }) as unknown as TMessage;

/** One conversation view: merges live messages and reports its own list. */
const ConversationMessages: React.FC<{
  conversation_id: string;
  register: (merge: (message: TMessage, add?: boolean) => void, list: TMessage[]) => void;
}> = ({ conversation_id, register }) => {
  const merge = useMergeLiveMessage(conversation_id);
  const list = useMessageList();
  register(merge, list);
  return null;
};

type View = {
  merge: (message: TMessage, add?: boolean) => void;
  list: () => TMessage[];
};

const renderTwoConversations = (): { a: View; b: View } => {
  const latest: Record<string, { merge: View['merge']; list: TMessage[] }> = {};
  const capture = (id: string) => (merge: View['merge'], list: TMessage[]) => {
    latest[id] = { merge, list };
  };

  render(
    <>
      <MessageListProvider value={[]}>
        <ConversationMessages conversation_id='conv-a' register={capture('conv-a')} />
      </MessageListProvider>
      <MessageListProvider value={[]}>
        <ConversationMessages conversation_id='conv-b' register={capture('conv-b')} />
      </MessageListProvider>
    </>
  );

  return {
    a: { merge: (m, add) => latest['conv-a'].merge(m, add), list: () => latest['conv-a'].list },
    b: { merge: (m, add) => latest['conv-b'].merge(m, add), list: () => latest['conv-b'].list },
  };
};

/** Push a message and let the merger's scheduled flush run. */
const flush = async (push: () => void): Promise<void> => {
  await act(async () => {
    push();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

describe('beforeUpdateMessageList isolation', () => {
  it('runs an interceptor only for the conversation it was registered on', async () => {
    const { a, b } = renderTwoConversations();
    const interceptor = vi.fn((list: TMessage[]) => list);
    beforeUpdateMessageList('conv-a', interceptor);

    await flush(() => b.merge(textMessage('conv-b', 'b-1'), true));
    expect(interceptor).not.toHaveBeenCalled();

    await flush(() => a.merge(textMessage('conv-a', 'a-1'), true));
    expect(interceptor).toHaveBeenCalledTimes(1);
  });

  it('rewrites only its own conversation list', async () => {
    const { a, b } = renderTwoConversations();
    beforeUpdateMessageList('conv-a', () => []);

    await flush(() => b.merge(textMessage('conv-b', 'b-1'), true));
    await flush(() => a.merge(textMessage('conv-a', 'a-1'), true));

    expect(a.list()).toHaveLength(0); // rewritten away by its own interceptor
    expect(b.list()).toHaveLength(1); // untouched
  });

  it('stops running an interceptor that unregistered before the flush', async () => {
    const { a } = renderTwoConversations();
    const interceptor = vi.fn((list: TMessage[]) => list);
    const off = beforeUpdateMessageList('conv-a', interceptor);
    off();

    await flush(() => a.merge(textMessage('conv-a', 'a-1'), true));
    expect(interceptor).not.toHaveBeenCalled();
  });
});
