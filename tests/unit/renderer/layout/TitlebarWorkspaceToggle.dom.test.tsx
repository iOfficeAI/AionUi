import { act, render, screen } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const platform = vi.hoisted(() => ({ desktop: true, mac: false }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/conversation/test', search: '', hash: '' }),
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

import Titlebar from '@/renderer/components/layout/Titlebar';
import { WORKSPACE_STATE_EVENT } from '@/renderer/utils/workspace/workspaceEvents';

describe('Titlebar workspace toggle', () => {
  beforeEach(() => {
    platform.desktop = true;
    platform.mac = false;
  });

  it('places the Windows workspace toggle directly after Bug Report', () => {
    render(<Titlebar workspaceAvailable />);

    const report = screen.getByRole('button', { name: 'conversation.welcome.quickActionFeedback' });
    const workspace = screen.getByRole('button', { name: 'common.expandMore' });

    expect(report.nextElementSibling).toBe(workspace);
    expect(workspace.nextElementSibling).toBe(screen.getByTestId('window-controls'));
  });

  it.each([
    { runtime: 'macOS desktop', desktop: true, mac: true },
    { runtime: 'WebUI', desktop: false, mac: false },
  ])('keeps the workspace toggle after Bug Report on $runtime', ({ desktop, mac }) => {
    platform.desktop = desktop;
    platform.mac = mac;
    render(<Titlebar workspaceAvailable />);

    const report = screen.getByRole('button', { name: 'conversation.welcome.quickActionFeedback' });
    const workspace = screen.getByRole('button', { name: 'common.expandMore' });

    expect(report.nextElementSibling).toBe(workspace);
    expect(screen.queryByTestId('window-controls')).not.toBeInTheDocument();
  });

  it('updates the workspace action when the panel becomes expanded', () => {
    render(<Titlebar workspaceAvailable />);

    act(() => {
      window.dispatchEvent(new CustomEvent(WORKSPACE_STATE_EVENT, { detail: { collapsed: false } }));
    });

    expect(screen.getByRole('button', { name: 'common.collapse' })).toBeInTheDocument();
  });

  it('omits the workspace toggle when no workspace is available', () => {
    render(<Titlebar workspaceAvailable={false} />);

    expect(screen.queryByRole('button', { name: 'common.expandMore' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'common.collapse' })).not.toBeInTheDocument();
  });
});
