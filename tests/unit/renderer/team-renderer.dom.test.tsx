// tests/unit/renderer/team-renderer.dom.test.tsx
//
// DOM tests for the team close/remove-agent feature covering:
//   - TeamTabsContext.tsx  (removeAgent prop passthrough)
//   - TeamTabs.tsx         (close button render + click)
//   - TeamPage.tsx         (doRemoveAgent / handleRemoveAgent)

import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — hoisted so they resolve before any import
// ---------------------------------------------------------------------------

const mockRemoveAgentInvoke = vi.fn();
const mockConversationGetInvoke = vi.fn();
const mockConversationUpdateInvoke = vi.fn();
const mockRenameTeamInvoke = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    team: {
      removeAgent: { invoke: (...args: unknown[]) => mockRemoveAgentInvoke(...args) },
      renameTeam: { invoke: (...args: unknown[]) => mockRenameTeamInvoke(...args) },
      agentSpawned: { on: vi.fn(() => vi.fn()), emit: vi.fn() },
      agentStatusChanged: { on: vi.fn(() => vi.fn()), emit: vi.fn() },
      agentRemoved: { on: vi.fn(() => vi.fn()), emit: vi.fn() },
      agentRenamed: { on: vi.fn(() => vi.fn()), emit: vi.fn() },
    },
    conversation: {
      get: { invoke: (...args: unknown[]) => mockConversationGetInvoke(...args) },
      update: { invoke: (...args: unknown[]) => mockConversationUpdateInvoke(...args) },
      stop: { invoke: vi.fn() },
      responseStream: { on: vi.fn(() => vi.fn()), emit: vi.fn() },
      confirmation: {
        list: { invoke: vi.fn().mockResolvedValue([]) },
        add: { on: vi.fn(() => vi.fn()) },
        remove: { on: vi.fn(() => vi.fn()) },
        update: { on: vi.fn(() => vi.fn()) },
        confirm: { invoke: vi.fn() },
      },
    },
    acpConversation: {
      responseStream: { on: vi.fn(() => vi.fn()), emit: vi.fn() },
    },
  },
}));

vi.mock('electron', () => ({ app: { getPath: vi.fn(() => '/tmp') } }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

vi.mock('swr', () => {
  const useSWR = (_key: unknown, _fetcher?: () => Promise<unknown>) => ({
    data: undefined,
    error: undefined,
    isLoading: false,
    mutate: vi.fn(),
  });
  return {
    default: useSWR,
    useSWRConfig: () => ({ mutate: vi.fn() }),
  };
});

vi.mock('@arco-design/web-react', () => {
  const Message = {
    success: vi.fn(),
    error: vi.fn(),
    useMessage: () => [vi.fn(), null],
  };
  const Modal = {
    confirm: vi.fn(),
  };
  const Spin = ({ loading }: { loading?: boolean }) =>
    loading ? React.createElement('div', { 'data-testid': 'spin' }) : null;
  const Button = ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) =>
    React.createElement('button', { 'data-testid': 'arco-button', onClick }, children);
  return { Button, Message, Modal, Spin };
});

vi.mock('@icon-park/react', () => ({
  CloseSmall: (props: Record<string, unknown>) =>
    React.createElement('span', { 'data-testid': 'close-icon', ...props }),
  CloseOne: (props: Record<string, unknown>) =>
    React.createElement('span', { 'data-testid': 'close-one-icon', ...props }),
  Edit: (props: Record<string, unknown>) => React.createElement('span', { 'data-testid': 'edit-icon', ...props }),
  Plus: (props: Record<string, unknown>) => React.createElement('span', { 'data-testid': 'plus-icon', ...props }),
  FullScreen: (props: Record<string, unknown>) =>
    React.createElement('span', { 'data-testid': 'fullscreen-icon', ...props }),
  OffScreen: (props: Record<string, unknown>) =>
    React.createElement('span', { 'data-testid': 'offscreen-icon', ...props }),
  Left: (props: Record<string, unknown>) => React.createElement('span', { 'data-testid': 'left-icon', ...props }),
  Right: (props: Record<string, unknown>) => React.createElement('span', { 'data-testid': 'right-icon', ...props }),
}));

vi.mock('@/renderer/styles/colors', () => ({
  iconColors: { primary: '#000' },
}));

// Stub child components not under test
vi.mock('@/renderer/pages/team/components/AddAgentModal', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/team/components/AgentStatusBadge', () => ({
  default: ({ status }: { status: string }) => React.createElement('span', { 'data-testid': 'status-badge' }, status),
}));

