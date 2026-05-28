/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chat/chatLib';
import PendingApprovalsBanner from '@/renderer/pages/conversation/components/PendingApprovalsBanner';
import MessageAcpPermission from '@/renderer/pages/conversation/Messages/acp/MessageAcpPermission';
import { MessageListProvider, useMessageList } from '@/renderer/pages/conversation/Messages/hooks';
import { conversation } from '@/common/adapter/ipcBridge';
import { ipcBridge } from '@/common';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React, { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      confirmation: {
        confirm: { invoke: vi.fn() },
      },
    },
  },
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  conversation: {
    confirmMessage: { invoke: vi.fn() },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: { count?: number; defaultValue?: string }) => params?.defaultValue || key,
  }),
}));

type MockedInvoke = ReturnType<typeof vi.fn>;

const mockedConfirm = ipcBridge.conversation.confirmation.confirm.invoke as MockedInvoke;
const mockedConfirmMessage = conversation.confirmMessage.invoke as MockedInvoke;

function permission(callId: string, msgId: string, command: string): TMessage {
  return {
    id: `id-${callId}`,
    type: 'permission',
    msg_id: msgId,
    position: 'left',
    conversation_id: 'conv-1',
    created_at: Date.now(),
    content: {
      id: callId,
      call_id: callId,
      title: 'Run a command on your machine?',
      action: 'run_shell',
      description: command,
      command_type: command,
      options: [{ label: 'Allow once', value: 'once' }],
    },
  } as TMessage;
}

function acpPermission(): TMessage {
  return {
    id: 'id-tool-1',
    type: 'acp_permission',
    msg_id: 'msg-tool-1',
    position: 'left',
    conversation_id: 'conv-1',
    created_at: Date.now(),
    content: {
      session_id: 'session-1',
      tool_call: {
        tool_call_id: 'tool-1',
        title: 'Run tool',
        kind: 'execute',
        raw_input: { command: 'echo hello' },
      },
      options: [{ option_id: 'allow_once', name: 'Allow once', kind: 'allow_once' }],
    },
  } as TMessage;
}

function StateProbe({ onChange }: { onChange: (messages: TMessage[]) => void }) {
  const messages = useMessageList();
  useEffect(() => {
    onChange(messages);
  }, [messages, onChange]);
  return null;
}

describe('PendingApprovalsBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedConfirm.mockResolvedValue(undefined);
    mockedConfirmMessage.mockResolvedValue(undefined);
  });

  it('marks inline permission cards as responded after approving all pending permissions', async () => {
    let latestMessages: TMessage[] = [];

    render(
      <MessageListProvider
        value={[permission('shell-A', 'turn-1', 'ls -la /'), permission('shell-B', 'turn-1', 'uname -a')]}
      >
        <PendingApprovalsBanner conversation_id='conv-1' />
        <StateProbe onChange={(messages) => (latestMessages = messages)} />
      </MessageListProvider>
    );

    fireEvent.click(screen.getByTestId('pending-approvals-approve-all'));

    await waitFor(() => expect(mockedConfirm).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(latestMessages.map((message) => (message.content as { responded?: boolean }).responded)).toEqual([
        true,
        true,
      ])
    );
  });

  it('keeps failed bulk approvals pending for a retry', async () => {
    let latestMessages: TMessage[] = [];
    mockedConfirm.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('network'));

    render(
      <MessageListProvider
        value={[permission('shell-A', 'turn-1', 'ls -la /'), permission('shell-B', 'turn-1', 'uname -a')]}
      >
        <PendingApprovalsBanner conversation_id='conv-1' />
        <StateProbe onChange={(messages) => (latestMessages = messages)} />
      </MessageListProvider>
    );

    fireEvent.click(screen.getByTestId('pending-approvals-approve-all'));

    await waitFor(() => expect(mockedConfirm).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(latestMessages.map((message) => (message.content as { responded?: boolean }).responded)).toEqual([
        true,
        undefined,
      ])
    );
  });

  it('marks ACP permission cards as responded after individual approval', async () => {
    const message = acpPermission();
    let latestMessages: TMessage[] = [];

    render(
      <MessageListProvider value={[message]}>
        <MessageAcpPermission message={message} />
        <StateProbe onChange={(messages) => (latestMessages = messages)} />
      </MessageListProvider>
    );

    fireEvent.click(screen.getByText('Allow once'));
    fireEvent.click(screen.getByTestId('message-acp-permission-confirm'));

    await waitFor(() => expect(mockedConfirmMessage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect((latestMessages[0].content as { responded?: boolean }).responded).toBe(true));
  });
});
