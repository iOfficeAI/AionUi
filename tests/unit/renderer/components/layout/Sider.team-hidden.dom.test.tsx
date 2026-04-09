import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/pages/conversation/Preview/context/PreviewContext', () => ({
  usePreviewContext: () => ({ closePreview: vi.fn() }),
}));

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light', setTheme: vi.fn() }),
}));

vi.mock('@/renderer/pages/cron/useCronJobs', () => ({
  useAllCronJobs: () => ({ jobs: [] }),
}));

vi.mock('@/renderer/utils/ui/siderTooltip', () => ({
  cleanupSiderTooltips: vi.fn(),
  getSiderTooltipProps: () => ({ disabled: true }),
}));

vi.mock('@/renderer/utils/ui/focus', () => ({
  blurActiveElement: vi.fn(),
}));

vi.mock('@/renderer/components/layout/Sider/SiderToolbar', () => ({
  default: () => <div data-testid='sider-toolbar' />,
}));

vi.mock('@/renderer/components/layout/Sider/SiderSearchEntry', () => ({
  default: () => <div data-testid='sider-search-entry' />,
}));

vi.mock('@/renderer/components/layout/Sider/SiderScheduledEntry', () => ({
  default: () => <div data-testid='sider-scheduled-entry' />,
}));

vi.mock('@/renderer/components/layout/Sider/SiderFooter', () => ({
  default: () => <div data-testid='sider-footer' />,
}));

vi.mock('@/renderer/components/layout/Sider/CronJobSiderSection', () => ({
  default: () => <div data-testid='cron-job-section' />,
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory', () => ({
  default: () => <div data-testid='workspace-grouped-history' />,
}));

vi.mock('@/renderer/pages/team/hooks/useTeamList', () => ({
  useTeamList: () => ({ teams: [], mutate: vi.fn(), removeTeam: vi.fn() }),
}));

vi.mock('swr', () => ({
  default: vi.fn(() => ({ data: undefined, mutate: vi.fn() })),
  useSWRConfig: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/common', () => ({
  ipcBridge: { team: { renameTeam: { invoke: vi.fn() } } },
}));

vi.mock('@/renderer/pages/team/components/TeamCreateModal', () => ({
  default: () => null,
}));

import Sider from '@/renderer/components/layout/Sider';

describe('Sider team entry visibility', () => {
  it('shows the team section when team mode is enabled', async () => {
    render(
      <MemoryRouter initialEntries={['/guid']}>
        <Sider />
      </MemoryRouter>
    );

    expect(screen.getByTestId('sider-toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('sider-search-entry')).toBeInTheDocument();
    expect(screen.getByTestId('sider-scheduled-entry')).toBeInTheDocument();
    expect(screen.getByTestId('cron-job-section')).toBeInTheDocument();
    expect(await screen.findByTestId('workspace-grouped-history')).toBeInTheDocument();
    expect(screen.getByTestId('sider-footer')).toBeInTheDocument();
    expect(screen.getByText('team.sider.title')).toBeInTheDocument();
  });
});