vi.mock('@/renderer/pages/team/components/TeamAgentIdentity', () => ({
  default: ({ agentName }: { agentName: string }) =>
    React.createElement('span', { 'data-testid': 'agent-identity' }, agentName),
}));

// TeamPage-specific heavy mocks
vi.mock('@renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/renderer/pages/conversation/hooks/useConversationAgents', () => ({
  useConversationAgents: () => ({ cliAgents: [], presetAssistants: [] }),
}));

vi.mock('@/renderer/pages/conversation/components/ChatLayout', () => ({
  default: ({ children, tabsSlot }: { children: React.ReactNode; tabsSlot?: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'chat-layout' }, tabsSlot, children),
}));

vi.mock('@/renderer/pages/conversation/components/ChatSider', () => ({
  default: () => React.createElement('div', { 'data-testid': 'chat-sider' }),
}));

vi.mock('@/renderer/pages/team/components/TeamChatView', () => ({
  default: () => React.createElement('div', { 'data-testid': 'team-chat-view' }),
}));

vi.mock('@/renderer/components/agent/AcpModelSelector', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/conversation/platforms/gemini/GeminiModelSelector', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/conversation/platforms/gemini/useGeminiModelSelection', () => ({
  useGeminiModelSelection: () => ({}),
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/AionrsModelSelector', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/useAionrsModelSelection', () => ({
  useAionrsModelSelection: () => ({}),
}));

vi.mock('@/renderer/pages/team/components/agentSelectUtils', () => ({
  agentFromKey: () => undefined,
  resolveConversationType: () => 'acp',
  resolveTeamAgentType: () => 'acp',
}));

vi.mock('@/renderer/utils/workspace/workspaceEvents', () => ({
  dispatchWorkspaceHasFilesEvent: vi.fn(),
}));

vi.mock('@/renderer/pages/team/hooks/TeamPermissionContext', () => ({
  TeamPermissionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock useTeamSession to return controllable statusMap and removeAgent
const mockUseTeamSessionReturn = {
  statusMap: new Map<string, { slotId: string; status: string }>(),
  addAgent: vi.fn().mockResolvedValue(undefined),
  renameAgent: vi.fn().mockResolvedValue(undefined),
  removeAgent: vi.fn().mockResolvedValue(undefined),
  mutateTeam: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@/renderer/pages/team/hooks/useTeamSession', () => ({
  useTeamSession: () => mockUseTeamSessionReturn,
}));

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------

import { TeamTabsProvider, useTeamTabs } from '@renderer/pages/team/hooks/TeamTabsContext';
import type { TeamAgent, TTeam } from '@/common/types/teamTypes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgents(): TeamAgent[] {
  return [
    {
      slotId: 'slot-lead',
      conversationId: 'conv-lead',
      role: 'leader',
      agentType: 'acp',
      agentName: 'Leader',
      conversationType: 'acp',
      status: 'idle',
    },
    {
      slotId: 'slot-member',
      conversationId: 'conv-member',
      role: 'teammate',
      agentType: 'acp',
      agentName: 'Worker',
      conversationType: 'acp',
      status: 'idle',
    },
  ];
}

function makeTeam(): TTeam {
  return {
    id: 'team-1',
    name: 'Test Team',
    leaderAgentId: 'slot-lead',
    agents: makeAgents(),
    createdAt: 1,
    updatedAt: 1,
  } as TTeam;
}

// ---------------------------------------------------------------------------
// 1. TeamTabsContext — removeAgent passthrough
// ---------------------------------------------------------------------------

describe('TeamTabsContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes removeAgent through context when provided', () => {
    const mockRemove = vi.fn().mockResolvedValue(undefined);
    let contextValue: ReturnType<typeof useTeamTabs> | null = null;

    const Consumer = () => {
      contextValue = useTeamTabs();
      return null;
    };

    render(
      React.createElement(
        TeamTabsProvider,
        {
          agents: makeAgents(),
          statusMap: new Map(),
          defaultActiveSlotId: 'slot-lead',
          teamId: 'team-1',
          removeAgent: mockRemove,
        },
        React.createElement(Consumer)
      )
    );

    expect(contextValue).not.toBeNull();
    expect(contextValue!.removeAgent).toBe(mockRemove);
  });

  it('exposes removeAgent as undefined when not provided', () => {
    let contextValue: ReturnType<typeof useTeamTabs> | null = null;

    const Consumer = () => {
      contextValue = useTeamTabs();
      return null;
    };

    render(
      React.createElement(
        TeamTabsProvider,
        {
          agents: makeAgents(),
          statusMap: new Map(),
          defaultActiveSlotId: 'slot-lead',
          teamId: 'team-1',
        },
        React.createElement(Consumer)
      )
    );

    expect(contextValue).not.toBeNull();
    expect(contextValue!.removeAgent).toBeUndefined();
  });

  it('restores teammate tab order from localStorage while keeping the leader first', async () => {
    localStorage.setItem('team-agent-order-team-1', JSON.stringify(['slot-member-2', 'slot-member']));

    const agents: TeamAgent[] = [
      ...makeAgents(),
      {
        slotId: 'slot-member-2',
        conversationId: 'conv-member-2',
        role: 'teammate',
        agentType: 'acp',
        agentName: 'Worker 2',
        conversationType: 'acp',
        status: 'idle',
      },
    ];

    const TeamTabs = (await import('@renderer/pages/team/components/TeamTabs')).default;

    render(
      React.createElement(
        TeamTabsProvider,
        {
          agents,
          statusMap: new Map(),
          defaultActiveSlotId: 'slot-lead',
          teamId: 'team-1',
        },
        React.createElement(TeamTabs, { onAddAgent: vi.fn() })
      )
    );

    expect(screen.getAllByTestId('agent-identity').map((element) => element.textContent)).toEqual([
      'Leader',
      'Worker 2',
      'Worker',
    ]);
  });

  it('persists reordered teammate tabs to localStorage', () => {
    let contextValue: ReturnType<typeof useTeamTabs> | null = null;

    const Consumer = () => {
      contextValue = useTeamTabs();
      return null;
    };

    render(
      React.createElement(
        TeamTabsProvider,
        {
          agents: [
            ...makeAgents(),
            {
              slotId: 'slot-member-2',
              conversationId: 'conv-member-2',
              role: 'teammate',
              agentType: 'acp',
              agentName: 'Worker 2',
              conversationType: 'acp',
              status: 'idle',
            },
          ],
          statusMap: new Map(),
          defaultActiveSlotId: 'slot-lead',
          teamId: 'team-1',
        },
        React.createElement(Consumer)
      )
    );

    act(() => {
      contextValue!.reorderAgents('slot-member-2', 'slot-member');
    });

    expect(JSON.parse(localStorage.getItem('team-agent-order-team-1') ?? '[]')).toEqual([
      'slot-member-2',
      'slot-member',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 2. TeamTabs — close button
// ---------------------------------------------------------------------------

describe('TeamTabs close button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders close button for non-leader agents when removeAgent is provided', async () => {
    const mockRemove = vi.fn().mockResolvedValue(undefined);
    const TeamTabs = (await import('@renderer/pages/team/components/TeamTabs')).default;

    render(
      React.createElement(
        TeamTabsProvider,
        {
          agents: makeAgents(),
          statusMap: new Map(),
          defaultActiveSlotId: 'slot-lead',
          teamId: 'team-1',
          removeAgent: mockRemove,
        },
        React.createElement(TeamTabs, { onAddAgent: vi.fn() })
      )
    );

    const closeIcons = screen.getAllByTestId('close-icon');
    expect(closeIcons.length).toBeGreaterThanOrEqual(1);
  });

  it('does not render close button for leader agent', async () => {
    const mockRemove = vi.fn().mockResolvedValue(undefined);
    const TeamTabs = (await import('@renderer/pages/team/components/TeamTabs')).default;

    render(
      React.createElement(
        TeamTabsProvider,
        {
          agents: makeAgents(),
          statusMap: new Map(),
          defaultActiveSlotId: 'slot-lead',
          teamId: 'team-1',
          removeAgent: mockRemove,
        },
        React.createElement(TeamTabs, { onAddAgent: vi.fn() })
      )
    );

    const identities = screen.getAllByTestId('agent-identity');
    expect(identities.length).toBe(2);

    const closeIcons = screen.getAllByTestId('close-icon');
    expect(closeIcons.length).toBe(1); // only the non-leader member
  });

  it('calls removeAgent when close button is clicked', async () => {
    const mockRemove = vi.fn().mockResolvedValue(undefined);
    const TeamTabs = (await import('@renderer/pages/team/components/TeamTabs')).default;

    render(
      React.createElement(
        TeamTabsProvider,
        {
          agents: makeAgents(),
          statusMap: new Map(),
          defaultActiveSlotId: 'slot-lead',
          teamId: 'team-1',
          removeAgent: mockRemove,
        },
        React.createElement(TeamTabs, { onAddAgent: vi.fn() })
      )
    );

    const closeIcon = screen.getByTestId('close-icon');
    fireEvent.click(closeIcon.closest('span[class]') || closeIcon);

    await waitFor(() => {
      expect(mockRemove).toHaveBeenCalledWith('slot-member');
    });
  });

  it('does not render close button when removeAgent is not provided', async () => {
    const TeamTabs = (await import('@renderer/pages/team/components/TeamTabs')).default;

    render(
      React.createElement(
        TeamTabsProvider,
        {
          agents: makeAgents(),
          statusMap: new Map(),
          defaultActiveSlotId: 'slot-lead',
          teamId: 'team-1',
        },
        React.createElement(TeamTabs, { onAddAgent: vi.fn() })
      )
    );

    const closeIcons = screen.queryAllByTestId('close-icon');
    expect(closeIcons.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. TeamPage — doRemoveAgent / handleRemoveAgent via full render
// ---------------------------------------------------------------------------

describe('TeamPage remove agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockRemoveAgentInvoke.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders remove button for non-leader agent in chat header', async () => {
    const TeamPage = (await import('@renderer/pages/team/TeamPage')).default;

    render(React.createElement(TeamPage, { team: makeTeam() }));

    // The AgentChatSlot renders CloseSmall for non-leader agents
    const closeIcons = screen.getAllByTestId('close-icon');
    expect(closeIcons.length).toBeGreaterThanOrEqual(1);
  });

  it('calls ipcBridge.team.removeAgent when remove is triggered on idle agent', async () => {
    const TeamPage = (await import('@renderer/pages/team/TeamPage')).default;

    render(React.createElement(TeamPage, { team: makeTeam() }));

    // Click all close icons to trigger the remove handler
    const closeIcons = screen.getAllByTestId('close-icon');
    for (const icon of closeIcons) {
      fireEvent.click(icon.parentElement || icon);
    }

    await waitFor(() => {
      expect(mockRemoveAgentInvoke).toHaveBeenCalledWith({
        teamId: 'team-1',
        slotId: 'slot-member',
      });
    });
  });

  it('shows confirm modal when removing an active agent', async () => {
    mockUseTeamSessionReturn.statusMap = new Map([['slot-member', { slotId: 'slot-member', status: 'active' }]]);

    const TeamPage = (await import('@renderer/pages/team/TeamPage')).default;
    const { Modal } = await import('@arco-design/web-react');

    render(React.createElement(TeamPage, { team: makeTeam() }));

    const closeIcons = screen.getAllByTestId('close-icon');
    for (const icon of closeIcons) {
      fireEvent.click(icon.parentElement || icon);
    }

    await waitFor(() => {
      expect(Modal.confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'team.removeAgent.confirmTitle',
          content: 'team.removeAgent.confirmContent',
        })
      );
    });

    mockUseTeamSessionReturn.statusMap = new Map();
  });

  it('shows error message when remove fails', async () => {
    mockRemoveAgentInvoke.mockRejectedValue(new Error('Remove failed'));

    const TeamPage = (await import('@renderer/pages/team/TeamPage')).default;
    const { Message } = await import('@arco-design/web-react');

    render(React.createElement(TeamPage, { team: makeTeam() }));

    const closeIcons = screen.getAllByTestId('close-icon');
    for (const icon of closeIcons) {
      fireEvent.click(icon.parentElement || icon);
    }

    await waitFor(() => {
      expect(Message.error).toHaveBeenCalled();
    });
  });

  it('shows success message after successful remove', async () => {
    mockRemoveAgentInvoke.mockResolvedValue(undefined);

    const TeamPage = (await import('@renderer/pages/team/TeamPage')).default;
    const { Message } = await import('@arco-design/web-react');

    render(React.createElement(TeamPage, { team: makeTeam() }));

    const closeIcons = screen.getAllByTestId('close-icon');
    for (const icon of closeIcons) {
      fireEvent.click(icon.parentElement || icon);
    }

    await waitFor(() => {
      expect(Message.success).toHaveBeenCalled();
    });
  });
});
