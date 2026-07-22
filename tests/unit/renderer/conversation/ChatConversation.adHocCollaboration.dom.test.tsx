/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import ChatConversation from '@/renderer/pages/conversation/components/ChatConversation';
import type { TTeam, TeamAssistant } from '@/common/types/team/teamTypes';
import type { TAdHocTeamAssociation } from '@/common/types/team/adHocTeamTypes';

const usePresetAssistantInfoMock = vi.fn();
const acpChatMock = vi.fn((props: { isTeamRunning?: boolean } & Record<string, unknown>) => (
  <div data-testid='mock-acp-chat'>acp chat {props.isTeamRunning ? 'team-running' : ''}</div>
));
const acpModelSelectorMock = vi.fn(() => <div data-testid='mock-acp-model-selector'>model selector</div>);

vi.mock('@/renderer/pages/conversation/Messages/MessageList', () => ({
  default: ({ className }: { className?: string }) => <div className={className}>message history</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/hooks', () => ({
  MessageListLoadingProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  MessageListProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  MessagePaginationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useMessageLstCache: vi.fn(),
  useUpdateMessageList: vi.fn(),
  useMergeLiveMessage: vi.fn(),
  useMessageList: vi.fn(() => []),
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

vi.mock('@/renderer/pages/conversation/platforms/acp/AcpChat', () => ({
  __esModule: true,
  default: (props: unknown) => acpChatMock(props),
}));

vi.mock('@/renderer/components/agent/AcpModelSelector', () => ({
  __esModule: true,
  default: (props: unknown) => acpModelSelectorMock(props),
}));

vi.mock('@/renderer/pages/conversation/components/ChatSlider.tsx', () => ({
  default: () => <div>slider</div>,
}));

const teamStatusCardMock = vi.fn(
  ({
    association,
    onNavigate,
  }: {
    association?: { team_id?: string } | null;
    onNavigate?: (teamId: string) => void;
  }) => (
    <div data-testid='team-status-card' onClick={() => onNavigate?.(association?.team_id ?? 'team-1')}>
      status card
    </div>
  )
);

vi.mock('@/renderer/pages/conversation/components/AdHocTeam/TeamStatusCard', () => ({
  TeamStatusCard: (props: unknown) => teamStatusCardMock(props),
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
  usePreviewContext: () => ({ openPreview: vi.fn(), domSnippets: [], setSendBoxHandler: vi.fn() }),
}));

const useTeamAssistantOptionsMock = vi.fn();

vi.mock('@/renderer/pages/team/hooks/useTeamAssistantOptions', () => ({
  useTeamAssistantOptions: (...args: unknown[]) => useTeamAssistantOptionsMock(...args),
}));

const adHocMocks = vi.hoisted(() => ({
  fromConversation: { invoke: vi.fn() },
  getByConversation: { invoke: vi.fn() },
  get: { invoke: vi.fn() },
  getRunState: { invoke: vi.fn() },
}));

const eventHandlers = vi.hoisted(() => ({
  removed: undefined as ((event: { team_id: string }) => void) | undefined,
  renamed: undefined as ((event: { team_id: string }) => void) | undefined,
  agentStatusChanged: undefined as ((event: { team_id: string }) => void) | undefined,
  teammateMessage: undefined as ((event: ITeamTeammateMessageEvent) => void) | undefined,
  sessionChanged: undefined as ((event: { team_id: string }) => void) | undefined,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      get: { invoke: vi.fn().mockResolvedValue(undefined) },
      getAssociateConversation: { invoke: vi.fn() },
      createWithConversation: { invoke: vi.fn() },
      activeLease: { invoke: vi.fn().mockResolvedValue(undefined) },
      confirmation: {
        list: { invoke: vi.fn().mockResolvedValue([]) },
        add: { on: vi.fn(() => vi.fn()) },
        update: { on: vi.fn(() => vi.fn()) },
        remove: { on: vi.fn(() => vi.fn()) },
      },
      responseStream: { on: vi.fn(() => vi.fn()) },
      userCreated: { on: vi.fn(() => vi.fn()) },
      turnCompleted: { on: vi.fn(() => vi.fn()) },
      artifactStream: { on: vi.fn(() => vi.fn()) },
      listChanged: { on: vi.fn(() => vi.fn()) },
      sendMessage: { invoke: vi.fn() },
    },
    acpConversation: {
      responseStream: { on: vi.fn(() => vi.fn()) },
      userCreated: { on: vi.fn(() => vi.fn()) },
      turnCompleted: { on: vi.fn(() => vi.fn()) },
      artifactStream: { on: vi.fn(() => vi.fn()) },
      listChanged: { on: vi.fn(() => vi.fn()) },
    },
    team: {
      fromConversation: adHocMocks.fromConversation,
      getByConversation: adHocMocks.getByConversation,
      get: adHocMocks.get,
      getRunState: adHocMocks.getRunState,
      activeLease: { invoke: vi.fn().mockResolvedValue(undefined) },
      removed: {
        on: vi.fn((handler: (event: { team_id: string }) => void) => {
          eventHandlers.removed = handler;
          return vi.fn();
        }),
      },
      renamed: {
        on: vi.fn((handler: (event: { team_id: string }) => void) => {
          eventHandlers.renamed = handler;
          return vi.fn();
        }),
      },
      agentStatusChanged: {
        on: vi.fn((handler: (event: { team_id: string }) => void) => {
          eventHandlers.agentStatusChanged = handler;
          return vi.fn();
        }),
      },
      sessionChanged: {
        on: vi.fn((handler: (event: { team_id: string }) => void) => {
          eventHandlers.sessionChanged = handler;
          return vi.fn();
        }),
      },
      teammateMessage: {
        on: vi.fn((handler: (event: ITeamTeammateMessageEvent) => void) => {
          eventHandlers.teammateMessage = handler;
          return vi.fn();
        }),
      },
    },
    cron: {
      onJobCreated: { on: vi.fn(() => vi.fn()) },
      onJobUpdated: { on: vi.fn(() => vi.fn()) },
      onJobRemoved: { on: vi.fn(() => vi.fn()) },
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

function acpConversation(overrides?: Partial<TChatConversation>): TChatConversation {
  return {
    id: 'conv-1',
    user_id: 'user-1',
    name: 'ACP Conversation',
    type: 'acp',
    model: {},
    extra: { workspace: '/tmp/aionui-history', backend: 'claude' },
    status: 'finished',
    source: 'aionui',
    created_at: 1,
    modified_at: 1,
    pinned: false,
    ...overrides,
  } as TChatConversation;
}

describe('ChatConversation ad-hoc collaboration integration', () => {
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
      origin_conversation_id: 'conv-1',
      leader_slot_id: 'slot-lead',
      target_slot_id: 'slot-target',
      target_assistant_id: 'a2',
      target_assistant_name: 'Assistant Two',
      created: true,
    });
    adHocMocks.get.invoke.mockResolvedValue(null);
    adHocMocks.getRunState.invoke.mockResolvedValue({ active_run: null, slot_work: [] });
  });

  function mockTeam(overrides?: Partial<TTeam>): TTeam {
    return {
      id: 'team-1',
      user_id: 'user-1',
      name: 'Alpha Team',
      workspace: '/tmp/team',
      workspace_mode: 'shared',
      leader_assistant_id: 'leader-1',
      assistants: [mockAssistant({ slot_id: 'slot-lead', role: 'leader', assistant_name: 'Leader' })],
      created_at: 1,
      updated_at: 2,
      ...overrides,
    };
  }

  function mockAssistant(overrides?: Partial<TeamAssistant>): TeamAssistant {
    return {
      slot_id: 'slot-1',
      conversation_id: 'conv-member',
      role: 'teammate',
      assistant_backend: 'codex',
      assistant_name: 'Assistant',
      status: 'idle',
      pending_confirmations: 0,
      ...overrides,
    };
  }

  it('shows the status card and navigates to the team after successful creation', async () => {
    render(<ChatConversation conversation={acpConversation()} />);

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

    render(<ChatConversation conversation={acpConversation()} />);

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
      origin_conversation_id: 'conv-1',
      status: 'active',
    } as TAdHocTeamAssociation);

    render(<ChatConversation conversation={acpConversation()} />);

    await waitFor(() => expect(screen.getByTestId('team-status-card')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('team-status-card'));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/team/team-existing'));
  });

  it('shows the status card but hides the launcher for the promoted source conversation', async () => {
    // Backend patches extra.teamId on the origin conversation after promotion.
    adHocMocks.getByConversation.invoke.mockResolvedValue({
      team_id: 'team-promoted',
      origin_conversation_id: 'conv-1',
      status: 'active',
    } as TAdHocTeamAssociation);

    render(
      <ChatConversation
        conversation={acpConversation({
          extra: { workspace: '/tmp/aionui-history', backend: 'claude', teamId: 'team-promoted' },
        })}
      />
    );

    await waitFor(() => expect(screen.getByTestId('team-status-card')).toBeInTheDocument());
    expect(screen.queryByTestId('collaboration-launcher-trigger')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('team-status-card'));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/team/team-promoted'));
  });

  it('does not show a runtime unavailable error when opening the promoted source conversation', async () => {
    // Backend patches extra.teamId on the origin conversation after promotion.
    // The source conversation must not trigger a runtime unavailable toast
    // because its runtime has been promoted to the team.
    adHocMocks.getByConversation.invoke.mockResolvedValue({
      team_id: 'team-promoted',
      origin_conversation_id: 'conv-1',
      status: 'active',
    } as TAdHocTeamAssociation);

    render(
      <ChatConversation
        conversation={acpConversation({
          extra: { workspace: '/tmp/aionui-history', backend: 'claude', teamId: 'team-promoted' },
        })}
      />
    );

    await waitFor(() => expect(screen.getByTestId('team-status-card')).toBeInTheDocument());
    expect(messageErrorMock).not.toHaveBeenCalledWith(expect.stringContaining('WORKSPACE_PATH_RUNTIME_UNAVAILABLE'));
  });

  it('does not show the status card when there is no association', async () => {
    adHocMocks.getByConversation.invoke.mockResolvedValue(null);

    render(<ChatConversation conversation={acpConversation()} />);

    await waitFor(() => expect(adHocMocks.getByConversation.invoke).toHaveBeenCalled());
    expect(screen.queryByTestId('team-status-card')).not.toBeInTheDocument();
  });

  it('shows the status card for aionrs conversations with an association', async () => {
    adHocMocks.getByConversation.invoke.mockResolvedValue({
      team_id: 'team-aionrs',
      origin_conversation_id: 'conv-aionrs',
      status: 'active',
    } as TAdHocTeamAssociation);

    render(
      <ChatConversation
        conversation={acpConversation({
          id: 'conv-aionrs',
          type: 'aionrs',
          extra: { workspace: '/tmp/aionui-history', backend: 'aionrs' },
        })}
      />
    );

    await waitFor(() => expect(screen.getByTestId('team-status-card')).toBeInTheDocument());
  });

  it('hides the collaboration launcher for team conversations and shows the status card', async () => {
    adHocMocks.getByConversation.invoke.mockResolvedValue({
      team_id: 'team-conv',
      origin_conversation_id: 'conv-1',
      status: 'active',
    } as TAdHocTeamAssociation);

    render(
      <ChatConversation
        conversation={acpConversation({
          extra: { workspace: '/tmp/aionui-history', backend: 'claude', teamId: 'team-conv' },
        })}
      />
    );

    await waitFor(() => expect(screen.getByTestId('team-status-card')).toBeInTheDocument());
    expect(screen.queryByTestId('collaboration-launcher-trigger')).not.toBeInTheDocument();
  });

  it('passes isTeamRunning to AcpChat when the team run is active', async () => {
    adHocMocks.getByConversation.invoke.mockResolvedValue({
      team_id: 'team-running',
      origin_conversation_id: 'conv-1',
      status: 'active',
    } as TAdHocTeamAssociation);
    adHocMocks.getRunState.invoke.mockResolvedValue({
      session_generation: null,
      active_run: {
        team_id: 'team-running',
        team_run_id: 'run-1',
        source: 'user_message',
        has_user_intervention: false,
        target_slot_id: 'slot-1',
        target_role: 'teammate',
        status: 'running',
        queued_intent_count: 0,
        starting_batch_count: 0,
        running_batch_count: 1,
        active_enqueue_lease_count: 0,
        slot_work: [],
      },
      slot_work: [],
    });

    render(<ChatConversation conversation={acpConversation()} />);

    await waitFor(() => expect(screen.getByTestId('mock-acp-chat')).toHaveTextContent('team-running'));
  });
});
