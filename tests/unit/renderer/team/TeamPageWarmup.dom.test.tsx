import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { TChatConversation } from '@/common/config/storage';
import type { TTeam } from '@/common/types/team/teamTypes';

const {
  getConversationOrNullMock,
  acpSelectorPropsBySlot,
  restartPropsBySlot,
  ensureSessionMock,
  teamEventHandlers,
  makeTeamEventChannel,
  resetAgentContextMock,
  restartTeamMemberMock,
  revalidateConfigOptionsMock,
  messageSuccessMock,
  messageWarningMock,
  messageErrorMock,
  modalConfirmMock,
  layoutState,
} = vi.hoisted(() => {
  const handlers: Record<string, Array<(event: unknown) => void>> = {};
  const makeChannel = (name: string) => ({
    on: vi.fn((handler: (event: unknown) => void) => {
      handlers[name] = [...(handlers[name] ?? []), handler];
      return vi.fn();
    }),
  });
  return {
    getConversationOrNullMock: vi.fn(),
    acpSelectorPropsBySlot: new Map<string, { status: string; trigger?: () => Promise<void> }>(),
    restartPropsBySlot: new Map<string, { availability: string; disabled?: boolean; disabledReason?: string }>(),
    ensureSessionMock: vi.fn(async () => undefined),
    teamEventHandlers: handlers,
    makeTeamEventChannel: makeChannel,
    resetAgentContextMock: vi.fn(),
    restartTeamMemberMock: vi.fn(),
    revalidateConfigOptionsMock: vi.fn(),
    messageSuccessMock: vi.fn(),
    messageWarningMock: vi.fn(),
    messageErrorMock: vi.fn(),
    modalConfirmMock: vi.fn(),
    layoutState: { isMobile: false },
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
    i18n: { language: 'en' },
  }),
}));

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return {
    ...actual,
    Message: {
      success: messageSuccessMock,
      warning: messageWarningMock,
      error: messageErrorMock,
      useMessage: () => [null, null],
    },
    Modal: Object.assign(actual.Modal, { confirm: modalConfirmMock }),
  };
});

vi.mock('@/renderer/hooks/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/renderer/hooks/context/LayoutContext', () => ({ useLayoutContext: () => layoutState }));

vi.mock('@/common', () => ({
  ipcBridge: {
    team: {
      get: { invoke: vi.fn() },
      renameTeam: { invoke: vi.fn() },
      addAgent: { invoke: vi.fn() },
      removeAgent: { invoke: vi.fn() },
      attachAgent: { invoke: vi.fn(async () => undefined) },
      resetAgentContext: { invoke: (...args: unknown[]) => resetAgentContextMock(...args) },
      pauseSlotWork: { invoke: vi.fn() },
      getRunState: { invoke: vi.fn(async () => ({ session_generation: null, active_run: null, slot_work: [] })) },
      activeLease: { invoke: vi.fn(async () => ({ renewed_count: 2 })) },
      ensureSession: { invoke: (...args: unknown[]) => ensureSessionMock(...args) },
      agentStatusChanged: makeTeamEventChannel('agentStatusChanged'),
      agentSpawned: makeTeamEventChannel('agentSpawned'),
      agentRemoved: makeTeamEventChannel('agentRemoved'),
      agentRenamed: makeTeamEventChannel('agentRenamed'),
      agentRuntimeStatusChanged: makeTeamEventChannel('agentRuntimeStatusChanged'),
      sessionStatusChanged: makeTeamEventChannel('sessionStatusChanged'),
      taskChanged: makeTeamEventChannel('taskChanged'),
      sessionChanged: makeTeamEventChannel('sessionChanged'),
      runAccepted: makeTeamEventChannel('runAccepted'),
      runStarted: makeTeamEventChannel('runStarted'),
      runUpdated: makeTeamEventChannel('runUpdated'),
      runCompleted: makeTeamEventChannel('runCompleted'),
      runCancelled: makeTeamEventChannel('runCancelled'),
      runFailed: makeTeamEventChannel('runFailed'),
      childTurnStarted: makeTeamEventChannel('childTurnStarted'),
      childTurnCompleted: makeTeamEventChannel('childTurnCompleted'),
      childTurnCancelled: makeTeamEventChannel('childTurnCancelled'),
      slotWorkChanged: makeTeamEventChannel('slotWorkChanged'),
      listChanged: makeTeamEventChannel('listChanged'),
    },
    cron: { removeJob: { invoke: vi.fn() } },
    assistant: { list: { invoke: vi.fn(async () => []) } },
    conversation: {
      update: { invoke: vi.fn(async () => undefined) },
      // TeamPage subscribes to conversation.listChanged on mount to refetch the
      // leader's dispatch conversation; stub it so the passive effect can run.
      listChanged: makeTeamEventChannel('conversationListChanged'),
      confirmation: {
        list: { invoke: vi.fn(async () => []) },
        add: makeTeamEventChannel('confirmationAdd'),
        remove: makeTeamEventChannel('confirmationRemove'),
      },
    },
    realtime: { reconnected: makeTeamEventChannel('reconnected') },
  },
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  getConversationOrNull: (...args: unknown[]) => getConversationOrNullMock(...args),
}));

