import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ITeamChildTurnEvent, ITeamRunAck, ITeamRunEvent, ITeamSlotWork } from '@/common/types/team/teamTypes';
import { useTeamRunView } from '@/renderer/pages/team/hooks/useTeamRunView';

type TeamRunHandler = (event: ITeamRunEvent) => void;
type ChildTurnHandler = (event: ITeamChildTurnEvent) => void;

const teamEventMocks = vi.hoisted(() => {
  const handlers: Record<string, unknown> = {};
  const makeOn = (name: string) =>
    vi.fn((handler: unknown) => {
      handlers[name] = handler;
      return vi.fn();
    });
  return {
    handlers,
    invoke: { getRunState: vi.fn() },
    on: {
      runAccepted: makeOn('runAccepted'),
      runStarted: makeOn('runStarted'),
      runUpdated: makeOn('runUpdated'),
      runCompleted: makeOn('runCompleted'),
      runCancelled: makeOn('runCancelled'),
      runFailed: makeOn('runFailed'),
      childTurnStarted: makeOn('childTurnStarted'),
      childTurnCompleted: makeOn('childTurnCompleted'),
      childTurnCancelled: makeOn('childTurnCancelled'),
      listChanged: makeOn('listChanged'),
      sessionChanged: makeOn('sessionChanged'),
      agentSpawned: makeOn('agentSpawned'),
      agentRemoved: makeOn('agentRemoved'),
      agentRenamed: makeOn('agentRenamed'),
      reconnected: makeOn('reconnected'),
    },
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    team: {
      getRunState: { invoke: teamEventMocks.invoke.getRunState },
      ...Object.fromEntries(
        Object.entries(teamEventMocks.on)
          .filter(([name]) => name !== 'reconnected')
          .map(([name, on]) => [name, { on }])
      ),
    },
    realtime: { reconnected: { on: teamEventMocks.on.reconnected } },
  },
}));

const slotWork = (slot_id: string, overrides: Partial<ITeamSlotWork> = {}): ITeamSlotWork => ({
  slot_id,
  role: slot_id === 'lead' ? 'lead' : 'teammate',
  state: 'queued',
  queued_foreground_count: 0,
  queued_background_count: 1,
  active_turn_id: null,
  active_turn_started_at_ms: null,
  active_turn_elapsed_ms: null,
  active_turn_slow: null,
  active_turn_slow_threshold_ms: null,
  blocked_reason: null,
  team_run_id: null,
  ...overrides,
});

const runEvent = (overrides: Partial<ITeamRunEvent> = {}): ITeamRunEvent => ({
  team_id: 'team-1',
  team_run_id: 'run-1',
  source: 'user_message',
  has_user_intervention: false,
  target_slot_id: 'lead',
  target_role: 'lead',
  status: 'running',
  queued_intent_count: 1,
  starting_batch_count: 0,
  running_batch_count: 1,
  active_enqueue_lease_count: 0,
  slot_work: [slotWork('lead', { state: 'running', team_run_id: 'run-1' })],
  ...overrides,
});

describe('useTeamRunView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    teamEventMocks.invoke.getRunState.mockResolvedValue({
      session_generation: null,
      active_run: null,
      slot_work: [],
    });
    for (const key of Object.keys(teamEventMocks.handlers)) delete teamEventMocks.handlers[key];
  });

  it('ack_applies_the_exact_core_run_snapshot', () => {
    const { result } = renderHook(() => useTeamRunView('team-1'));
    const run = runEvent({
      has_user_intervention: true,
      queued_intent_count: 3,
      slot_work: [slotWork('lead', { queued_foreground_count: 2, team_run_id: 'run-1' })],
    });
    const ack: ITeamRunAck = { enqueue_status: 'queued', message_id: 'message-1', run };

    act(() => result.current.applyAck(ack));

    expect(result.current.state.activeRun).toEqual(run);
    expect(result.current.state.slotWorkBySlot).toEqual({ lead: run.slot_work[0] });
  });

  it('terminal_event_clears_only_active_run_and_keeps_global_slot_work', () => {
    const { result } = renderHook(() => useTeamRunView('team-1'));
    const terminalWork = slotWork('worker', { queued_background_count: 2 });
    const runCompleted = teamEventMocks.handlers.runCompleted as TeamRunHandler;

    act(() => runCompleted(runEvent({ status: 'completed', slot_work: [terminalWork] })));

    expect(result.current.state.activeRun).toBeUndefined();
    expect(result.current.state.slotWorkBySlot).toEqual({ worker: terminalWork });
  });

  it('child_events_do_not_invent_slot_work_counts', () => {
    const { result } = renderHook(() => useTeamRunView('team-1'));
    const work = slotWork('worker', { queued_background_count: 4 });
    const runUpdated = teamEventMocks.handlers.runUpdated as TeamRunHandler;
    const childStarted = teamEventMocks.handlers.childTurnStarted as ChildTurnHandler;
    const childCompleted = teamEventMocks.handlers.childTurnCompleted as ChildTurnHandler;
    const child: ITeamChildTurnEvent = {
      team_id: 'team-1',
      team_run_id: 'run-1',
      slot_id: 'worker',
      role: 'teammate',
      conversation_id: 'conv-worker',
      turn_id: 'turn-worker',
      status: 'running',
    };

    act(() => runUpdated(runEvent({ slot_work: [work] })));
    act(() => childStarted(child));
    expect(result.current.state.slotWorkBySlot.worker).toEqual(work);
    act(() => childCompleted({ ...child, status: 'completed' }));
    expect(result.current.state.slotWorkBySlot.worker).toEqual(work);
  });

  it('reconnect_replaces_all_slot_work_from_snapshot', async () => {
    const { result } = renderHook(() => useTeamRunView('team-1'));
    const runUpdated = teamEventMocks.handlers.runUpdated as TeamRunHandler;
    act(() => runUpdated(runEvent({ slot_work: [slotWork('lead')] })));
    const replacement = slotWork('worker', { state: 'blocked', blocked_reason: 'runtime_starting' });
    teamEventMocks.invoke.getRunState.mockResolvedValue({
      session_generation: 'generation-2',
      active_run: null,
      slot_work: [replacement],
    });

    await act(async () => {
      (teamEventMocks.handlers.reconnected as () => void)();
    });

    await waitFor(() => expect(result.current.state.slotWorkBySlot).toEqual({ worker: replacement }));
    expect(result.current.state.activeRun).toBeUndefined();
  });

  it('background_slot_work_is_kept_without_an_active_run', async () => {
    const background = slotWork('worker', { queued_background_count: 2 });
    teamEventMocks.invoke.getRunState.mockResolvedValue({
      session_generation: 'generation-1',
      active_run: null,
      slot_work: [background],
    });

    const { result } = renderHook(() => useTeamRunView('team-1'));

    await waitFor(() => expect(result.current.state.slotWorkBySlot.worker).toEqual(background));
    expect(result.current.state.activeRun).toBeUndefined();
  });
});
