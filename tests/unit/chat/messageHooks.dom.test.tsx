/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMessageAcpToolCall, TMessage } from '@/common/chat/chatLib';
import {
  MessageListProvider,
  useAddOrUpdateMessage,
  useMessageList,
} from '@/renderer/pages/conversation/Messages/hooks';

const createImageToolCall = (id: string): IMessageAcpToolCall => ({
  id,
  msg_id: id,
  conversation_id: 'conv-1',
  type: 'acp_tool_call',
  content: {
    sessionId: 'sess-1',
    update: {
      sessionUpdate: 'tool_call_update',
      tool_call_id: id,
      status: 'completed',
      title: 'Image generation',
      kind: 'execute',
      rawOutput: {
        saved_path: `/Users/test/.codex/generated_images/session/${id}.png`,
        result: `iVBORw0KGgo${'A'.repeat(128 * 1024)}`,
      },
    },
  },
});

const existingTextMessage: TMessage = {
  id: 'text-1',
  msg_id: 'text-1',
  conversation_id: 'conv-1',
  type: 'text',
  position: 'left',
  content: {
    content: 'hello',
  },
};

const MessageListProbe: React.FC<{ message: TMessage; add?: boolean }> = ({ message, add = false }) => {
  const addOrUpdateMessage = useAddOrUpdateMessage();
  const messages = useMessageList();

  useEffect(() => {
    addOrUpdateMessage(message, add);
  }, [add, addOrUpdateMessage, message]);

  const acpMessage = messages.find((item): item is IMessageAcpToolCall => item.type === 'acp_tool_call');
  const rawOutput = acpMessage?.content.update.rawOutput;

  return (
    <div>
      <div data-testid='message-count'>{messages.length}</div>
      <div data-testid='last-message-type'>{messages.at(-1)?.type ?? ''}</div>
      <div data-testid='has-result'>{String(Boolean(rawOutput?.result))}</div>
      <div data-testid='image-path'>{rawOutput?.image?.path ?? ''}</div>
    </div>
  );
};

const renderMessageListProbe = (message: TMessage, options?: { add?: boolean; initial?: TMessage[] }) =>
  render(
    <MessageListProvider value={options?.initial ?? []}>
      <MessageListProbe message={message} add={options?.add} />
    </MessageListProvider>
  );

const flushNextMessageUpdate = () => {
  act(() => {
    vi.advanceTimersToNextTimer();
  });
};

describe('conversation message hooks ACP sanitization', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sanitizes an ACP image message inserted into an empty list', () => {
    renderMessageListProbe(createImageToolCall('ig_first_image'));

    flushNextMessageUpdate();

    expect(screen.getByTestId('message-count')).toHaveTextContent('1');
    expect(screen.getByTestId('has-result')).toHaveTextContent('false');
    expect(screen.getByTestId('image-path')).toHaveTextContent(
      '/Users/test/.codex/generated_images/session/ig_first_image.png'
    );
  });

  it('sanitizes an ACP image message without msg_id inserted into an empty list', () => {
    const message = createImageToolCall('ig_first_image_without_msg_id') as IMessageAcpToolCall & {
      msg_id?: string;
    };
    delete message.msg_id;

    renderMessageListProbe(message);

    flushNextMessageUpdate();

    expect(screen.getByTestId('message-count')).toHaveTextContent('1');
    expect(screen.getByTestId('has-result')).toHaveTextContent('false');
    expect(screen.getByTestId('image-path')).toHaveTextContent(
      '/Users/test/.codex/generated_images/session/ig_first_image_without_msg_id.png'
    );
  });

  it('sanitizes an ACP image message inserted with add=true', () => {
    renderMessageListProbe(createImageToolCall('ig_added_image'), {
      add: true,
      initial: [existingTextMessage],
    });

    flushNextMessageUpdate();

    expect(screen.getByTestId('message-count')).toHaveTextContent('2');
    expect(screen.getByTestId('has-result')).toHaveTextContent('false');
    expect(screen.getByTestId('image-path')).toHaveTextContent(
      '/Users/test/.codex/generated_images/session/ig_added_image.png'
    );
  });

  it('sanitizes a new ACP image message appended to a non-empty list', () => {
    renderMessageListProbe(createImageToolCall('ig_appended_image'), {
      initial: [existingTextMessage],
    });

    flushNextMessageUpdate();

    expect(screen.getByTestId('message-count')).toHaveTextContent('2');
    expect(screen.getByTestId('last-message-type')).toHaveTextContent('acp_tool_call');
    expect(screen.getByTestId('has-result')).toHaveTextContent('false');
    expect(screen.getByTestId('image-path')).toHaveTextContent(
      '/Users/test/.codex/generated_images/session/ig_appended_image.png'
    );
  });

  it('keeps non-ACP messages unchanged when inserted with add=true', () => {
    renderMessageListProbe(
      {
        ...existingTextMessage,
        id: 'text-2',
        msg_id: 'text-2',
        content: {
          content: 'world',
        },
      },
      {
        add: true,
        initial: [existingTextMessage],
      }
    );

    flushNextMessageUpdate();

    expect(screen.getByTestId('message-count')).toHaveTextContent('2');
    expect(screen.getByTestId('last-message-type')).toHaveTextContent('text');
    expect(screen.getByTestId('has-result')).toHaveTextContent('false');
  });
});