vi.mock('@/renderer/pages/conversation/components/ChatLayout', () => ({
  __esModule: true,
  default: ({ children, tabsSlot }: { children: React.ReactNode; tabsSlot?: React.ReactNode }) => (
    <div>
      <div data-testid='team-tabs-slot'>{tabsSlot}</div>
      <div data-testid='team-chat-layout'>{children}</div>
    </div>
  ),
}));

// Probe: capture the warmup prop each slot's AcpModelSelector receives, keyed by conversation_id.
vi.mock('@/renderer/components/agent/AcpModelSelector', () => ({
  __esModule: true,
  default: (props: { conversation_id: string; warmup?: { status: string; trigger?: () => Promise<void> } }) => {
    if (props.warmup) acpSelectorPropsBySlot.set(props.conversation_id, props.warmup);
    return <div data-testid={`acp-model-selector-${props.conversation_id}`} />;
  },
}));

vi.mock('@/renderer/components/agent/AcpRuntimeRestartButton', () => ({
  __esModule: true,
  useAcpRuntimeRestart: () => ({ restart: restartTeamMemberMock, restarting: false }),
  default: (props: { conversation_id: string; availability: string; disabled?: boolean; disabledReason?: string }) => {
    restartPropsBySlot.set(props.conversation_id, {
      availability: props.availability,
      disabled: props.disabled,
      disabledReason: props.disabledReason,
    });
    return <div data-testid={`runtime-restart-${props.conversation_id}`} />;
  },
}));

vi.mock('@/renderer/hooks/agent/useAcpConfigOptions', async () => {
  const actual = await vi.importActual<typeof import('@/renderer/hooks/agent/useAcpConfigOptions')>(
    '@/renderer/hooks/agent/useAcpConfigOptions'
  );
  return { ...actual, revalidateAcpConfigOptions: revalidateConfigOptionsMock };
});

vi.mock('@/renderer/pages/conversation/platforms/aionrs/AionrsModelSelector', () => ({
  __esModule: true,
  default: () => <div data-testid='mock-aionrs-model-selector' />,
}));

vi.mock('@/renderer/pages/team/components/TeamChatView', () => ({
  __esModule: true,
  default: ({ conversation: c }: { conversation: TChatConversation }) => <div data-testid={`team-chat-view-${c.id}`} />,
}));

// Isolate TeamPage from the workspace sider: the real ChatSlider subtree pulls
// in its own ipcBridge.conversation.* subscriptions. Mocking it keeps the test
// focused on warmup wiring instead of ChatSlider internals.
vi.mock('@renderer/pages/conversation/components/ChatSlider.tsx', () => ({
  __esModule: true,
  default: ({ conversation: c }: { conversation: TChatConversation }) => (
    <div data-testid={`team-chat-slider-${c.id}`} />
  ),
}));

vi.mock('@/renderer/pages/cron', () => ({
  CronJobManager: () => <div data-testid='mock-cron' />,
}));

vi.mock('@/renderer/pages/conversation/Preview/context/PreviewContext', () => ({
  usePreviewContext: () => ({ closePreview: () => {}, closePreviewIfScopeChanged: () => {} }),
}));

import { ipcBridge } from '@/common';
import TeamPage from '@/renderer/pages/team/TeamPage';

