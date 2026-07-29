/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import ChatConversation from '@/renderer/pages/conversation/components/ChatConversation';
import type { TAdHocTeamAssociation } from '@/common/types/team/adHocTeamTypes';

const usePresetAssistantInfoMock = vi.fn();
const aionrsChatMock = vi.fn(() => <div data-testid='mock-aionrs-chat'>aionrs chat</div>);
const aionrsModelSelectorMock = vi.fn(() => <div data-testid='mock-aionrs-model-selector'>aionrs model selector</div>);

const capturedHandlers = vi.hoisted(() => ({
  aionrsHandler: undefined as ((message: unknown) => void) | undefined,
}));

vi.mock('@/renderer/pages/conversation/Messages/MessageList', () => ({
  default: ({ className }: { className?: string }) => <div className={className}>message history</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/hooks', () => ({
  MessageListLoadingProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  MessageListProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  MessagePaginationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useMessageLstCache: vi.fn(),
  useMergeLiveMessage: () => mergeLiveMessageMock,
}));

vi.mock('@/renderer/pages/conversation/Messages/artifacts', () => ({
  ConversationArtifactProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/renderer/pages/conversation/components/ChatLayout', () => ({
  default: ({ children, headerExtra }: { children: React.ReactNode; headerExtra?: React.ReactNode }) => (
    <div>
      <div data-testid='chat-header-extra'>{headerExtra}</div>
      {children}
    </div>
  ),
}));

import { useAionrsMessage } from '@/renderer/pages/conversation/platforms/aionrs/useAionrsMessage';

vi.mock('@/renderer/pages/conversation/platforms/aionrs/AionrsChat', () => ({
  __esModule: true,
  default: ({ conversation_id }: { conversation_id: string }) => {
    useAionrsMessage(conversation_id);
    return <div data-testid='mock-aionrs-chat'>aionrs chat</div>;
  },
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/AionrsModelSelector', () => ({
  __esModule: true,
  default: (props: unknown) => aionrsModelSelectorMock(props),
}));

vi.mock('@/renderer/pages/conversation/components/ChatSlider.tsx', () => ({
  default: () => <div>slider</div>,
}));

vi.mock('@/renderer/pages/cron', () => ({
  CronJobManager: () => <div>cron</div>,
}));

vi.mock('@/renderer/hooks/agent/usePresetAssistantInfo', () => ({
  resolveAssistantConfigId: () => undefined,
  usePresetAssistantInfo: (...args: unknown[]) => usePresetAssistantInfoMock(...args),
}));

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, status: 'authenticated' }),
}));

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light', fontScale: 1 }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

const navigateMock = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({ openPreview: vi.fn() }),
}));

const useTeamAssistantOptionsMock = vi.fn();

vi.mock('@/renderer/pages/team/hooks/useTeamAssistantOptions', () => ({
  useTeamAssistantOptions: (...args: unknown[]) => useTeamAssistantOptionsMock(...args),
}));

const mergeLiveMessageMock = vi.fn();

