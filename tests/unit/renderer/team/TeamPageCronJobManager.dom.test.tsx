import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { TChatConversation } from '@/common/config/storage';
import type { TTeam } from '@/common/types/team/teamTypes';

const { getConversationOrNullMock, cronJobManagerMock, eventChannel } = vi.hoisted(() => ({
  getConversationOrNullMock: vi.fn(),
  cronJobManagerMock: vi.fn(),
  eventChannel: { on: vi.fn(() => () => {}) },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
    i18n: { language: 'en' },
  }),
}));

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
      removeAgent: { invoke: vi.fn() },
      pauseSlotWork: { invoke: vi.fn() },
      getRunState: { invoke: vi.fn(async () => ({ active_run: null })) },
      activeLease: { invoke: vi.fn(async () => ({ renewed_count: 2 })) },
      agentStatusChanged: eventChannel,
      agentSpawned: eventChannel,
      agentRemoved: eventChannel,
      agentRenamed: eventChannel,
      mcpStatus: eventChannel,
      taskChanged: eventChannel,
      sessionChanged: eventChannel,
      runAccepted: eventChannel,
      runStarted: eventChannel,
      runUpdated: eventChannel,
      runCompleted: eventChannel,
      runCancelled: eventChannel,
      runFailed: eventChannel,
      childTurnStarted: eventChannel,
      childTurnCompleted: eventChannel,
      childTurnCancelled: eventChannel,
      listChanged: eventChannel,
    },
    conversation: {
      confirmation: {
        list: { invoke: vi.fn(async () => []) },
        add: eventChannel,
        remove: eventChannel,
      },
    },
    realtime: {
      reconnected: eventChannel,
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
  default: ({ conversation }: { conversation: TChatConversation }) => (
    <div data-testid={`team-chat-view-${conversation.id}`} />
  ),
}));

vi.mock('@/renderer/pages/cron', () => ({
  CronJobManager: (props: { conversation_id: string; cron_job_id?: string }) => {
    cronJobManagerMock(props);
    return <div data-testid={`team-cron-job-manager-${props.conversation_id}`} />;
  },
}));

import TeamPage from '@/renderer/pages/team/TeamPage';

describe('TeamPage cron job manager', () => {
  beforeEach(() => {
    getConversationOrNullMock.mockReset();
    cronJobManagerMock.mockClear();
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
