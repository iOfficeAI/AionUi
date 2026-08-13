import { cleanup, render, screen, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TTeam } from '@/common/types/team/teamTypes';
import TeamSiderSection from '@/renderer/components/layout/Sider/TeamSiderSection';

const fixtures = vi.hoisted(() => ({
  runningTeamIds: new Set(['running-team']),
  teamBadgeCounts: new Map<string, number>(),
  refreshTeams: vi.fn(),
  removeTeam: vi.fn(),
  navigate: vi.fn(),
  globalMutate: vi.fn(),
}));

const teams: TTeam[] = [
  {
    id: 'running-team',
    user_id: 'user-1',
    name: 'Running team',
    workspace: '/tmp/running',
    workspace_mode: 'shared',
    leader_assistant_id: 'running-lead',
    assistants: [],
    created_at: 1,
    updated_at: 1,
  },
  {
    id: 'idle-team',
    user_id: 'user-1',
    name: 'Idle team',
    workspace: '/tmp/idle',
    workspace_mode: 'shared',
    leader_assistant_id: 'idle-lead',
    assistants: [],
    created_at: 1,
    updated_at: 1,
  },
];

vi.mock('@renderer/pages/team/hooks/useTeamList', () => ({
  useTeamList: () => ({
    teams,
    mutate: fixtures.refreshTeams,
    removeTeam: fixtures.removeTeam,
  }),
}));

vi.mock('@renderer/pages/team/hooks/useSiderTeamBadges', () => ({
  useSiderTeamBadges: () => fixtures.teamBadgeCounts,
}));

vi.mock('@renderer/components/layout/Sider/useSiderTeamRunning', () => ({
  useSiderTeamRunning: () => (team_id: string) => fixtures.runningTeamIds.has(team_id),
}));

vi.mock('@renderer/components/layout/Sider/SiderItem', async () => {
  const ReactModule = await vi.importActual<typeof import('react')>('react');
  return {
    default: ({ icon, name, pinned }: { icon: React.ReactNode; name: string; pinned?: boolean }) =>
      ReactModule.createElement(
        'div',
        {
          'data-testid': `sider-item-${name}`,
          'data-pinned': String(Boolean(pinned)),
        },
        icon
      ),
  };
});

vi.mock('@renderer/pages/team/components/TeamCreateModal', () => ({ default: () => null }));
vi.mock('@renderer/utils/ui/siderTooltip', () => ({ cleanupSiderTooltips: vi.fn() }));
vi.mock('@renderer/utils/ui/focus', () => ({ blurActiveElement: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => fixtures.navigate }));
vi.mock('swr', () => ({ useSWRConfig: () => ({ mutate: fixtures.globalMutate }) }));
vi.mock('@/common', () => ({
  ipcBridge: {
    team: {
      renameTeam: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@arco-design/web-react', async () => {
  const ReactModule = await vi.importActual<typeof import('react')>('react');
  const Modal = ({ children }: { children?: React.ReactNode }) => ReactModule.createElement('div', null, children);
  Modal.confirm = vi.fn();

  return {
    Input: () => null,
    Message: { success: vi.fn(), error: vi.fn() },
    Modal,
    Spin: ({ size }: { size?: number }) =>
      ReactModule.createElement('span', { 'data-testid': 'spin', 'data-size': String(size) }),
    Tooltip: ({ children }: { children?: React.ReactNode }) =>
      ReactModule.createElement(ReactModule.Fragment, null, children),
  };
});

vi.mock('@icon-park/react', async () => {
  const ReactModule = await vi.importActual<typeof import('react')>('react');
  const icon = (name: string) =>
    function MockIcon(props: Record<string, unknown>) {
      return ReactModule.createElement('span', { ...props, 'data-mock-icon': name });
    };

  return {
    DeleteOne: icon('DeleteOne'),
    EditOne: icon('EditOne'),
    Peoples: icon('Peoples'),
    Plus: icon('Plus'),
    Pushpin: icon('Pushpin'),
    Right: icon('Right'),
  };
});

const renderSection = (collapsed: boolean) =>
  render(<TeamSiderSection collapsed={collapsed} pathname='/guid' siderTooltipProps={{}} />);

describe('TeamSiderSection running state', () => {
  beforeEach(() => {
    localStorage.clear();
    fixtures.runningTeamIds.clear();
    fixtures.runningTeamIds.add('running-team');
    fixtures.teamBadgeCounts.clear();
    localStorage.setItem('team-pinned-ids', JSON.stringify(['running-team', 'idle-team']));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows a spinner for a running team in the expanded section', () => {
    localStorage.setItem('team-section-expanded', 'true');
    renderSection(false);

    const spinnerSlot = screen.getByTestId('team-spinner-running-team');
    expect(within(spinnerSlot).getByTestId('spin')).toHaveAttribute('data-size', '16');
    expect(screen.queryByTestId('team-icon-running-team')).not.toBeInTheDocument();
    expect(screen.getByTestId('sider-item-Running team')).toHaveAttribute('data-pinned', 'false');
  });

  it('keeps the regular team icon for an idle team in the expanded section', () => {
    localStorage.setItem('team-section-expanded', 'true');
    renderSection(false);

    expect(screen.getByTestId('team-icon-idle-team')).toHaveAttribute('data-mock-icon', 'Peoples');
    expect(screen.queryByTestId('team-spinner-idle-team')).not.toBeInTheDocument();
    expect(screen.getByTestId('sider-item-Idle team')).toHaveAttribute('data-pinned', 'true');
  });

  it('keeps an unpinned idle team unpinned', () => {
    localStorage.setItem('team-section-expanded', 'true');
    localStorage.setItem('team-pinned-ids', JSON.stringify(['running-team']));
    renderSection(false);

    expect(screen.getByTestId('sider-item-Idle team')).toHaveAttribute('data-pinned', 'false');
  });

  it('shows a spinner for a running team in collapsed mode', () => {
    fixtures.teamBadgeCounts.set('running-team', 2);
    renderSection(true);

    const spinnerSlot = screen.getByTestId('collapsed-team-spinner-running-team');
    expect(within(spinnerSlot).getByTestId('spin')).toHaveAttribute('data-size', '16');
    expect(screen.queryByTestId('collapsed-team-icon-running-team')).not.toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('keeps the regular team icon for an idle team in collapsed mode', () => {
    renderSection(true);

    expect(screen.getByTestId('collapsed-team-icon-idle-team')).toHaveAttribute('data-mock-icon', 'Peoples');
    expect(screen.queryByTestId('collapsed-team-spinner-idle-team')).not.toBeInTheDocument();
  });
});
