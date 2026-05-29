// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import type { TMessage } from '@/common/chat/chatLib';

const {
  warmupInvoke,
  sendMessageInvoke,
  emitterEmit,
  checkAndUpdateTitle,
  setAiProcessing,
  addOrUpdateMessage,
} = vi.hoisted(() => ({
  warmupInvoke: vi.fn(),
  sendMessageInvoke: vi.fn(),
  emitterEmit: vi.fn(),
  checkAndUpdateTitle: vi.fn(),
  setAiProcessing: vi.fn(),
  addOrUpdateMessage: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      warmup: { invoke: warmupInvoke },
    },
    acpConversation: {
      sendMessage: { invoke: sendMessageInvoke },
    },
  },
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: { emit: emitterEmit },
}));

import { useAcpInitialMessage } from '@/renderer/pages/conversation/platforms/acp/useAcpInitialMessage';

const Harness = ({ conversationId }: { conversationId: string }) => {
  useAcpInitialMessage({
    conversation_id: conversationId,
    backend: 'claude',
    workspacePath: '/tmp/workspace',
    setAiProcessing,
    checkAndUpdateTitle,
    addOrUpdateMessage: addOrUpdateMessage as (message: TMessage, prepend?: boolean) => void,
  });
  return null;
};

describe('useAcpInitialMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    warmupInvoke.mockResolvedValue(undefined);
    sendMessageInvoke.mockResolvedValue({ msg_id: 'msg-1' });
  });

  it('sends initial message when data exists in storage', async () => {
    sessionStorage.setItem('acp_initial_message_conv-1', JSON.stringify({ input: 'hello', files: [] }));

    render(<Harness conversationId='conv-1' />);

    await waitFor(() => expect(sendMessageInvoke).toHaveBeenCalledTimes(1));

    expect(checkAndUpdateTitle).toHaveBeenCalledWith('conv-1', 'hello');
    expect(sessionStorage.getItem('acp_initial_message_conv-1')).toBeNull();
    expect(emitterEmit).toHaveBeenCalledWith('chat.history.refresh');
  });

  it('clears storage on read and sends message exactly once', async () => {
    sessionStorage.setItem('acp_initial_message_conv-2', JSON.stringify({ input: 'hello', files: ['/tmp/a.txt'] }));

    render(<Harness conversationId='conv-2' />);

    await waitFor(() => expect(sendMessageInvoke).toHaveBeenCalledTimes(1));

    expect(checkAndUpdateTitle).toHaveBeenCalledWith('conv-2', 'hello');
    expect(sessionStorage.getItem('acp_initial_message_conv-2')).toBeNull();
    expect(emitterEmit).toHaveBeenCalledWith('chat.history.refresh');
  });
});
