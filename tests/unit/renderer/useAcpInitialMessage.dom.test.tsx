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
  fetchSlashCommands,
} = vi.hoisted(() => ({
  warmupInvoke: vi.fn(),
  sendMessageInvoke: vi.fn(),
  emitterEmit: vi.fn(),
  checkAndUpdateTitle: vi.fn(),
  setAiProcessing: vi.fn(),
  addOrUpdateMessage: vi.fn(),
  fetchSlashCommands: vi.fn(),
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
    fetchSlashCommands,
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

  it('does not resend when completion marker already exists', async () => {
    sessionStorage.setItem('acp_initial_message_conv-1', JSON.stringify({ input: 'hello', files: [] }));
    sessionStorage.setItem('acp_initial_message_completed_conv-1', '1');

    render(<Harness conversationId='conv-1' />);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(warmupInvoke).not.toHaveBeenCalled();
    expect(sendMessageInvoke).not.toHaveBeenCalled();
    expect(addOrUpdateMessage).not.toHaveBeenCalled();
  });

  it('sends once and marks completion when initial message is pending', async () => {
    sessionStorage.setItem('acp_initial_message_conv-2', JSON.stringify({ input: 'hello', files: ['/tmp/a.txt'] }));

    render(<Harness conversationId='conv-2' />);

    await waitFor(() => expect(sendMessageInvoke).toHaveBeenCalledTimes(1));

    expect(warmupInvoke).toHaveBeenCalledWith({ conversation_id: 'conv-2' });
    expect(fetchSlashCommands).toHaveBeenCalled();
    expect(checkAndUpdateTitle).toHaveBeenCalledWith('conv-2', 'hello');
    expect(sessionStorage.getItem('acp_initial_message_conv-2')).toBeNull();
    expect(sessionStorage.getItem('acp_initial_message_completed_conv-2')).toBe('1');
    expect(emitterEmit).toHaveBeenCalledWith('chat.history.refresh');
  });
});
