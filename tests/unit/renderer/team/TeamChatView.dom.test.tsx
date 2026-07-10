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

import TeamChatView from '@/renderer/pages/team/components/TeamChatView';

describe('TeamChatView', () => {
  beforeEach(() => {
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
    ['session_stopped', 'The team session has stopped.', false],
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
});
