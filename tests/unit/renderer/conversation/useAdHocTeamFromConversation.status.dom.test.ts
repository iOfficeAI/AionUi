import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAdHocTeamFromConversation } from '@/renderer/pages/conversation/hooks/useAdHocTeamFromConversation';
import type { TTeam, TeamAssistant } from '@/common/types/team/teamTypes';
import type { ITeamTeammateMessageEvent } from '@/common/types/team/teamTypes';

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
  runAccepted: undefined as ((event: import('@/common/types/team/teamTypes').ITeamRunEvent) => void) | undefined,
  runStarted: undefined as ((event: import('@/common/types/team/teamTypes').ITeamRunEvent) => void) | undefined,
  runUpdated: undefined as ((event: import('@/common/types/team/teamTypes').ITeamRunEvent) => void) | undefined,
  runCompleted: undefined as ((event: import('@/common/types/team/teamTypes').ITeamRunEvent) => void) | undefined,
  runCancelled: undefined as ((event: import('@/common/types/team/teamTypes').ITeamRunEvent) => void) | undefined,
  runFailed: undefined as ((event: import('@/common/types/team/teamTypes').ITeamRunEvent) => void) | undefined,
  childTurnStarted: undefined as
    | ((event: import('@/common/types/team/teamTypes').ITeamChildTurnEvent) => void)
    | undefined,
  childTurnCompleted: undefined as
    | ((event: import('@/common/types/team/teamTypes').ITeamChildTurnEvent) => void)
    | undefined,
  childTurnCancelled: undefined as
    | ((event: import('@/common/types/team/teamTypes').ITeamChildTurnEvent) => void)
    | undefined,
  taskChanged: undefined as
    | ((event: import('@/common/types/team/teamTypes').ITeamTaskChangedEvent) => void)
    | undefined,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    team: {
      fromConversation: adHocMocks.fromConversation,
      getByConversation: adHocMocks.getByConversation,
      get: adHocMocks.get,
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
      teammateMessage: {
        on: vi.fn((handler: (event: ITeamTeammateMessageEvent) => void) => {
          eventHandlers.teammateMessage = handler;
          return vi.fn();
        }),
      },
      sessionChanged: {
        on: vi.fn((handler: (event: { team_id: string }) => void) => {
          eventHandlers.sessionChanged = handler;
          return vi.fn();
        }),
      },
      getRunState: adHocMocks.getRunState,
      runAccepted: {
        on: vi.fn((handler: (event: import('@/common/types/team/teamTypes').ITeamRunEvent) => void) => {
          eventHandlers.runAccepted = handler;
          return vi.fn();
        }),
      },
      runStarted: {
        on: vi.fn((handler: (event: import('@/common/types/team/teamTypes').ITeamRunEvent) => void) => {
          eventHandlers.runStarted = handler;
          return vi.fn();
        }),
      },
      runUpdated: {
        on: vi.fn((handler: (event: import('@/common/types/team/teamTypes').ITeamRunEvent) => void) => {
          eventHandlers.runUpdated = handler;
          return vi.fn();
        }),
      },
      runCompleted: {
        on: vi.fn((handler: (event: import('@/common/types/team/teamTypes').ITeamRunEvent) => void) => {
          eventHandlers.runCompleted = handler;
          return vi.fn();
        }),
      },
      runCancelled: {
        on: vi.fn((handler: (event: import('@/common/types/team/teamTypes').ITeamRunEvent) => void) => {
          eventHandlers.runCancelled = handler;
          return vi.fn();
        }),
      },
      runFailed: {
        on: vi.fn((handler: (event: import('@/common/types/team/teamTypes').ITeamRunEvent) => void) => {
          eventHandlers.runFailed = handler;
          return vi.fn();
        }),
      },
      childTurnStarted: {
        on: vi.fn((handler: (event: import('@/common/types/team/teamTypes').ITeamChildTurnEvent) => void) => {
          eventHandlers.childTurnStarted = handler;
          return vi.fn();
        }),
      },
      childTurnCompleted: {
        on: vi.fn((handler: (event: import('@/common/types/team/teamTypes').ITeamChildTurnEvent) => void) => {
          eventHandlers.childTurnCompleted = handler;
          return vi.fn();
        }),
      },
      childTurnCancelled: {
        on: vi.fn((handler: (event: import('@/common/types/team/teamTypes').ITeamChildTurnEvent) => void) => {
          eventHandlers.childTurnCancelled = handler;
          return vi.fn();
        }),
      },
      taskChanged: {
        on: vi.fn((handler: (event: import('@/common/types/team/teamTypes').ITeamTaskChangedEvent) => void) => {
          eventHandlers.taskChanged = handler;
          return vi.fn();
        }),
      },
    },
  },
}));

