import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { TChatConversation } from '@/common/config/storage';
import type { TTeam } from '@/common/types/team/teamTypes';

const { getConversationOrNullMock, cronJobManagerMock, ensureSessionMock, teamEventHandlers, makeTeamEventChannel } =
  vi.hoisted(() => {
    const handlers: Record<string, Array<(event: unknown) => void>> = {};
    const makeChannel = (name: string) => ({
      on: vi.fn((handler: (event: unknown) => void) => {
        handlers[name] = [...(handlers[name] ?? []), handler];
        return vi.fn();
      }),
    });
    return {
      getConversationOrNullMock: vi.fn(),
      cronJobManagerMock: vi.fn(),
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
    Message: {
      success: vi.fn(),
      error: vi.fn(),
      useMessage: () => [null, null],
    },
  };
});

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    team: {
      get: { invoke: vi.fn() },
      renameTeam: { invoke: vi.fn() },
      addAgent: { invoke: vi.fn() },
      removeAgent: { invoke: vi.fn() },
      pauseSlotWork: { invoke: vi.fn() },
      getRunState: {
        invoke: vi.fn(async () => ({ session_generation: null, active_run: null, slot_work: [] })),
      },
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
      listChanged: makeTeamEventChannel('listChanged'),
    },
    cron: {
      removeJob: { invoke: vi.fn() },
    },
    assistant: {
      list: { invoke: vi.fn(async () => []) },
    },
    conversation: {
      confirmation: {
        list: { invoke: vi.fn(async () => []) },
        add: makeTeamEventChannel('confirmationAdd'),
        remove: makeTeamEventChannel('confirmationRemove'),
      },
    },
    realtime: {
      reconnected: makeTeamEventChannel('reconnected'),
    },
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

vi.mock('@/renderer/components/agent/AcpModelSelector', () => ({
  __esModule: true,
  default: () => <div data-testid='mock-acp-model-selector' />,
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/AionrsModelSelector', () => ({
  __esModule: true,
  default: () => <div data-testid='mock-aionrs-model-selector' />,
}));

vi.mock('@/renderer/pages/team/components/TeamChatView', () => ({
  __esModule: true,
  default: ({ conversation: chatConversation }: { conversation: TChatConversation }) => (
    <div data-testid={`team-chat-view-${chatConversation.id}`} />
  ),
}));

vi.mock('@/renderer/pages/cron', () => ({
  CronJobManager: (props: { conversation_id: string; cron_job_id?: string }) => {
    cronJobManagerMock(props);
    return <div data-testid={`team-cron-job-manager-${props.conversation_id}`} />;
  },
}));

import { ipcBridge } from '@/common';
import TeamPage from '@/renderer/pages/team/TeamPage';

describe('TeamPage cron job manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConversationOrNullMock.mockReset();
    cronJobManagerMock.mockClear();
    ensureSessionMock.mockReset();
    ensureSessionMock.mockResolvedValue(undefined);
    for (const key of Object.keys(teamEventHandlers)) {
      delete teamEventHandlers[key];
    }
    vi.mocked(ipcBridge.cron.removeJob.invoke).mockResolvedValue(undefined);
    vi.mocked(ipcBridge.team.removeAgent.invoke).mockResolvedValue(undefined);
    localStorage.clear();
  });

  it('renders CronJobManager in the team member header when the member conversation has a cron job', async () => {
    getConversationOrNullMock.mockImplementation(async (conversationId: string) => {
      if (conversationId === 'leader-conv') return conversation({ id: conversationId, name: 'Leader' });
      if (conversationId === 'member-conv') {
        return conversation({
          id: conversationId,
          name: 'Member',
          extra: {
            team_id: 'team-1',
            cron_job_id: 'cron-member-1',
          },
        });
      }
      return null;
    });

    render(
      <MemoryRouter>
        <TeamPage team={team()} />
      </MemoryRouter>
    );

    expect(await screen.findByTestId('team-cron-job-manager-member-conv')).toBeInTheDocument();
    await waitFor(() =>
      expect(cronJobManagerMock).toHaveBeenCalledWith({
        conversation_id: 'member-conv',
        cron_job_id: 'cron-member-1',
      })
    );
  });

  // 移除成员的 cron 清理顺序（先删 cron job 再删成员）由 removeTeamAssistantWithCronCleanup.test.ts 直接覆盖；
  // 胶囊上的移除交互由 team-member-ops.e2e.ts 覆盖。移除入口已从抬头移到顶部胶囊。

  it('re-enables membership controls when ensureSession resolves after runtime pending events', async () => {
    let resolveEnsureSession: (() => void) | undefined;
    ensureSessionMock.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveEnsureSession = resolve;
      })
    );
    getConversationOrNullMock.mockImplementation(async (conversationId: string) =>
      conversation({ id: conversationId, name: conversationId })
    );

    render(
      <MemoryRouter>
        <TeamPage team={team()} />
      </MemoryRouter>
    );

    const addMember = await screen.findByTestId('team-tab-add-member');
    expect(addMember).toBeDisabled();

    act(() => {
      for (const handler of teamEventHandlers.agentRuntimeStatusChanged ?? []) {
        handler({
          team_id: 'team-1',
          slot_id: 'member-slot',
          conversation_id: 'member-conv',
          status: 'pending',
        });
      }
    });

    await act(async () => {
      resolveEnsureSession?.();
    });

    await waitFor(() => expect(screen.getByTestId('team-tab-add-member')).not.toBeDisabled());
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
    name: 'Cron Team',
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
