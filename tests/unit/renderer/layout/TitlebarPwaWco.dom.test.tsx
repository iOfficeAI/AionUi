import { render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ desktop: true, mac: false }));
const wco = vi.hoisted(() => ({ isSupported: false, isVisible: false }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/conversation/test', search: '', hash: '' }),
  navigate: vi.fn(),
  useNavigate: () => vi.fn(),
}));
vi.mock('@/common', () => ({
  ipcBridge: { conversation: { get: { invoke: vi.fn() } } },
}));
vi.mock('@/common/config/constants', () => ({ TEAM_MODE_ENABLED: false }));
vi.mock('@renderer/pages/conversation/GroupedHistory/ConversationSearchPopover', () => ({ default: () => null }));
vi.mock('@/renderer/components/layout/Titlebar/MobileConversationBrand', () => ({ default: () => null }));
vi.mock('@/renderer/components/layout/WindowControls', () => ({
  default: () => <div data-testid='window-controls' />,
}));
vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));
vi.mock('@/renderer/hooks/context/NavigationHistoryContext', () => ({
  useNavigationHistory: () => null,
}));
vi.mock('@/renderer/hooks/context/FeedbackContext', () => ({
  useFeedback: () => ({ openFeedback: vi.fn() }),
}));
vi.mock('@/renderer/services/feedback/resolveFeedbackModule', () => ({
  resolveFeedbackModule: () => 'conversation-session',
}));
vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => platform.desktop,
  isMacOS: () => platform.mac,
}));
vi.mock('@/renderer/hooks/system/useWindowControlsOverlay', () => ({
  useWindowControlsOverlay: () => ({
    isSupported: wco.isSupported,
    isVisible: wco.isVisible,
    titlebarAreaRect: null,
  }),
}));

import Titlebar from '@/renderer/components/layout/Titlebar';

describe('Titlebar PWA Window Controls Overlay', () => {
  beforeEach(() => {
    platform.desktop = false;
    platform.mac = false;
    wco.isSupported = false;
    wco.isVisible = false;
  });

  it('renders titlebar with app-titlebar--pwa-wco class when WCO is visible in web mode', () => {
    wco.isSupported = true;
    wco.isVisible = true;

    const { container } = render(<Titlebar workspaceAvailable />);
    const titlebar = container.querySelector('.app-titlebar');

    expect(titlebar).toBeInTheDocument();
    expect(titlebar).toHaveClass('app-titlebar--pwa-wco');
    expect(titlebar).toHaveClass('app-titlebar--desktop');
    // Does not show custom electron window controls since PWA uses native window controls
    expect(screen.queryByTestId('window-controls')).not.toBeInTheDocument();
  });

  it('does not apply app-titlebar--pwa-wco class in non-WCO web mode', () => {
    wco.isSupported = false;
    wco.isVisible = false;

    const { container } = render(<Titlebar workspaceAvailable />);
    const titlebar = container.querySelector('.app-titlebar');

    expect(titlebar).toBeInTheDocument();
    expect(titlebar).not.toHaveClass('app-titlebar--pwa-wco');
    expect(titlebar).not.toHaveClass('app-titlebar--desktop');
  });
});