function mockTeam(overrides?: Partial<TTeam>): TTeam {
  return {
    id: 'team-1',
    user_id: 'user-1',
    name: 'Ad-hoc Team',
    workspace: '/tmp/team',
    workspace_mode: 'shared',
    leader_assistant_id: 'leader-1',
    assistants: [
      mockAssistant({ slot_id: 'slot-lead', role: 'leader', assistant_name: 'Leader' }),
      mockAssistant({ slot_id: 'slot-a', role: 'teammate', assistant_name: 'Teammate A' }),
    ],
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

describe('useAdHocTeamFromConversation status summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adHocMocks.getByConversation.invoke.mockResolvedValue({
      team_id: 'team-1',
      origin_conversation_id: 'conv-1',
      status: 'active',
    });
    adHocMocks.get.invoke.mockResolvedValue(mockTeam());
  });

  it('loads team summary with member list after association is fetched', async () => {
    const { result } = renderHook(() => useAdHocTeamFromConversation('conv-1', 'user-1'));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.team).toEqual(mockTeam());
    expect(result.current.teammates).toHaveLength(2);
    expect(result.current.lastTeammateMessage).toBeNull();
    expect(result.current.unreadTeammateMessageCount).toBe(0);
  });

  it('refetches association when the linked team is removed', async () => {
    adHocMocks.getByConversation.invoke.mockResolvedValueOnce({
      team_id: 'team-1',
      origin_conversation_id: 'conv-1',
      status: 'active',
    });
    adHocMocks.getByConversation.invoke.mockResolvedValueOnce(null);

    const { result } = renderHook(() => useAdHocTeamFromConversation('conv-1', 'user-1'));
    await waitFor(() => expect(result.current.association?.team_id).toBe('team-1'));

    act(() => eventHandlers.removed?.({ team_id: 'team-1' }));

    await waitFor(() => expect(result.current.association).toBeNull());
    expect(adHocMocks.getByConversation.invoke).toHaveBeenCalledTimes(2);
  });

  it('refetches association when the linked team is renamed', async () => {
    adHocMocks.getByConversation.invoke.mockResolvedValue({
      team_id: 'team-1',
      origin_conversation_id: 'conv-1',
      status: 'active',
    });
    adHocMocks.get.invoke.mockResolvedValueOnce(mockTeam({ name: 'Old Name' }));
    adHocMocks.get.invoke.mockResolvedValueOnce(mockTeam({ name: 'Renamed Team' }));

    const { result } = renderHook(() => useAdHocTeamFromConversation('conv-1', 'user-1'));
    await waitFor(() => expect(result.current.team?.name).toBe('Old Name'));

    act(() => eventHandlers.renamed?.({ team_id: 'team-1' }));

    await waitFor(() => expect(result.current.team?.name).toBe('Renamed Team'));
  });

  it('refetches team summary when the team session changes', async () => {
    const { result } = renderHook(() => useAdHocTeamFromConversation('conv-1', 'user-1'));
    await waitFor(() => expect(result.current.association?.team_id).toBe('team-1'));

    act(() => eventHandlers.sessionChanged?.({ team_id: 'team-1' }));

    await waitFor(() => expect(adHocMocks.get.invoke).toHaveBeenCalledTimes(2));
  });

  it('ignores events from unrelated teams', async () => {
    const { result } = renderHook(() => useAdHocTeamFromConversation('conv-1', 'user-1'));
    await waitFor(() => expect(result.current.team?.name).toBe('Ad-hoc Team'));

    act(() => eventHandlers.renamed?.({ team_id: 'team-other' }));
    act(() => eventHandlers.agentStatusChanged?.({ team_id: 'team-other' }));
    act(() => eventHandlers.sessionChanged?.({ team_id: 'team-other' }));

    await waitFor(() => expect(adHocMocks.get.invoke).toHaveBeenCalledTimes(1));
    expect(result.current.team?.name).toBe('Ad-hoc Team');
  });

  it('resets team state when association is removed', async () => {
    adHocMocks.getByConversation.invoke.mockResolvedValueOnce({
      team_id: 'team-1',
      origin_conversation_id: 'conv-1',
      status: 'active',
    });
    adHocMocks.getByConversation.invoke.mockResolvedValueOnce(null);

    const { result } = renderHook(() => useAdHocTeamFromConversation('conv-1', 'user-1'));
    await waitFor(() => expect(result.current.team).not.toBeNull());

    act(() => eventHandlers.removed?.({ team_id: 'team-1' }));

    await waitFor(() => expect(result.current.team).toBeNull());
    await waitFor(() => expect(result.current.teammates).toHaveLength(0));
  });

  it('clears unread teammate messages', async () => {
    const team = mockTeam();
    adHocMocks.get.invoke.mockResolvedValue(team);
    const { result } = renderHook(() => useAdHocTeamFromConversation('conv-1', 'user-1'));
    await waitFor(() => expect(result.current.association?.team_id).toBe('team-1'));

    act(() =>
      eventHandlers.teammateMessage?.({
        conversation_id: 'conv-member',
        content: 'Hello',
        from_slot_id: 'slot-a',
        from_name: 'Teammate A',
      })
    );

    expect(result.current.unreadTeammateMessageCount).toBe(1);

    act(() => result.current.clearUnreadTeammateMessages());

    expect(result.current.unreadTeammateMessageCount).toBe(0);
  });

  it('tracks unread teammate messages and exposes the latest message', async () => {
    const team = mockTeam();
    adHocMocks.get.invoke.mockResolvedValue(team);
    const { result } = renderHook(() => useAdHocTeamFromConversation('conv-1', 'user-1'));
    await waitFor(() => expect(result.current.association?.team_id).toBe('team-1'));

    const messageEvent: ITeamTeammateMessageEvent = {
      conversation_id: 'conv-member',
      content: 'Hello from teammate',
      from_slot_id: 'slot-a',
      from_name: 'Teammate A',
    };

    act(() => eventHandlers.teammateMessage?.(messageEvent));

    expect(result.current.unreadTeammateMessageCount).toBe(1);
    expect(result.current.lastTeammateMessage).toEqual({ ...messageEvent, team_id: 'team-1' });

    act(() => eventHandlers.teammateMessage?.({ ...messageEvent, content: 'Second message' }));

    expect(result.current.unreadTeammateMessageCount).toBe(2);
  });
});

