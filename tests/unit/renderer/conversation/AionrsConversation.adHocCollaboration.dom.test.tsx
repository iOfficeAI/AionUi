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

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      let text = (options?.defaultValue as string) ?? key;
      if (options) {
        for (const [name, value] of Object.entries(options)) {
          if (name !== 'defaultValue') text = text.replace(new RegExp(`{{${name}}}`, 'g'), String(value));
        }
      }
      return text;
    },
  }),
}));

const usePresetAssistantInfoMock = vi.fn();
const aionrsChatMock = vi.fn(() => <div data-testid='mock-aionrs-chat'>aionrs chat</div>);
const aionrsModelSelectorMock = vi.fn(() => <div data-testid='mock-aionrs-model-selector'>aionrs model selector</div>);

vi.mock('@/renderer/pages/conversation/Messages/MessageList', () => ({
  default: ({ className }: { className?: string }) => <div className={className}>message history</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/hooks', () => ({
  MessageListLoadingProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  MessageListProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  MessagePaginationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useMessageLstCache: vi.fn(),
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

vi.mock('@/renderer/pages/conversation/platforms/aionrs/AionrsChat', () => ({
  __esModule: true,
  default: (props: unknown) => aionrsChatMock(props),
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

const adHocMocks = vi.hoisted(() => ({
  fromConversation: { invoke: vi.fn() },
  getByConversation: { invoke: vi.fn() },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      getAssociateConversation: { invoke: vi.fn() },
      createWithConversation: { invoke: vi.fn() },
      activeLease: { invoke: vi.fn().mockResolvedValue(undefined) },
      stop: { invoke: vi.fn() },
      update: { invoke: vi.fn() },
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

async function waitForLauncherReady() {
  await waitFor(() => expect(screen.getByTestId('collaboration-launcher-trigger')).not.toBeDisabled());
}

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

describe('AionrsConversation ad-hoc collaboration integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePresetAssistantInfoMock.mockReturnValue({ info: undefined, isLoading: false });
    useTeamAssistantOptionsMock.mockReturnValue({
      assistants: [
        { id: 'a1', name: 'Assistant One' },
        { id: 'a2', name: 'Assistant Two' },
      ],
      loading: false,
      error: null,
    });
    adHocMocks.getByConversation.invoke.mockResolvedValue(null);
    adHocMocks.fromConversation.invoke.mockResolvedValue({
      team_id: 'team-1',
      origin_conversation_id: 'conv-aionrs-1',
      leader_slot_id: 'slot-lead',
      target_slot_id: 'slot-target',
      target_assistant_id: 'a2',
      target_assistant_name: 'Assistant Two',
      created: true,
    });
  });

  it('shows the collaboration launcher for a normal aionrs conversation', async () => {
    render(<ChatConversation conversation={aionrsConversation()} />);

    await waitForLauncherReady();
    expect(screen.getByTestId('collaboration-launcher-trigger')).toBeInTheDocument();
    expect(screen.queryByTestId('team-status-card')).not.toBeInTheDocument();
  });

  it('shows the status card and navigates to the team after successful creation', async () => {
    render(<ChatConversation conversation={aionrsConversation()} />);

    await waitForLauncherReady();

    fireEvent.click(screen.getByTestId('collaboration-launcher-trigger'));
    await waitFor(() => expect(screen.getByTestId('agent-selector-option-a2')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('agent-selector-option-a2'));
    fireEvent.click(screen.getByTestId('agent-selector-confirm'));

    await waitFor(() => expect(adHocMocks.fromConversation.invoke).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('team-status-card')).toBeInTheDocument());
    expect(messageSuccessMock).toHaveBeenCalledWith(expect.stringContaining('Assistant Two'));

    fireEvent.click(screen.getByTestId('team-status-card'));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/team/team-1'));
  });

  it('does not navigate and shows no status card when creation fails', async () => {
    adHocMocks.fromConversation.invoke.mockRejectedValue(new Error('creation failed'));

    render(<ChatConversation conversation={aionrsConversation()} />);

    await waitForLauncherReady();

    fireEvent.click(screen.getByTestId('collaboration-launcher-trigger'));
    await waitFor(() => expect(screen.getByTestId('agent-selector-option-a2')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('agent-selector-option-a2'));
    fireEvent.click(screen.getByTestId('agent-selector-confirm'));

    await waitFor(() => expect(adHocMocks.fromConversation.invoke).toHaveBeenCalled());
    expect(screen.queryByTestId('team-status-card')).not.toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('shows the status card and navigates when an existing association is already present', async () => {
    adHocMocks.getByConversation.invoke.mockResolvedValue({
      team_id: 'team-existing',
      origin_conversation_id: 'conv-aionrs-1',
      status: 'active',
    } as TAdHocTeamAssociation);

    render(<ChatConversation conversation={aionrsConversation()} />);

    await waitFor(() => expect(screen.getByTestId('team-status-card')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('team-status-card'));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/team/team-existing'));
  });

  it('hides the launcher and status card for team-owned aionrs conversations', async () => {
    render(
      <ChatConversation
        conversation={aionrsConversation({ extra: { workspace: '/tmp/aionrs-history', team_id: 'team-owned' } })}
      />
    );

    await waitFor(() => expect(screen.getByTestId('mock-aionrs-chat')).toBeInTheDocument());
    expect(screen.queryByTestId('collaboration-launcher-trigger')).not.toBeInTheDocument();
    expect(screen.queryByTestId('team-status-card')).not.toBeInTheDocument();
  });

  it('shows the status card but hides the launcher for the promoted source conversation', async () => {
    adHocMocks.getByConversation.invoke.mockResolvedValue({
      team_id: 'team-promoted',
      origin_conversation_id: 'conv-aionrs-1',
      status: 'active',
    } as TAdHocTeamAssociation);

    render(
      <ChatConversation
        conversation={aionrsConversation({
          extra: { workspace: '/tmp/aionrs-history', teamId: 'team-promoted' },
        })}
      />
    );

    await waitFor(() => expect(screen.getByTestId('team-status-card')).toBeInTheDocument());
    expect(screen.queryByTestId('collaboration-launcher-trigger')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('team-status-card'));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/team/team-promoted'));
  });

  it('does not show a runtime unavailable error when opening the promoted source conversation', async () => {
    adHocMocks.getByConversation.invoke.mockResolvedValue({
      team_id: 'team-promoted',
      origin_conversation_id: 'conv-aionrs-1',
      status: 'active',
    } as TAdHocTeamAssociation);

    render(
      <ChatConversation
        conversation={aionrsConversation({
          extra: { workspace: '/tmp/aionrs-history', teamId: 'team-promoted' },
        })}
      />
    );

    await waitFor(() => expect(screen.getByTestId('team-status-card')).toBeInTheDocument());
    expect(messageErrorMock).not.toHaveBeenCalledWith(expect.stringContaining('WORKSPACE_PATH_RUNTIME_UNAVAILABLE'));
  });
});
