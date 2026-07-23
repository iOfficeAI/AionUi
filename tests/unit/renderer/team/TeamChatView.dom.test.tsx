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

vi.mock('@/common', () => ({
  ipcBridge: {
    team: {
      sendMessage: { invoke: vi.fn() },
      sendMessageToAgent: { invoke: vi.fn() },
      pauseSlotWork: { invoke: vi.fn() },
    },
    conversation: { update: { invoke: vi.fn() } },
  },
}));

import { ipcBridge } from '@/common';
import TeamChatView from '@/renderer/pages/team/components/TeamChatView';

describe('TeamChatView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePresetAssistantInfoMock.mockReset();
    acpChatMock.mockClear();
    aionrsChatMock.mockClear();
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

  it('renders the legacy read-only conversation for legacy types', async () => {
    usePresetAssistantInfoMock.mockReturnValue({ info: null });

    render(
      <TeamChatView
        conversation={{
          id: 'conv-1',
          type: 'openclaw-gateway',
          name: 'Legacy Gateway',
          created_at: Date.now(),
          updated_at: Date.now(),
          extra: {},
        }}
      />
    );

    expect(await screen.findByTestId('mock-legacy-conversation')).toBeInTheDocument();
    expect(acpChatMock).not.toHaveBeenCalled();
    expect(aionrsChatMock).not.toHaveBeenCalled();
  });

  it('returns null for unsupported conversation types', async () => {
    usePresetAssistantInfoMock.mockReturnValue({ info: null });

    render(
      <TeamChatView
        conversation={{
          id: 'conv-1',
          type: 'unknown',
          name: 'Unknown',
          created_at: Date.now(),
          updated_at: Date.now(),
          extra: {},
        }}
      />
    );

    expect(screen.queryByTestId('mock-acp-chat')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-aionrs-chat')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-legacy-conversation')).not.toBeInTheDocument();
  });

  it('does not build team runtime or empty slot when team_id is missing', async () => {
    usePresetAssistantInfoMock.mockReturnValue({ info: null });

    render(
      <TeamChatView
        conversation={{
          id: 'conv-1',
          type: 'acp',
          name: 'Team - Planner',
          created_at: Date.now(),
          updated_at: Date.now(),
          extra: { workspace: '/tmp' },
        }}
      />
    );

    expect(await screen.findByTestId('mock-acp-chat')).toBeInTheDocument();
    expect(acpChatMock.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        teamSendMessage: undefined,
        emptySlot: undefined,
        teamRuntime: undefined,
      })
    );
  });

  it('leader teamSendMessage invokes sendMessage and forwards the ack', async () => {
    usePresetAssistantInfoMock.mockReturnValue({ info: null });
    const ack = { team_run_id: 'run-1' };
    (ipcBridge.team.sendMessage.invoke as ReturnType<typeof vi.fn>).mockResolvedValue(ack);
    const onTeamRunAck = vi.fn();

    render(
      <TeamChatView
        team_id='team-1'
        slot_id='lead-slot'
        isLeader
        conversation={{
          id: 'conv-1',
          type: 'acp',
          name: 'Team Lead',
          created_at: Date.now(),
          updated_at: Date.now(),
          extra: { workspace: '/tmp' },
        }}
        onTeamRunAck={onTeamRunAck}
      />
    );

    expect(await screen.findByTestId('mock-acp-chat')).toBeInTheDocument();
    const callProps = acpChatMock.mock.calls[0]?.[0] as
      | {
          teamSendMessage: (payload: { input: string; files: string[] }) => Promise<void>;
        }
      | undefined;
    expect(callProps).toBeDefined();
    await callProps!.teamSendMessage({ input: 'hello team', files: [] });

    expect(ipcBridge.team.sendMessage.invoke).toHaveBeenCalledWith({
      team_id: 'team-1',
      input: 'hello team',
      files: [],
    });
    expect(ipcBridge.team.sendMessageToAgent.invoke).not.toHaveBeenCalled();
    expect(onTeamRunAck).toHaveBeenCalledWith(ack);
  });

  it('teammate teamSendMessage invokes sendMessageToAgent and forwards the ack', async () => {
    usePresetAssistantInfoMock.mockReturnValue({ info: null });
    const ack = { team_run_id: 'run-2' };
    (ipcBridge.team.sendMessageToAgent.invoke as ReturnType<typeof vi.fn>).mockResolvedValue(ack);
    const onTeamRunAck = vi.fn();

    render(
      <TeamChatView
        team_id='team-1'
        slot_id='worker-slot'
        isLeader={false}
        conversation={{
          id: 'conv-1',
          type: 'acp',
          name: 'Team Worker',
          created_at: Date.now(),
          updated_at: Date.now(),
          extra: { workspace: '/tmp' },
        }}
        onTeamRunAck={onTeamRunAck}
      />
    );

    expect(await screen.findByTestId('mock-acp-chat')).toBeInTheDocument();
    const callProps = acpChatMock.mock.calls[0]?.[0] as
      | {
          teamSendMessage: (payload: { input: string; files: string[] }) => Promise<void>;
        }
      | undefined;
    expect(callProps).toBeDefined();
    await callProps!.teamSendMessage({ input: 'agent task', files: ['file-1'] });

    expect(ipcBridge.team.sendMessageToAgent.invoke).toHaveBeenCalledWith({
      team_id: 'team-1',
      slot_id: 'worker-slot',
      input: 'agent task',
      files: ['file-1'],
    });
    expect(ipcBridge.team.sendMessage.invoke).not.toHaveBeenCalled();
    expect(onTeamRunAck).toHaveBeenCalledWith(ack);
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
});
