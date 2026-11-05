import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { SWRConfig } from 'swr';
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
  setLeadMock,
  stopConversationMock,
  refreshConversationCacheMock,
  swrCache,
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
    setLeadMock: vi.fn(),
    stopConversationMock: vi.fn(),
    refreshConversationCacheMock: vi.fn(),
    // Explicit SWR cache so the lead-transfer suite can assert the mutated team
    // payload instead of inferring it from conversation-cache side effects.
    swrCache: new Map<string, { data?: unknown }>(),
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
      setLead: { invoke: (...args: unknown[]) => setLeadMock(...args) },
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
      stop: { invoke: (...args: unknown[]) => stopConversationMock(...args) },
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
  refreshConversationCache: (...args: unknown[]) => refreshConversationCacheMock(...args),
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
import { BackendHttpError } from '@/common/adapter/httpBridge';
import TeamPage from '@/renderer/pages/team/TeamPage';

// Shared by every TeamPage suite below: the page reads layout, auth, warmup and
// membership state from module-level mocks, so each test must start from the
// same baseline instead of inheriting the previous test's leftovers.
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
  setLeadMock.mockReset().mockResolvedValue(undefined);
  stopConversationMock.mockReset().mockResolvedValue(undefined);
  refreshConversationCacheMock.mockReset().mockResolvedValue(undefined);
  swrCache.clear();
  layoutState.isMobile = false;
  for (const key of Object.keys(teamEventHandlers)) delete teamEventHandlers[key];
  getConversationOrNullMock.mockImplementation(async (id: string) => conversation({ id, name: id }));
  localStorage.clear();
});

describe('TeamPage teammate warmup wiring', () => {
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

describe('TeamPage lead transfer', () => {
  const renderPage = async () => {
    // Resolving ensureSession is the real warmup-complete signal; lead transfer
    // stays disabled until this lands.
    ensureSessionMock.mockResolvedValue(undefined);
    render(
      <MemoryRouter>
        <SWRConfig value={{ provider: () => swrCache, dedupingInterval: 0 }}>
          <TeamPage team={team()} />
        </SWRConfig>
      </MemoryRouter>
    );
    await screen.findByTestId('acp-model-selector-member-conv');
    await waitFor(() => expect(acpSelectorPropsBySlot.get('member-conv')?.trigger).toBeInstanceOf(Function));
    return swrCache;
  };

  const openLeadMenu = async () => {
    fireEvent.contextMenu(await screen.findByTestId('team-tab-member-slot'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Make team lead' }));
  };

  const busyConflict = () =>
    new BackendHttpError({
      method: 'POST',
      path: '/api/teams/team-1/lead',
      status: 409,
      body: {
        code: 'TEAM_LEAD_TRANSFER_BUSY',
        error: 'Team lead transfer is blocked by active work',
        details: {
          team_id: 'team-1',
          busy_members: [{ slot_id: 'member-slot', conversation_id: 'member-conv', turn_id: 'turn-member' }],
        },
      },
    });

  it('refreshes the team and each member conversation cache after a successful lead change', async () => {
    const swapped = team();
    swapped.assistants = [
      { ...swapped.assistants[1], role: 'leader' },
      { ...swapped.assistants[0], role: 'teammate' },
    ];
    setLeadMock.mockImplementation(async () => swapped);
    const cache = await renderPage();
    await openLeadMenu();
    fireEvent.click(await screen.findByRole('button', { name: 'Change lead' }));

    await waitFor(() => expect(setLeadMock).toHaveBeenCalledWith({ team_id: 'team-1', slot_id: 'member-slot' }));
    // Real evidence that the callback committed the IPC payload to the team
    // cache (`mutateTeam(updatedTeam, false)`) rather than only refreshing chats.
    await waitFor(() => expect(cache.get('team/team-1')?.data).toEqual(swapped));
    await waitFor(() => expect(refreshConversationCacheMock).toHaveBeenCalledWith('leader-conv'));
    expect(refreshConversationCacheMock).toHaveBeenCalledWith('member-conv');
  });

  it('does not refresh any conversation cache when the lead change fails', async () => {
    setLeadMock.mockImplementation(async () => {
      throw new Error('lead change failed');
    });
    await renderPage();
    await openLeadMenu();
    fireEvent.click(await screen.findByRole('button', { name: 'Change lead' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't change the team lead. Please try again.");
    expect(refreshConversationCacheMock).not.toHaveBeenCalled();
    expect(swrCache.get('team/team-1')?.data).toBeUndefined();
  });

  it('offers no lead-transfer action while the team is still warming, so no request is sent', async () => {
    // Never-resolving ensure keeps the page in the warming phase.
    ensureSessionMock.mockReturnValue(new Promise<void>(() => {}));
    render(
      <MemoryRouter>
        <TeamPage team={team()} />
      </MemoryRouter>
    );
    const tab = await screen.findByTestId('team-tab-member-slot');
    fireEvent.contextMenu(tab);

    expect(screen.queryByRole('menuitem', { name: 'Make team lead' })).not.toBeInTheDocument();
    expect(setLeadMock).not.toHaveBeenCalled();
  });

  it('offers no lead-transfer action while membership is busy, so no request is sent', async () => {
    await renderPage();
    act(() => {
      for (const handler of teamEventHandlers.sessionStatusChanged ?? []) {
        handler({ team_id: 'team-1', status: 'starting' });
      }
    });

    fireEvent.contextMenu(screen.getByTestId('team-tab-member-slot'));
    expect(screen.queryByRole('menuitem', { name: 'Make team lead' })).not.toBeInTheDocument();
    expect(setLeadMock).not.toHaveBeenCalled();
  });

  it('asks to interrupt instead of refreshing when active work blocks the transfer', async () => {
    setLeadMock.mockImplementation(async () => {
      throw busyConflict();
    });
    await renderPage();
    await openLeadMenu();
    fireEvent.click(await screen.findByRole('button', { name: 'Change lead' }));

    expect(await screen.findByText('Interrupt current work and change team lead?')).toBeInTheDocument();
    expect(setLeadMock).toHaveBeenCalledTimes(1);
    expect(refreshConversationCacheMock).not.toHaveBeenCalled();
  });

  it('stops the confirmed active turn, retries once, then refreshes the caches', async () => {
    setLeadMock.mockImplementationOnce(async () => {
      throw busyConflict();
    });
    setLeadMock.mockImplementationOnce(async () => team());
    await renderPage();
    await openLeadMenu();
    fireEvent.click(await screen.findByRole('button', { name: 'Change lead' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Interrupt and change lead' }));

    await waitFor(() =>
      expect(stopConversationMock).toHaveBeenCalledWith({ conversation_id: 'member-conv', turn_id: 'turn-member' })
    );
    expect(setLeadMock).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(refreshConversationCacheMock).toHaveBeenCalledWith('member-conv'));
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