function mockRunEvent(
  overrides?: Partial<import('@/common/types/team/teamTypes').ITeamRunEvent>
): import('@/common/types/team/teamTypes').ITeamRunEvent {
  return {
    team_id: 'team-1',
    team_run_id: 'run-1',
    source: 'user_message',
    has_user_intervention: false,
    target_slot_id: 'slot-lead',
    target_role: 'lead',
    status: 'running',
    queued_intent_count: 0,
    starting_batch_count: 0,
    running_batch_count: 1,
    active_enqueue_lease_count: 1,
    slot_work: [
      mockSlotWork({ slot_id: 'slot-lead', role: 'lead', state: 'running', active_turn_id: 'turn-1' }),
      mockSlotWork({ slot_id: 'slot-a', role: 'teammate' }),
    ],
    ...overrides,
  };
}

function mockSlotWork(
  overrides?: Partial<import('@/common/types/team/teamTypes').ITeamSlotWork>
): import('@/common/types/team/teamTypes').ITeamSlotWork {
  return {
    slot_id: 'slot-1',
    role: 'teammate',
    state: 'idle',
    queued_foreground_count: 0,
    queued_background_count: 0,
    active_turn_id: null,
    active_turn_started_at_ms: null,
    active_turn_elapsed_ms: null,
    active_turn_slow: null,
    active_turn_slow_threshold_ms: null,
    blocked_reason: null,
    team_run_id: null,
    ...overrides,
  };
}

