import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ mac: false }));
const router = vi.hoisted(() => ({ pathname: '/guid', navigate: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: router.pathname, search: '', hash: '' }),
  useNavigate: () => router.navigate,
}));

vi.mock('@/renderer/utils/platform', () => ({
  isMacOS: () => platform.mac,
  isElectronDesktop: () => true,
}));

vi.mock('@/renderer/pages/conversation/Preview/context/PreviewContext', () => ({
  usePreviewContext: () => ({ closePreview: vi.fn(), clearPreviewForScope: vi.fn() }),
}));

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({ status: 'unauthenticated', logout: vi.fn() }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light', setTheme: vi.fn() }),
}));

vi.mock('@/renderer/utils/ui/siderTooltip', () => ({
  cleanupSiderTooltips: vi.fn(),
  getSiderTooltipProps: () => ({ className: 'sider-tooltip-popup', trigger: 'hover' }),
  getSiderPopupContainer: () => document.body,
}));

vi.mock('@/renderer/utils/ui/focus', () => ({
  blurActiveElement: vi.fn(),
}));

vi.mock('@/renderer/components/layout/Sider/SiderNav', () => ({
  SiderToolbar: () => <div data-testid='sider-toolbar' />,
  SiderSearchEntry: () => <div data-testid='sider-search-entry' />,
  SiderScheduledEntry: () => <div data-testid='sider-scheduled-entry' />,
  SiderAssistantEntry: () => <div data-testid='sider-assistant-entry' />,
}));

vi.mock('@/renderer/components/layout/Sider/SiderFooter', () => ({
  default: () => <div data-testid='sider-footer' />,
}));

vi.mock('@/renderer/components/layout/Sider/TeamSiderSection', () => ({
  default: () => <div data-testid='team-sider-section' />,
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory', () => ({
  default: () => <div data-testid='grouped-history' />,
}));

vi.mock('@/renderer/pages/settings/components/SettingsSider', () => ({
  default: () => <div data-testid='settings-sider' />,
}));

import Sider from '@/renderer/components/layout/Sider';

const pressSettingsShortcut = (init: KeyboardEventInit = {}): void => {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', ...init }));
  });
};

describe('Sider settings toggle shortcut', () => {
  beforeEach(() => {
    platform.mac = false;
    router.pathname = '/guid';
    router.navigate.mockReset();
  });

  it('opens settings with Ctrl+, on Windows/Linux', async () => {
    render(<Sider />);
    await screen.findByTestId('grouped-history');

    pressSettingsShortcut({ ctrlKey: true });

    expect(router.navigate).toHaveBeenCalledWith('/settings/agent');
  });

  it('opens settings with ⌘, on macOS', async () => {
    platform.mac = true;
    render(<Sider />);
    await screen.findByTestId('grouped-history');

    pressSettingsShortcut({ metaKey: true });

    expect(router.navigate).toHaveBeenCalledWith('/settings/agent');
  });

  it('navigates back to the previous view when already in settings', async () => {
    router.pathname = '/settings/agent';
    render(<Sider />);
    await screen.findByTestId('settings-sider');

    pressSettingsShortcut({ ctrlKey: true });

    expect(router.navigate).toHaveBeenCalledWith('/guid');
  });

  it('ignores the shortcut while focus is inside an editable target', async () => {
    render(<Sider />);
    await screen.findByTestId('grouped-history');

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    try {
      act(() => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: ',', ctrlKey: true, bubbles: true }));
      });
    } finally {
      input.remove();
    }

    expect(router.navigate).not.toHaveBeenCalled();
  });
});