const adHocMocks = vi.hoisted(() => ({
  fromConversation: { invoke: vi.fn() },
  getByConversation: { invoke: vi.fn() },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      get: { invoke: vi.fn().mockResolvedValue(null) },
      getAssociateConversation: { invoke: vi.fn() },
      createWithConversation: { invoke: vi.fn() },
      activeLease: { invoke: vi.fn().mockResolvedValue(undefined) },
      stop: { invoke: vi.fn() },
      update: { invoke: vi.fn() },
      responseStream: {
        on: vi.fn().mockImplementation((handler: (message: unknown) => void) => {
          capturedHandlers.aionrsHandler = handler;
          return vi.fn();
        }),
      },
    },
    acpConversation: {
      responseStream: {
        on: vi.fn(() => () => {}),
        off: vi.fn(),
      },
    },
    team: {
      fromConversation: adHocMocks.fromConversation,
      getByConversation: adHocMocks.getByConversation,
      activeLease: { invoke: vi.fn().mockResolvedValue(undefined) },
    },
    cron: {
      removeJob: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return {
    ...actual,
    Message: {
      ...actual.Message,
      success: (...args: unknown[]) => messageSuccessMock(...args),
      error: (...args: unknown[]) => messageErrorMock(...args),
    },
  };
});

const messageSuccessMock = vi.fn();
const messageErrorMock = vi.fn();

function aionrsConversation(overrides?: Partial<TChatConversation>): TChatConversation {
  return {
    id: 'conv-aionrs-1',
    user_id: 'user-1',
    name: 'Aionrs Conversation',
    type: 'aionrs',
    model: {},
    extra: { workspace: '/tmp/aionrs-history', backend: 'aionrs' },
    status: 'finished',
    source: 'aionui',
    created_at: 1,
    modified_at: 1,
    pinned: false,
    ...overrides,
  } as TChatConversation;
}

describe('AionrsConversation teammate message backflow integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedHandlers.aionrsHandler = undefined;
    mergeLiveMessageMock.mockClear();
    usePresetAssistantInfoMock.mockReturnValue({ info: undefined, isLoading: false });
    useTeamAssistantOptionsMock.mockReturnValue({
      assistants: [
        { id: 'a1', name: 'Assistant One' },
        { id: 'a2', name: 'Assistant Two' },
      ],
      loading: false,
      error: null,
    });
    adHocMocks.getByConversation.invoke.mockResolvedValue({
      team_id: 'team-promoted',
      origin_conversation_id: 'conv-aionrs-1',
      status: 'active',
    } as TAdHocTeamAssociation);
    adHocMocks.fromConversation.invoke.mockResolvedValue({
      team_id: 'team-promoted',
      origin_conversation_id: 'conv-aionrs-1',
      leader_slot_id: 'slot-lead',
      target_slot_id: 'slot-target',
      target_assistant_id: 'a2',
      target_assistant_name: 'Assistant Two',
      created: true,
    });
  });

  it('renders teammate replies into the promoted leader source conversation', async () => {
    render(
      <ChatConversation
        conversation={aionrsConversation({
          extra: { workspace: '/tmp/aionrs-history', teamId: 'team-promoted' },
        })}
      />
    );

    await waitFor(() => expect(screen.getByTestId('team-status-card')).toBeInTheDocument());

    capturedHandlers.aionrsHandler?.({
      type: 'teammate_message',
      data: {
        id: 'agent-reply-1',
        type: 'text',
        msg_id: 'agent-reply-1',
        conversation_id: 'conv-aionrs-1',
        position: 'left',
        status: 'finish',
        content: {
          content: 'Agent A reply',
          teammate_message: true,
          sender_name: 'Agent A',
          sender_backend: 'codex',
          sender_conversation_id: 'conv-a',
        },
      },
      msg_id: 'agent-reply-1',
      conversation_id: 'conv-aionrs-1',
    });

    expect(mergeLiveMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'text',
        msg_id: 'agent-reply-1',
        conversation_id: 'conv-aionrs-1',
        content: {
          content: 'Agent A reply',
          teammateMessage: true,
          senderName: 'Agent A',
          senderAgentType: 'codex',
          senderConversationId: 'conv-a',
        },
      })
    );
  });

  it('keeps teammate messages from different agents separate', async () => {
    render(
      <ChatConversation
        conversation={aionrsConversation({
          extra: { workspace: '/tmp/aionrs-history', teamId: 'team-promoted' },
        })}
      />
    );

    await waitFor(() => expect(screen.getByTestId('team-status-card')).toBeInTheDocument());

    capturedHandlers.aionrsHandler?.({
      type: 'teammate_message',
      data: {
        id: 'agent-a-reply',
        type: 'text',
        msg_id: 'agent-a-reply',
        conversation_id: 'conv-aionrs-1',
        position: 'left',
        status: 'finish',
        content: {
          content: 'Agent A',
          teammate_message: true,
          sender_name: 'Agent A',
          sender_backend: 'codex',
          sender_conversation_id: 'conv-a',
        },
      },
      msg_id: 'agent-a-reply',
      conversation_id: 'conv-aionrs-1',
    });

    capturedHandlers.aionrsHandler?.({
      type: 'teammate_message',
      data: {
        id: 'agent-b-reply',
        type: 'text',
        msg_id: 'agent-b-reply',
        conversation_id: 'conv-aionrs-1',
        position: 'left',
        status: 'finish',
        content: {
          content: 'Agent B',
          teammate_message: true,
          sender_name: 'Agent B',
          sender_backend: 'qwen',
          sender_conversation_id: 'conv-b',
        },
      },
      msg_id: 'agent-b-reply',
      conversation_id: 'conv-aionrs-1',
    });

    expect(mergeLiveMessageMock).toHaveBeenCalledTimes(2);
    expect(mergeLiveMessageMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        msg_id: 'agent-a-reply',
        content: expect.objectContaining({ senderName: 'Agent A', senderAgentType: 'codex' }),
      })
    );
    expect(mergeLiveMessageMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        msg_id: 'agent-b-reply',
        content: expect.objectContaining({ senderName: 'Agent B', senderAgentType: 'qwen' }),
      })
    );
  });

  it('deduplicates repeated teammate_message events for the same message id', async () => {
    render(
      <ChatConversation
        conversation={aionrsConversation({
          extra: { workspace: '/tmp/aionrs-history', teamId: 'team-promoted' },
        })}
      />
    );

    await waitFor(() => expect(screen.getByTestId('team-status-card')).toBeInTheDocument());

    const event = {
      type: 'teammate_message',
      data: {
        id: 'dup-reply',
        type: 'text',
        msg_id: 'dup-reply',
        conversation_id: 'conv-aionrs-1',
        position: 'left',
        status: 'finish',
        content: {
          content: 'same reply',
          teammate_message: true,
        },
      },
      msg_id: 'dup-reply',
      conversation_id: 'conv-aionrs-1',
    };

    capturedHandlers.aionrsHandler?.(event);
    capturedHandlers.aionrsHandler?.(event);

    expect(mergeLiveMessageMock).toHaveBeenCalledTimes(1);
  });

  it('ignores teammate messages addressed to a different conversation', async () => {
    render(
      <ChatConversation
        conversation={aionrsConversation({
          extra: { workspace: '/tmp/aionrs-history', teamId: 'team-promoted' },
        })}
      />
    );

    await waitFor(() => expect(screen.getByTestId('team-status-card')).toBeInTheDocument());

    capturedHandlers.aionrsHandler?.({
      type: 'teammate_message',
      data: {
        id: 'other-reply',
        type: 'text',
        msg_id: 'other-reply',
        conversation_id: 'conv-other',
        position: 'left',
        status: 'finish',
        content: {
          content: 'wrong conversation',
          teammate_message: true,
        },
      },
      msg_id: 'other-reply',
      conversation_id: 'conv-aionrs-1',
    });

    expect(mergeLiveMessageMock).not.toHaveBeenCalled();
  });
});
