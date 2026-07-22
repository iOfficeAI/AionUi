/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TTeam } from '@/common/types/team/teamTypes';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const { makeEventChannel } = vi.hoisted(() => {
  const makeChannel = (name: string) => ({
    on: vi.fn(() => vi.fn()),
  });
  return { makeEventChannel: makeChannel };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    team: {
      get: { invoke: vi.fn() },
      renameTeam: { invoke: vi.fn() },
      addAgent: { invoke: vi.fn() },
      removeAgent: { invoke: vi.fn() },
      getRunState: {
        invoke: vi.fn(async () => ({ session_generation: null, active_run: null, slot_work: [] })),
      },
      activeLease: { invoke: vi.fn(async () => ({})) },
      ensureSession: { invoke: vi.fn(async () => undefined) },
      agentStatusChanged: makeEventChannel('agentStatusChanged'),
      agentSpawned: makeEventChannel('agentSpawned'),
      agentRemoved: makeEventChannel('agentRemoved'),
      agentRenamed: makeEventChannel('agentRenamed'),
      agentRuntimeStatusChanged: makeEventChannel('agentRuntimeStatusChanged'),
      sessionStatusChanged: makeEventChannel('sessionStatusChanged'),
      taskChanged: makeEventChannel('taskChanged'),
      sessionChanged: makeEventChannel('sessionChanged'),
      runAccepted: makeEventChannel('runAccepted'),
      runStarted: makeEventChannel('runStarted'),
      runUpdated: makeEventChannel('runUpdated'),
      runCompleted: makeEventChannel('runCompleted'),
      runCancelled: makeEventChannel('runCancelled'),
      runFailed: makeEventChannel('runFailed'),
      childTurnStarted: makeEventChannel('childTurnStarted'),
      childTurnCompleted: makeEventChannel('childTurnCompleted'),
      childTurnCancelled: makeEventChannel('childTurnCancelled'),
    },
    cron: { removeJob: { invoke: vi.fn() } },
    conversation: { getAssociateConversation: { invoke: vi.fn() } },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) => (opts?.defaultValue as string) ?? k,
    i18n: { language: 'en' },
  }),
}));

vi.mock('swr', async () => {
  const actual = await vi.importActual<typeof import('swr')>('swr');
  return {
    ...actual,
    default: vi.fn((_key: unknown) => ({ data: undefined, mutate: vi.fn() })),
  };
});

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return { ...actual, Message: { success: vi.fn(), error: vi.fn(), useMessage: () => [null, null] } };
});

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/pages/team/hooks/useTeamWarmup', () => ({
  useTeamWarmup: () => ({ phase: 'ready', runtimeStatus: new Map(), retry: vi.fn() }),
}));

vi.mock('@/renderer/pages/team/hooks/useTeamSession', () => ({
  useTeamSession: () => ({
    statusMap: new Map(),
    membershipMutationBusy: false,
    addAssistant: vi.fn(),
    renameAssistant: vi.fn(),
    removeAssistant: vi.fn(),
    mutateTeam: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/team/hooks/useTeamViewMode', () => ({
  useTeamViewMode: () => ['parallel', vi.fn()] as const,
}));

vi.mock('@/renderer/pages/team/hooks/useTeamRunView', () => ({
  useTeamRunView: () => ({
    state: { active_run: null, slot_work: [] },
    applyAck: vi.fn(),
    reconcile: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/hooks/useActiveLease', () => ({
  useActiveLease: vi.fn(),
}));

vi.mock('@/renderer/hooks/agent/useAcpConfigOptions', () => ({
  useAcpConfigOptions: () => ({
    setStatus: { state: null, optionId: null },
    thoughtLevel: null,
  }),
  classifyConfigSetError: vi.fn(),
}));

vi.mock('@/renderer/hooks/agent/useAcpModelInfo', () => ({
  useAcpModelInfo: () => ({
    status: { state: null },
    isLoading: false,
    thoughtLevel: null,
  }),
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  getConversationOrNull: vi.fn(),
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({ closePreviewIfWorkspaceChanged: vi.fn() }),
}));

vi.mock('@/renderer/pages/conversation/components/ChatLayout', () => ({
  default: ({ children, headerLeading, title }: {
    children: React.ReactNode;
    headerLeading?: React.ReactNode;
    title?: string;
  }) => (
    <div data-testid='chat-layout'>
      <div data-testid='chat-layout-header'>
        {headerLeading}
        <span data-testid='chat-layout-title'>{title}</span>
      </div>
      {children}
    </div>
  ),
}));

vi.mock('@/renderer/pages/conversation/components/ChatSlider', () => ({
  default: () => <div data-testid='chat-slider' />,
}));

vi.mock('@/renderer/pages/team/components/TeamTabs', () => ({
  default: () => <div data-testid='team-tabs' />,
}));

vi.mock('@/renderer/pages/team/components/TeamWarmupOverlay', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/team/components/TeamViewToggle', () => ({
  default: () => <div data-testid='team-view-toggle' />,
}));

vi.mock('@/renderer/pages/cron', () => ({
  CronJobManager: () => <div data-testid='cron-job-manager' />,
}));

vi.mock('@/renderer/pages/cron/cronUtils', () => ({
  resolveCronJobId: () => undefined,
}));

vi.mock('@/renderer/pages/team/hooks/useTeamPendingPermissions', () => ({
  useTeamPendingPermissions: () => ({ pendingCounts: {} }),
}));

import TeamPage from '@/renderer/pages/team/TeamPage';

function mockTeam(overrides?: Partial<TTeam>): TTeam {
  return {
    id: 'team-1',
    user_id: 'user-1',
    name: 'Test Team',
    workspace: '/tmp/test',
    workspace_mode: 'shared',
    leader_assistant_id: 'lead-1',
    assistants: [
      {
        slot_id: 'slot-lead',
        conversation_id: 'conv-lead',
        role: 'leader',
        assistant_backend: 'claude',
        assistant_name: 'Leader',
        status: 'active',
        pending_confirmations: 0,
      },
    ],
    created_at: 1,
    updated_at: 2,
    ...overrides,
  };
}

describe('TeamPage origin conversation navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders back-to-conversation button when team has origin_conversation_id', () => {
    render(
      <MemoryRouter>
        <TeamPage team={mockTeam({ origin_conversation_id: 'conv-origin' })} />
      </MemoryRouter>
    );

    expect(screen.getByTestId('team-back-to-origin')).toBeInTheDocument();
  });

  it('does not render back-to-conversation button when team has no origin_conversation_id', () => {
    render(
      <MemoryRouter>
        <TeamPage team={mockTeam()} />
      </MemoryRouter>
    );

    expect(screen.queryByTestId('team-back-to-origin')).not.toBeInTheDocument();
  });
});
