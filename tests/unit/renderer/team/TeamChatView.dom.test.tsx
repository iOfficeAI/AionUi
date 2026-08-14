import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const usePresetAssistantInfoMock = vi.fn();
const acpChatMock = vi.fn(() => <div data-testid='mock-acp-chat' />);
const aionrsChatMock = vi.fn(() => <div data-testid='mock-aionrs-chat' />);

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

vi.mock('@/renderer/hooks/agent/usePresetAssistantInfo', () => ({
  usePresetAssistantInfo: (...args: unknown[]) => usePresetAssistantInfoMock(...args),
}));

vi.mock('@/renderer/pages/conversation/platforms/acp/AcpChat', () => ({
  __esModule: true,
  default: (props: unknown) => acpChatMock(props),
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/AionrsChat', () => ({
  __esModule: true,
  default: (props: unknown) => aionrsChatMock(props),
}));

vi.mock('@/renderer/pages/conversation/platforms/legacy/LegacyReadOnlyConversation', () => ({
  __esModule: true,
  default: () => <div data-testid='mock-legacy-conversation' />,
}));

const switchTabMock = vi.fn();
const teamTabsState = { activeSlotId: 'slot-a', switchTab: switchTabMock };
vi.mock('@/renderer/pages/team/hooks/TeamTabsContext', () => ({
  useTeamTabs: () => teamTabsState,
}));

import TeamChatView from '@/renderer/pages/team/components/TeamChatView';
import { ipcBridge } from '@/common';