describe('TeamPage teammate warmup wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    acpSelectorPropsBySlot.clear();
    restartPropsBySlot.clear();
    ensureSessionMock.mockReset();
    resetAgentContextMock.mockReset();
    restartTeamMemberMock.mockReset().mockResolvedValue(undefined);
    revalidateConfigOptionsMock.mockReset().mockResolvedValue(undefined);
    messageErrorMock.mockReset();
    modalConfirmMock.mockReset();
    layoutState.isMobile = false;
    for (const key of Object.keys(teamEventHandlers)) delete teamEventHandlers[key];
    getConversationOrNullMock.mockImplementation(async (id: string) => conversation({ id, name: id }));
    localStorage.clear();
  });

  it('withholds the trigger while the team is warming (isWarmingUp)', async () => {
    ensureSessionMock.mockReturnValue(new Promise<void>(() => {})); // never resolves -> stays 'warming'

    render(
      <MemoryRouter>
        <TeamPage team={team()} />
      </MemoryRouter>
    );

    await screen.findByTestId('acp-model-selector-member-conv');
    await waitFor(() => expect(acpSelectorPropsBySlot.get('member-conv')?.status).toBe('dormant'));
    expect(acpSelectorPropsBySlot.get('member-conv')?.trigger).toBeUndefined();
    expect(screen.getByRole('button', { name: 'team.agentActions.label' })).toBeInTheDocument();
  });

  it('wires the trigger to attachAgent once warming finishes, and reflects runtime status', async () => {
    ensureSessionMock.mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <TeamPage team={team()} />
      </MemoryRouter>
    );

    await screen.findByTestId('acp-model-selector-member-conv');
    await waitFor(() => expect(acpSelectorPropsBySlot.get('member-conv')?.trigger).toBeInstanceOf(Function));

    await act(async () => {
      await acpSelectorPropsBySlot.get('member-conv')!.trigger!();
    });
    expect(ipcBridge.team.attachAgent.invoke).toHaveBeenCalledWith({ team_id: 'team-1', slot_id: 'member-slot' });

    act(() => {
      for (const handler of teamEventHandlers.agentRuntimeStatusChanged ?? []) {
        handler({ team_id: 'team-1', slot_id: 'member-slot', conversation_id: 'member-conv', status: 'pending' });
      }
    });
    await waitFor(() => expect(acpSelectorPropsBySlot.get('member-conv')?.status).toBe('pending'));
    expect(screen.getByRole('button', { name: 'team.agentActions.label' })).toBeInTheDocument();

    act(() => {
      for (const handler of teamEventHandlers.agentRuntimeStatusChanged ?? []) {
        handler({ team_id: 'team-1', slot_id: 'member-slot', conversation_id: 'member-conv', status: 'ready' });
      }
    });
    await waitFor(() => expect(acpSelectorPropsBySlot.get('member-conv')?.status).toBe('ready'));

    act(() => {
      for (const handler of teamEventHandlers.agentRuntimeStatusChanged ?? []) {
        handler({ team_id: 'team-1', slot_id: 'member-slot', conversation_id: 'member-conv', status: 'failed' });
      }
    });
    await waitFor(() => expect(acpSelectorPropsBySlot.get('member-conv')?.status).toBe('failed'));
  });

  it('falls back to the server capability when the ready runtime event was missed', async () => {
    const user = userEvent.setup();
    ensureSessionMock.mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <TeamPage team={team()} />
      </MemoryRouter>
    );

    await waitFor(() => expect(acpSelectorPropsBySlot.get('member-conv')?.status).toBe('ready'));
    expect(restartPropsBySlot.get('leader-conv')).toMatchObject({ availability: 'ready', disabled: false });

    await user.click(screen.getByRole('button', { name: 'team.agentActions.label' }));
    const contextResetTitle = await screen.findByText('team.agentActions.contextReset.title');
    expect(contextResetTitle.closest('[role="menuitem"]')).not.toHaveClass('arco-dropdown-menu-disabled');
  });

  it('keeps the leader reconnect visible but disabled after idle cleanup', async () => {
    ensureSessionMock.mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <TeamPage team={team()} />
      </MemoryRouter>
    );
    await waitFor(() => expect(restartPropsBySlot.get('leader-conv')?.availability).toBe('ready'));

    act(() => {
      for (const handler of teamEventHandlers.sessionStatusChanged ?? []) {
        handler({ team_id: 'team-1', status: 'stopped' });
      }
    });

    await waitFor(() => {
      expect(restartPropsBySlot.get('leader-conv')).toMatchObject({
        availability: 'initializing',
        disabled: true,
        disabledReason: 'team.agentActions.disabled.sessionStopped',
      });
    });
  });

  it('shows the session-stopped reason for teammate actions after idle cleanup', async () => {
    const user = userEvent.setup();
    ensureSessionMock.mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <TeamPage team={team()} />
      </MemoryRouter>
    );
    await waitFor(() => expect(acpSelectorPropsBySlot.get('member-conv')?.status).toBe('ready'));

    act(() => {
      for (const handler of teamEventHandlers.sessionStatusChanged ?? []) {
        handler({ team_id: 'team-1', status: 'stopped' });
      }
    });
    await user.click(screen.getByRole('button', { name: 'team.agentActions.label' }));

    const contextResetTitle = await screen.findByText('team.agentActions.contextReset.title');
    expect(screen.getAllByText('team.agentActions.disabled.sessionStopped').length).toBeGreaterThan(0);
    expect(contextResetTitle.closest('[role="menuitem"]')).toHaveClass('arco-dropdown-menu-disabled');
  });

  it('re-enables the leader reconnect after the idle-cleaned session recovers', async () => {
    ensureSessionMock.mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <TeamPage team={team()} />
      </MemoryRouter>
    );
    await waitFor(() => expect(restartPropsBySlot.get('leader-conv')?.availability).toBe('ready'));

    act(() => {
      for (const handler of teamEventHandlers.sessionStatusChanged ?? []) {
        handler({ team_id: 'team-1', status: 'stopped' });
      }
    });
    await waitFor(() => expect(restartPropsBySlot.get('leader-conv')?.disabled).toBe(true));

    act(() => {
      for (const handler of teamEventHandlers.sessionStatusChanged ?? []) {
        handler({ team_id: 'team-1', status: 'starting' });
        handler({ team_id: 'team-1', status: 'ready' });
      }
    });

    await waitFor(() => {
      expect(restartPropsBySlot.get('leader-conv')).toMatchObject({ availability: 'ready', disabled: false });
    });
  });

  it('targets the selected teammate through the dedicated context-reset action', async () => {
    const user = userEvent.setup();
    ensureSessionMock.mockResolvedValue(undefined);
    resetAgentContextMock.mockResolvedValue({
      reset_status: 'completed',
      runtime_status: 'ready',
      preserved_unread_count: 2,
    });

    render(
      <MemoryRouter>
        <TeamPage team={team()} />
      </MemoryRouter>
    );
    await screen.findByTestId('acp-model-selector-member-conv');
    act(() => {
      for (const handler of teamEventHandlers.agentRuntimeStatusChanged ?? []) {
        handler({ team_id: 'team-1', slot_id: 'member-slot', conversation_id: 'member-conv', status: 'ready' });
      }
    });
    await waitFor(() => expect(acpSelectorPropsBySlot.get('member-conv')?.status).toBe('ready'));

    expect(screen.getByTestId('runtime-restart-leader-conv')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'team.agentActions.label' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'team.agentActions.label' }));
    const contextResetTitle = await screen.findByText('team.agentActions.contextReset.title');
    await waitFor(() => expect(getComputedStyle(contextResetTitle).pointerEvents).not.toBe('none'));
    await user.click(contextResetTitle);
    expect(modalConfirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'team.agentActions.contextReset.confirmTitle',
        content: 'team.agentActions.contextReset.confirmContent',
        okText: 'team.agentActions.contextReset.confirm',
      })
    );
    const onOk = modalConfirmMock.mock.calls.at(-1)?.[0]?.onOk as (() => Promise<void>) | undefined;
    expect(onOk).toBeTypeOf('function');
    await act(async () => onOk?.());

    await waitFor(() => {
      expect(resetAgentContextMock).toHaveBeenCalledWith({ team_id: 'team-1', slot_id: 'member-slot' });
    });
    expect(messageSuccessMock).toHaveBeenCalledWith('team.agentActions.contextReset.success');
    expect(revalidateConfigOptionsMock).toHaveBeenCalledWith('member-conv');
  });

  it('reports completed reset with failed restart as localized partial success', async () => {
    const user = userEvent.setup();
    ensureSessionMock.mockResolvedValue(undefined);
    resetAgentContextMock.mockResolvedValue({
      reset_status: 'completed',
      runtime_status: 'failed',
      preserved_unread_count: 0,
    });

    render(
      <MemoryRouter>
        <TeamPage team={team()} />
      </MemoryRouter>
    );
    await screen.findByTestId('acp-model-selector-member-conv');
    act(() => {
      for (const handler of teamEventHandlers.agentRuntimeStatusChanged ?? []) {
        handler({ team_id: 'team-1', slot_id: 'member-slot', conversation_id: 'member-conv', status: 'ready' });
      }
    });

    await user.click(screen.getByRole('button', { name: 'team.agentActions.label' }));
    const contextResetTitle = await screen.findByText('team.agentActions.contextReset.title');
    await waitFor(() => expect(getComputedStyle(contextResetTitle).pointerEvents).not.toBe('none'));
    await user.click(contextResetTitle);
    const onOk = modalConfirmMock.mock.calls.at(-1)?.[0]?.onOk as (() => Promise<void>) | undefined;
    await act(async () => onOk?.());

    expect(messageWarningMock).toHaveBeenCalledWith('team.agentActions.contextReset.partialSuccess');
    expect(messageSuccessMock).not.toHaveBeenCalledWith('team.agentActions.contextReset.success');
    expect(messageErrorMock).not.toHaveBeenCalled();
  });

  it('keeps unsupported teammate context reset visible with a localized disabled reason', async () => {
    const user = userEvent.setup();
    ensureSessionMock.mockResolvedValue(undefined);
    const unsupportedTeam = team();
    unsupportedTeam.assistants[1].context_reset = { supported: false, availability: 'unsupported' };

    render(
      <MemoryRouter>
        <TeamPage team={unsupportedTeam} />
      </MemoryRouter>
    );
    await screen.findByTestId('acp-model-selector-member-conv');
    await user.click(screen.getByRole('button', { name: 'team.agentActions.label' }));

    const contextResetTitle = await screen.findByText('team.agentActions.contextReset.title');
    expect(screen.getAllByText('team.agentActions.disabled.unsupported').length).toBeGreaterThan(0);
    expect(getComputedStyle(contextResetTitle).pointerEvents).toBe('none');
    expect(modalConfirmMock).not.toHaveBeenCalled();
  });

  it('uses the same teammate action menu on mobile', async () => {
    layoutState.isMobile = true;
    ensureSessionMock.mockResolvedValue(undefined);

    render(
      <MemoryRouter>
        <TeamPage team={team()} />
      </MemoryRouter>
    );

    expect(await screen.findByRole('button', { name: 'team.agentActions.label' })).toBeInTheDocument();
    expect(screen.getByTestId('runtime-restart-leader-conv')).toBeInTheDocument();
    expect(screen.queryByTestId('acp-model-selector-member-conv')).not.toBeInTheDocument();
  });
});

function conversation(overrides?: Partial<TChatConversation>): TChatConversation {
  return {
    id: 'conv-1',
    type: 'acp',
    name: 'Team conversation',
    created_at: 1,
    updated_at: 1,
    extra: {},
    ...overrides,
  } as TChatConversation;
}

function team(): TTeam {
  return {
    id: 'team-1',
    user_id: 'user-1',
    name: 'Warmup Team',
    workspace: '/tmp/team',
    workspace_mode: 'shared',
    leader_assistant_id: 'leader-assistant',
    created_at: 1,
    updated_at: 1,
    assistants: [
      {
        slot_id: 'leader-slot',
        conversation_id: 'leader-conv',
        role: 'leader',
        assistant_backend: 'codex',
        assistant_name: 'Leader',
        status: 'idle',
        context_reset: { supported: false, availability: 'leader_not_targetable' },
      },
      {
        slot_id: 'member-slot',
        conversation_id: 'member-conv',
        role: 'teammate',
        assistant_backend: 'codex',
        assistant_name: 'Member',
        status: 'idle',
        context_reset: { supported: true, availability: 'ready' },
      },
    ],
  };
}