function mockChildTurnEvent(
  overrides?: Partial<import('@/common/types/team/teamTypes').ITeamChildTurnEvent>
): import('@/common/types/team/teamTypes').ITeamChildTurnEvent {
  return {
    team_id: 'team-1',
    team_run_id: 'run-1',
    slot_id: 'slot-a',
    role: 'teammate',
    conversation_id: 'conv-member',
    turn_id: 'turn-a-1',
    status: 'running',
    ...overrides,
  };
}

describe('useAdHocTeamFromConversation run state bidirectional sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adHocMocks.getByConversation.invoke.mockResolvedValue({
      team_id: 'team-1',
      origin_conversation_id: 'conv-1',
      status: 'active',
    });
    adHocMocks.get.invoke.mockResolvedValue(mockTeam());
    adHocMocks.getRunState.invoke.mockResolvedValue({
      session_generation: 'gen-1',
      active_run: null,
      slot_work: [],
    });
  });

  it('derives isTeamRunning=false when no run event has arrived', async () => {
    const { result } = renderHook(() => useAdHocTeamFromConversation('conv-1', 'user-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isTeamRunning).toBe(false);
    expect(result.current.activeRun).toBeUndefined();
    expect(result.current.slotWorkBySlot).toEqual({});
  });

  it('derives isTeamRunning=true and exposes activeRun and slotWork when runStarted fires', async () => {
    adHocMocks.getRunState.invoke.mockResolvedValue({
      session_generation: 'gen-1',
      active_run: mockRunEvent({ status: 'running' }),
      slot_work: [
        mockSlotWork({ slot_id: 'slot-lead', role: 'lead', state: 'running', active_turn_id: 'turn-1' }),
        mockSlotWork({ slot_id: 'slot-a', role: 'teammate', state: 'idle' }),
      ],
    });

    const { result } = renderHook(() => useAdHocTeamFromConversation('conv-1', 'user-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => eventHandlers.runStarted?.(mockRunEvent({ status: 'running' })));
    await waitFor(() => expect(result.current.isTeamRunning).toBe(true));

    expect(result.current.activeRun?.team_run_id).toBe('run-1');
    expect(result.current.activeRun?.status).toBe('running');
    expect(result.current.slotWorkBySlot['slot-lead']?.state).toBe('running');
    expect(result.current.slotWorkBySlot['slot-a']?.state).toBe('idle');
  });

  it('reconciles run state from getRunState after a non-terminal run event', async () => {
    adHocMocks.getRunState.invoke.mockResolvedValue({
      session_generation: 'gen-1',
      active_run: mockRunEvent({ status: 'running' }),
      slot_work: [mockSlotWork({ slot_id: 'slot-lead', role: 'lead', state: 'running' })],
    });

    const { result } = renderHook(() => useAdHocTeamFromConversation('conv-1', 'user-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => eventHandlers.runAccepted?.(mockRunEvent({ status: 'accepted' })));
    await waitFor(() => expect(adHocMocks.getRunState.invoke).toHaveBeenCalledWith({ team_id: 'team-1' }));
    await waitFor(() => expect(result.current.isTeamRunning).toBe(true));
    expect(result.current.activeRun?.status).toBe('running');
  });

  it('clears run state when the run reaches a terminal status', async () => {
    const { result } = renderHook(() => useAdHocTeamFromConversation('conv-1', 'user-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => eventHandlers.runStarted?.(mockRunEvent({ status: 'running' })));
    await waitFor(() => expect(result.current.isTeamRunning).toBe(true));

    act(() => eventHandlers.runCompleted?.(mockRunEvent({ status: 'completed' })));
    await waitFor(() => expect(result.current.isTeamRunning).toBe(false));
    expect(result.current.activeRun).toBeUndefined();
  });

  it('tracks child turns by slot during active run', async () => {
    const { result } = renderHook(() => useAdHocTeamFromConversation('conv-1', 'user-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => eventHandlers.runStarted?.(mockRunEvent({ status: 'running' })));
    act(() => eventHandlers.childTurnStarted?.(mockChildTurnEvent({ slot_id: 'slot-a', turn_id: 'turn-a-1' })));

    await waitFor(() => expect(result.current.childTurnsBySlot?.['slot-a']?.turn_id).toBe('turn-a-1'));
  });

  it('removes child turn when childTurnCompleted fires', async () => {
    const { result } = renderHook(() => useAdHocTeamFromConversation('conv-1', 'user-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => eventHandlers.runStarted?.(mockRunEvent({ status: 'running' })));
    act(() => eventHandlers.childTurnStarted?.(mockChildTurnEvent({ slot_id: 'slot-a', turn_id: 'turn-a-1' })));
    await waitFor(() => expect(result.current.childTurnsBySlot?.['slot-a']).toBeDefined());

    act(() =>
      eventHandlers.childTurnCompleted?.(
        mockChildTurnEvent({ slot_id: 'slot-a', turn_id: 'turn-a-1', status: 'completed' })
      )
    );
    await waitFor(() => expect(result.current.childTurnsBySlot?.['slot-a']).toBeUndefined());
  });

  it('refetches team summary on taskChanged events for the linked team', async () => {
    const { result } = renderHook(() => useAdHocTeamFromConversation('conv-1', 'user-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => eventHandlers.taskChanged?.({ team_id: 'team-1', task_id: 'task-1', action: 'created' }));

    await waitFor(() => expect(adHocMocks.get.invoke).toHaveBeenCalledTimes(2));
  });

  it('ignores run and task events from unrelated teams', async () => {
    const { result } = renderHook(() => useAdHocTeamFromConversation('conv-1', 'user-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => eventHandlers.runStarted?.(mockRunEvent({ team_id: 'team-other', team_run_id: 'run-other' })));
    act(() => eventHandlers.taskChanged?.({ team_id: 'team-other', task_id: 'task-1' }));

    expect(result.current.isTeamRunning).toBe(false);
    expect(adHocMocks.get.invoke).toHaveBeenCalledTimes(1);
  });

  it('resets run state when association is removed (team disbanded)', async () => {
    adHocMocks.getByConversation.invoke.mockResolvedValueOnce({
      team_id: 'team-1',
      origin_conversation_id: 'conv-1',
      status: 'active',
    });
    adHocMocks.getByConversation.invoke.mockResolvedValueOnce(null);

    const { result } = renderHook(() => useAdHocTeamFromConversation('conv-1', 'user-1'));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => eventHandlers.runStarted?.(mockRunEvent({ status: 'running' })));
    await waitFor(() => expect(result.current.isTeamRunning).toBe(true));

    act(() => eventHandlers.removed?.({ team_id: 'team-1' }));

    await waitFor(() => expect(result.current.association).toBeNull());
    await waitFor(() => expect(result.current.isTeamRunning).toBe(false));
    expect(result.current.activeRun).toBeUndefined();
    expect(result.current.childTurnsBySlot).toEqual({});
  });
});
