import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { TChatConversation } from '@/common/config/storage';
import type { TTeam } from '@/common/types/team/teamTypes';

const {
  getConversationOrNullMock,
  acpSelectorPropsBySlot,
  ensureSessionMock,
  teamEventHandlers,
  makeTeamEventChannel,
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
    ensureSessionMock: vi.fn(async () => undefined),
    teamEventHandlers: handlers,
    makeTeamEventChannel: makeChannel,
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
    Message: { success: vi.fn(), error: vi.fn(), useMessage: () => [null, null] },
  };
});

vi.mock('@/renderer/hooks/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/renderer/hooks/context/LayoutContext', () => ({ useLayoutContext: () => ({ isMobile: false }) }));

vi.mock('@/common', () => ({
  ipcBridge: {
    team: {
      get: { invoke: vi.fn() },
      renameTeam: { invoke: vi.fn() },
      addAgent: { invoke: vi.fn() },
      removeAgent: { invoke: vi.fn() },
      attachAgent: { invoke: vi.fn(async () => undefined) },
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

vi.mock('@/renderer/pages/conversation/platforms/aionrs/AionrsModelSelector', () => ({
  __esModule: true,
  default: () => <div data-testid='mock-aionrs-model-selector' />,
}));

vi.mock('@/renderer/pages/team/components/TeamChatView', () => ({
  __esModule: true,
  default: ({ conversation: c }: { conversation: TChatConversation }) => <div data-testid={`team-chat-view-${c.id}`} />,
}));

vi.mock('@/renderer/pages/cron', () => ({
  CronJobManager: () => <div data-testid='mock-cron' />,
}));

vi.mock('@/renderer/pages/conversation/Preview/context/PreviewContext', () => ({
  usePreviewContext: () => ({ closePreview: () => {}, closePreviewIfWorkspaceChanged: () => {} }),
}));

import { ipcBridge } from '@/common';
import TeamPage from '@/renderer/pages/team/TeamPage';

describe('TeamPage teammate warmup wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    acpSelectorPropsBySlot.clear();
    ensureSessionMock.mockReset();
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
      },
      {
        slot_id: 'member-slot',
        conversation_id: 'member-conv',
        role: 'teammate',
        assistant_backend: 'codex',
        assistant_name: 'Member',
        status: 'idle',
      },
    ],
  };
}