describe('TeamChatView', () => {
  beforeEach(() => {
    usePresetAssistantInfoMock.mockReset();
    acpChatMock.mockClear();
    aionrsChatMock.mockClear();
    switchTabMock.mockClear();
    teamTabsState.activeSlotId = 'slot-a';
  });

  it('prefers preset assistant backend over legacy conversation extra backend', async () => {
    usePresetAssistantInfoMock.mockReturnValue({
      info: {
        name: 'Planner Assistant',
        logo: '📋',
        isEmoji: true,
        backend: 'codex',
      },
    });

    render(
      <TeamChatView
        conversation={{
          id: 'conv-1',
          type: 'acp',
          name: 'Team - Planner',
          created_at: Date.now(),
          updated_at: Date.now(),
          extra: {
            backend: 'claude',
            workspace: '/tmp',
          },
        }}
      />
    );

    expect(await screen.findByTestId('mock-acp-chat')).toBeInTheDocument();
    expect(acpChatMock).toHaveBeenCalled();
    expect(acpChatMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        backend: 'codex',
      })
    );
  });

  it('prefers preset assistant name over legacy conversation extra agent_name', async () => {
    usePresetAssistantInfoMock.mockReturnValue({
      info: {
        name: 'Planner Assistant',
        logo: '📋',
        isEmoji: true,
        backend: 'codex',
      },
    });

    render(
      <TeamChatView
        conversation={{
          id: 'conv-1',
          type: 'acp',
          name: 'Team - Planner',
          created_at: Date.now(),
          updated_at: Date.now(),
          extra: {
            agent_name: 'Legacy Runtime Name',
            backend: 'claude',
            workspace: '/tmp',
          },
        }}
      />
    );

    expect(await screen.findByTestId('mock-acp-chat')).toBeInTheDocument();
    expect(acpChatMock).toHaveBeenCalled();
    expect(acpChatMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        agent_name: 'Planner Assistant',
      })
    );
  });

  it('does not inject a Team orchestration clear command into the agent slash catalog', async () => {
    usePresetAssistantInfoMock.mockReturnValue({ info: null });

    render(
      <TeamChatView
        team_id='team-1'
        slot_id='worker-1'
        conversation={{
          id: 'conv-1',
          type: 'acp',
          name: 'Team member',
          created_at: Date.now(),
          updated_at: Date.now(),
          extra: { workspace: '/tmp' },
        }}
      />
    );

    expect(await screen.findByTestId('mock-acp-chat')).toBeInTheDocument();
    expect(acpChatMock.mock.calls[0]?.[0]).not.toHaveProperty('extraSlashCommands');
  });

  it('passes loaded skills and MCP snapshot to ACP team chat', async () => {
    usePresetAssistantInfoMock.mockReturnValue({ info: null });
    const mcpStatuses = [{ id: 'office', name: 'office', status: 'loaded' as const }];

    render(
      <TeamChatView
        conversation={{
          id: 'conv-1',
          type: 'acp',
          name: 'Team - Planner',
          created_at: Date.now(),
          updated_at: Date.now(),
          extra: {
            workspace: '/tmp',
            skills: ['excel'],
            mcp_servers: ['office'],
            mcp_statuses: mcpStatuses,
          },
        }}
      />
    );

    expect(await screen.findByTestId('mock-acp-chat')).toBeInTheDocument();
    expect(acpChatMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        loadedSkills: ['excel'],
        loadedMcpServers: ['office'],
        loadedMcpStatuses: mcpStatuses,
      })
    );
  });

  it('passes loaded skills and MCP snapshot to AionRS team chat', async () => {
    usePresetAssistantInfoMock.mockReturnValue({ info: null });
    const mcpStatuses = [{ id: 'office', name: 'office', status: 'loaded' as const }];

    render(
      <TeamChatView
        conversation={{
          id: 'conv-1',
          type: 'aionrs',
          name: 'Team - AionRS',
          created_at: Date.now(),
          updated_at: Date.now(),
          extra: {
            workspace: '/tmp',
            skills: ['excel'],
            mcp_servers: ['office'],
            mcp_statuses: mcpStatuses,
          },
          model: {
            id: 'provider-1',
            name: 'Provider',
            type: 'openai',
            api_key: '',
            api_base_url: '',
            use_model: 'model-1',
          },
        }}
      />
    );

    expect(await screen.findByTestId('mock-aionrs-chat')).toBeInTheDocument();
    expect(aionrsChatMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        loadedSkills: ['excel'],
        loadedMcpServers: ['office'],
        loadedMcpStatuses: mcpStatuses,
      })
    );
  });

  it.each([
    ['runtime_starting', 'Waiting for this assistant to start…', true],
    ['runtime_failed', 'This assistant failed to start.', false],
    ['removing', 'Removing this assistant…', false],
  ] as const)('maps %s to authoritative team runtime status', async (blockedReason, statusText, canSendMessage) => {
    usePresetAssistantInfoMock.mockReturnValue({ info: null });

    render(
      <TeamChatView
        team_id='team-1'
        slot_id='worker-1'
        conversation={{
          id: 'conv-1',
          type: 'acp',
          name: 'Team member',
          created_at: Date.now(),
          updated_at: Date.now(),
          extra: { workspace: '/tmp' },
        }}
        teamRunView={{
          activeRun: undefined,
          childTurnsBySlot: {},
          slotWorkBySlot: {
            'worker-1': {
              slot_id: 'worker-1',
              role: 'teammate',
              state: 'blocked',
              queued_foreground_count: 1,
              queued_background_count: 2,
              active_turn_id: null,
              active_turn_started_at_ms: null,
              active_turn_elapsed_ms: null,
              active_turn_slow: null,
              active_turn_slow_threshold_ms: null,
              blocked_reason: blockedReason,
              team_run_id: null,
            },
          },
        }}
      />
    );

    expect(await screen.findByTestId('mock-acp-chat')).toBeInTheDocument();
    expect(acpChatMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        teamRuntime: expect.objectContaining({
          statusText,
          queuedCount: 3,
          runtimeGate: expect.objectContaining({ canSendMessage, isProcessing: false }),
        }),
      })
    );
  });

  it('keeps sending open for a stale session_stopped slot', async () => {
    usePresetAssistantInfoMock.mockReturnValue({ info: null });

    render(
      <TeamChatView
        team_id='team-1'
        slot_id='worker-1'
        conversation={{
          id: 'conv-1',
          type: 'acp',
          name: 'Team member',
          created_at: Date.now(),
          updated_at: Date.now(),
          extra: { workspace: '/tmp' },
        }}
        teamRunView={{
          activeRun: undefined,
          childTurnsBySlot: {},
          slotWorkBySlot: {
            'worker-1': {
              slot_id: 'worker-1',
              role: 'teammate',
              state: 'blocked',
              queued_foreground_count: 1,
              queued_background_count: 2,
              active_turn_id: null,
              active_turn_started_at_ms: null,
              active_turn_elapsed_ms: null,
              active_turn_slow: null,
              active_turn_slow_threshold_ms: null,
              blocked_reason: 'session_stopped',
              team_run_id: null,
            },
          },
          sessionStopped: false,
        }}
      />
    );

    expect(await screen.findByTestId('mock-acp-chat')).toBeInTheDocument();
    expect(acpChatMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        teamRuntime: expect.objectContaining({
          statusText: 'The team session has stopped.',
          runtimeGate: expect.objectContaining({ canSendMessage: true, isProcessing: false }),
        }),
      })
    );
  });

  it('surfaces the stopped prompt and keeps sending open when sessionStopped flag is set', async () => {
    usePresetAssistantInfoMock.mockReturnValue({ info: null });

    render(
      <TeamChatView
        team_id='team-1'
        slot_id='worker-1'
        conversation={{
          id: 'conv-1',
          type: 'acp',
          name: 'Team member',
          created_at: Date.now(),
          updated_at: Date.now(),
          extra: { workspace: '/tmp' },
        }}
        teamRunView={{
          activeRun: undefined,
          childTurnsBySlot: {},
          slotWorkBySlot: {},
          sessionStopped: true,
        }}
      />
    );

    expect(await screen.findByTestId('mock-acp-chat')).toBeInTheDocument();
    expect(acpChatMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        teamRuntime: expect.objectContaining({
          statusText: 'The team session has stopped.',
          loading: false,
          runtimeGate: expect.objectContaining({ canSendMessage: true, isProcessing: false }),
        }),
      })
    );
  });

  it('exposes interrupt-and-send only while a teammate has an active turn', async () => {
    usePresetAssistantInfoMock.mockReturnValue({ info: null });
    const interruptSpy = vi.spyOn(ipcBridge.team.interruptAgent, 'invoke').mockResolvedValue({
      outcome: 'interrupted',
      interrupted_turn_id: 'turn-1',
      message_id: 'message-1',
      target: {
        slot_id: 'worker-1',
        role: 'teammate',
        state: 'queued',
        queued_foreground_count: 1,
        queued_background_count: 0,
        active_turn_id: null,
        active_turn_started_at_ms: null,
        active_turn_elapsed_ms: null,
        active_turn_slow: null,
        active_turn_slow_threshold_ms: null,
        blocked_reason: null,
        team_run_id: 'run-1',
      },
    });
    render(
      <TeamChatView
        team_id='team-1'
        slot_id='worker-1'
        conversation={{
          id: 'conv-1',
          type: 'acp',
          name: 'Team member',
          created_at: Date.now(),
          updated_at: Date.now(),
          extra: { workspace: '/tmp' },
        }}
        teamRunView={{
          activeRun: undefined,
          childTurnsBySlot: {},
          slotWorkBySlot: {
            'worker-1': {
              slot_id: 'worker-1',
              role: 'teammate',
              state: 'running',
              queued_foreground_count: 0,
              queued_background_count: 0,
              active_turn_id: 'turn-1',
              active_turn_started_at_ms: Date.now(),
              active_turn_elapsed_ms: 1,
              active_turn_slow: false,
              active_turn_slow_threshold_ms: 60_000,
              blocked_reason: null,
              team_run_id: 'run-1',
            },
          },
          sessionStopped: false,
        }}
      />
    );

    expect(await screen.findByTestId('mock-acp-chat')).toBeInTheDocument();
    expect(acpChatMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        teamRuntime: expect.objectContaining({ onInterruptSend: expect.any(Function) }),
      })
    );
    const props = acpChatMock.mock.calls[0]?.[0] as {
      teamRuntime: { onInterruptSend: (payload: { input: string; files: [] }) => Promise<void> };
    };
    await props.teamRuntime.onInterruptSend({ input: 'Use the correction', files: [] });
    expect(interruptSpy).toHaveBeenCalledWith({
      team_id: 'team-1',
      slot_id: 'worker-1',
      input: 'Use the correction',
      files: [],
      reason: 'leader_intervention',
      queued_policy: 'retain',
    });
  });

  it('marks teamRuntime.isActive true when slot matches activeSlotId and wires onFocus to switchTab', async () => {
    usePresetAssistantInfoMock.mockReturnValue({ info: { name: 'A', logo: '📋', isEmoji: true, backend: 'claude' } });
    teamTabsState.activeSlotId = 'slot-a';
    render(
      <TeamChatView
        team_id='team-1'
        slot_id='slot-a'
        conversation={{
          id: 'conv-a',
          type: 'acp',
          name: 'Team - A',
          created_at: Date.now(),
          updated_at: Date.now(),
          extra: { workspace: '/tmp' },
        }}
      />
    );
    await screen.findByTestId('mock-acp-chat');
    const props = acpChatMock.mock.calls[0]?.[0] as { teamRuntime?: { isActive?: boolean; onFocus?: () => void } };
    expect(props.teamRuntime?.isActive).toBe(true);
    props.teamRuntime?.onFocus?.();
    expect(switchTabMock).toHaveBeenCalledWith('slot-a');
  });

  it('marks teamRuntime.isActive false when slot does not match activeSlotId', async () => {
    usePresetAssistantInfoMock.mockReturnValue({ info: { name: 'B', logo: '📋', isEmoji: true, backend: 'claude' } });
    teamTabsState.activeSlotId = 'slot-a';
    render(
      <TeamChatView
        team_id='team-1'
        slot_id='slot-b'
        conversation={{
          id: 'conv-b',
          type: 'acp',
          name: 'Team - B',
          created_at: Date.now(),
          updated_at: Date.now(),
          extra: { workspace: '/tmp' },
        }}
      />
    );
    await screen.findByTestId('mock-acp-chat');
    const props = acpChatMock.mock.calls[0]?.[0] as { teamRuntime?: { isActive?: boolean } };
    expect(props.teamRuntime?.isActive).toBe(false);
  });
});
