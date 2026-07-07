import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TTeam } from '@/common/types/team/teamTypes';
import TeamPage from '@/renderer/pages/team/TeamPage';

const mocks = vi.hoisted(() => ({
  mutateTeam: vi.fn(),
  addAssistant: vi.fn(),
  renameAssistant: vi.fn(),
  removeAssistant: vi.fn(),
  globalMutate: vi.fn(),
  removeAgentInvoke: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    cron: {
      removeJob: { invoke: vi.fn() },
    },
    team: {
      removeAgent: { invoke: mocks.removeAgentInvoke },
      renameTeam: { invoke: vi.fn() },
      setSessionMode: { invoke: vi.fn() },
      ensureSession: { invoke: vi.fn(() => Promise.resolve()) },
      getConfigOptions: { invoke: vi.fn() },
    },
    conversation: {
      update: { invoke: vi.fn() },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en-US' },
  }),
}));

vi.mock('swr', () => ({
  __esModule: true,
  default: () => ({ data: null, mutate: vi.fn() }),
  useSWRConfig: () => ({ mutate: mocks.globalMutate }),
}));

vi.mock('@arco-design/web-react', () => ({
  Message: {
    useMessage: () => [{}, null],
    success: vi.fn(),
    error: vi.fn(),
  },
  Modal: {
    confirm: vi.fn(({ onOk }: { onOk?: () => void }) => onOk?.()),
  },
  Spin: () => <span data-testid='spin' />,
}));

vi.mock('@icon-park/react', () => ({
  CloseSmall: () => <span data-testid='close-icon' />,
  FullScreen: () => <span data-testid='fullscreen-icon' />,
  Left: () => <span data-testid='left-icon' />,
  OffScreen: () => <span data-testid='offscreen-icon' />,
  Peoples: () => <span data-testid='peoples-icon' />,
  Right: () => <span data-testid='right-icon' />,
}));

vi.mock('@renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/hooks/agent/useAcpConfigOptions', () => ({
  classifyConfigSetError: () => 'failed',
  useAcpConfigOptions: () => ({
    thoughtLevel: undefined,
    setStatus: vi.fn(),
    setConfigOption: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/components/ChatLayout', () => ({
  __esModule: true,
  default: ({ children, tabsSlot }: { children: React.ReactNode; tabsSlot?: React.ReactNode }) => (
    <div>
      {tabsSlot}
      {children}
    </div>
  ),
}));

vi.mock('@renderer/pages/conversation/components/ChatSlider.tsx', () => ({
  __esModule: true,
  default: () => <div data-testid='chat-slider' />,
}));

vi.mock('@/renderer/components/agent/AcpModelSelector', () => ({
  __esModule: true,
  default: () => <div data-testid='acp-model-selector' />,
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/AionrsModelSelector', () => ({
  __esModule: true,
  default: () => <div data-testid='aionrs-model-selector' />,
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/useAionrsModelSelection', () => ({
  useAionrsModelSelection: () => ({}),
}));

vi.mock('@/renderer/pages/cron', () => ({
  CronJobManager: () => <div data-testid='cron-job-manager' />,
}));

vi.mock('@/renderer/pages/team/components/TeamTabs', () => ({
  __esModule: true,
  default: () => <div data-testid='team-tabs' />,
}));

vi.mock('@/renderer/pages/team/components/TeamChatView', () => ({
  __esModule: true,
  default: () => <div data-testid='team-chat-view' />,
}));

vi.mock('@/renderer/pages/team/components/TeamAgentIdentity', () => ({
  __esModule: true,
  default: ({ assistant_name }: { assistant_name: string }) => <span>{assistant_name}</span>,
}));

vi.mock('@/renderer/pages/team/hooks/useTeamPendingPermissions', () => ({
  useTeamPendingPermissions: () => ({ pendingCounts: {} }),
}));

vi.mock('@/renderer/pages/team/hooks/useTeamSession', () => ({
  useTeamSession: () => ({
    statusMap: new Map([
      ['lead-slot', { slot_id: 'lead-slot', status: 'idle' }],
      ['worker-slot', { slot_id: 'worker-slot', status: 'idle' }],
    ]),
    membershipMutationBusy: true,
    addAssistant: mocks.addAssistant,
    renameAssistant: mocks.renameAssistant,
    removeAssistant: mocks.removeAssistant,
    mutateTeam: mocks.mutateTeam,
  }),
}));

vi.mock('@/renderer/pages/team/hooks/useTeamRunView', () => ({
  useTeamRunView: () => ({
    state: { activeRun: null, slotWork: new Map() },
    applyAck: vi.fn(),
    reconcile: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/utils/conversationCache', () => ({
  getConversationOrNull: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('@/renderer/pages/conversation/hooks/useActiveLease', () => ({
  useActiveLease: vi.fn(),
}));

vi.mock('@/renderer/pages/team/utils/teamWorkspaceView', () => ({
  resolveTeamWorkspaceView: () => ({
    workspacePath: '',
    workspaceEnabled: false,
    isTemporaryWorkspace: true,
  }),
}));

const team: TTeam = {
  id: 'team-1',
  user_id: 'user-1',
  name: 'Team',
  workspace: '',
  workspace_mode: 'shared',
  leader_assistant_id: 'lead-slot',
  assistants: [
    {
      slot_id: 'lead-slot',
      conversation_id: 'lead-conversation',
      role: 'leader',
      assistant_backend: 'codex',
      assistant_name: 'Lead',
      status: 'idle',
    },
    {
      slot_id: 'worker-slot',
      conversation_id: 'worker-conversation',
      role: 'teammate',
      assistant_backend: 'codex',
      assistant_name: 'Worker',
      status: 'idle',
    },
  ],
  created_at: 1,
  updated_at: 1,
};

describe('TeamPage membership mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('does not remove a teammate from the content panel while membership mutation is busy', async () => {
    render(<TeamPage team={team} />);

    const removeButton = screen.getByTestId('team-remove-assistant-worker-slot');
    fireEvent.click(removeButton);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mocks.removeAgentInvoke).not.toHaveBeenCalled();
  });
});
