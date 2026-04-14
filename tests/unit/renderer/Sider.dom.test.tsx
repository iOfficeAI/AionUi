import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const logoutMock = vi.fn();
const navigateMock = vi.fn();
const closePreviewMock = vi.fn();
const cleanupTooltipsMock = vi.fn();
const blurActiveElementMock = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock('@icon-park/react', () => ({
  AlarmClock: () => <span>AlarmClock</span>,
  ArrowCircleLeft: () => <span>ArrowCircleLeft</span>,
  ListCheckbox: () => <span>ListCheckbox</span>,
  Logout: () => <span>Logout</span>,
  Moon: () => <span>Moon</span>,
  SettingTwo: () => <span>SettingTwo</span>,
  SunOne: () => <span>SunOne</span>,
}));

vi.mock('@/renderer/pages/conversation/Preview/context/PreviewContext', () => ({
  usePreviewContext: () => ({
    closePreview: closePreviewMock,
  }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({
    isMobile: false,
  }),
}));

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({
    theme: 'light',
    setTheme: vi.fn(),
  }),
}));

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({
    logout: logoutMock,
    status: 'authenticated',
  }),
}));

vi.mock('@/renderer/pages/cron/useCronJobs', () => ({
  useAllCronJobs: () => ({ jobs: [] }),
}));

vi.mock('@/renderer/utils/ui/siderTooltip', () => ({
  cleanupSiderTooltips: () => cleanupTooltipsMock(),
  getSiderTooltipProps: () => ({}),
}));

vi.mock('@/renderer/utils/ui/focus', () => ({
  blurActiveElement: () => blurActiveElementMock(),
}));

vi.mock('@/renderer/components/layout/Sider/SiderNav', async () => {
  const React = await import('react');
  return {
    SiderToolbar: () => <div>SiderToolbar</div>,
    SiderSearchEntry: () => <div>SiderSearchEntry</div>,
    SiderScheduledEntry: () => <div>SiderScheduledEntry</div>,
  };
});

vi.mock('@/renderer/components/layout/Sider/CronJobSiderSection', () => ({
  default: () => <div>CronJobSiderSection</div>,
}));

vi.mock('@/renderer/components/layout/Sider/TeamSiderSection', () => ({
  default: () => <div>TeamSiderSection</div>,
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory', () => ({
  default: () => <div>WorkspaceGroupedHistory</div>,
}));

vi.mock('@/renderer/pages/settings/components/SettingsSider', () => ({
  default: () => <div>SettingsSider</div>,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

import Sider from '@/renderer/components/layout/Sider';

describe('Sider logout affordances', () => {
  beforeEach(() => {
    logoutMock.mockReset();
    navigateMock.mockReset();
    closePreviewMock.mockReset();
    cleanupTooltipsMock.mockReset();
    blurActiveElementMock.mockReset();
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: undefined,
    });
  });

  it('renders a logout action in WebUI mode and invokes logout on click', () => {
    render(
      <MemoryRouter initialEntries={['/guid']}>
        <Sider />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'common.logoutShortcut' }));

    expect(logoutMock).toHaveBeenCalledTimes(1);
    expect(cleanupTooltipsMock).toHaveBeenCalledTimes(1);
    expect(closePreviewMock).toHaveBeenCalledTimes(1);
    expect(blurActiveElementMock).toHaveBeenCalledTimes(1);
  });

  it('binds Ctrl/Cmd+L to logout outside editable fields', () => {
    render(
      <MemoryRouter initialEntries={['/guid']}>
        <Sider />
      </MemoryRouter>
    );

    fireEvent.keyDown(document, { key: 'l', ctrlKey: true });

    expect(logoutMock).toHaveBeenCalledTimes(1);
  });

  it('does not trigger logout from text inputs', () => {
    render(
      <MemoryRouter initialEntries={['/guid']}>
        <Sider />
        <input aria-label='editor' />
      </MemoryRouter>
    );

    const input = screen.getByLabelText('editor');
    input.focus();
    fireEvent.keyDown(input, { key: 'l', ctrlKey: true });

    expect(logoutMock).not.toHaveBeenCalled();
  });
});
