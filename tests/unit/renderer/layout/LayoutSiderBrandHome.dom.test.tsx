/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// Mirror the project convention: t() echoes the key so labels/tooltips are assertable.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

// react-router-dom: control location, capture navigate.
const navigate = vi.fn();
let currentPathname = '/guid';
let currentSearch = '';
const platformMocks = vi.hoisted(() => ({
  isElectronDesktopMock: vi.fn(() => false),
}));
const shortcutMocks = vi.hoisted(() => ({
  params: undefined as undefined | { toggleSider: () => void },
}));
const featureMocks = vi.hoisted(() => ({
  teamModeEnabled: false,
}));
const detachedWindowMocks = vi.hoisted(() => ({ closeCurrentWindow: vi.fn(() => Promise.resolve(true)) }));
vi.mock('react-router-dom', () => ({
  NavigationType: { Pop: 'POP', Push: 'PUSH', Replace: 'REPLACE' },
  useNavigate: () => navigate,
  useLocation: () => ({ pathname: currentPathname, search: currentSearch, hash: '' }),
  useNavigationType: () => 'POP',
  Outlet: () => null,
}));

// Hidden devtools easter-egg target (icon) — assert it is independent of navigation.
const openDevTools = vi.fn(() => Promise.resolve());
vi.mock('@/common', () => ({
  ipcBridge: {
    application: {
      openDevTools: { invoke: () => openDevTools() },
      logStream: { on: () => () => {} },
    },
    task: { stopAll: { invoke: () => Promise.resolve({ success: false }) } },
  },
}));

// Trim Layout's collaborators to keep this a focused brand-behaviour test.
vi.mock('@/common/config/constants', () => ({
  get TEAM_MODE_ENABLED() {
    return featureMocks.teamModeEnabled;
  },
}));
vi.mock('@/renderer/components/layout/PwaPullToRefresh', () => ({ default: () => null }));
vi.mock('@/renderer/components/layout/Titlebar', () => ({
  default: () => null,
  DetachedTitlebar: ({ conversationId }: { conversationId: string }) => (
    <div data-testid='detached-titlebar'>{conversationId}</div>
  ),
}));
vi.mock('@/renderer/components/settings/UpdateModal', () => ({ default: () => null }));
vi.mock('@renderer/hooks/system/useDeepLink', () => ({ useDeepLink: () => {} }));
vi.mock('@renderer/hooks/system/notification/useNotificationClick', () => ({ useNotificationClick: () => {} }));
vi.mock('@renderer/hooks/system/notification/useBrowserNotification', () => ({ useBrowserNotification: () => {} }));
vi.mock('@renderer/hooks/file/useDirectorySelection', () => ({
  useDirectorySelection: () => ({ contextHolder: null }),
}));
vi.mock('@renderer/utils/ui/siderTooltip', () => ({ cleanupSiderTooltips: () => {} }));
vi.mock('@/renderer/utils/ui/detachedWindow', () => ({ detachedWindowActions: detachedWindowMocks }));
vi.mock('@renderer/hooks/ui/useConversationShortcuts', () => ({
  useConversationShortcuts: (params: { toggleSider: () => void }) => {
    shortcutMocks.params = params;
  },
}));
vi.mock('@renderer/utils/platform', () => ({ isElectronDesktop: platformMocks.isElectronDesktopMock }));
vi.mock('@renderer/pages/conversation/Preview/context/PreviewContext', () => ({
  usePreviewContext: () => ({ closePreview: () => {} }),
}));

import Layout from '@renderer/components/layout/Layout';

const renderLayout = () => render(<Layout sider={<div>sider</div>} />);

const BACK_KEY = 'common.back';

describe('Layout sider brand Home button', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
    navigate.mockClear();
    openDevTools.mockClear();
    platformMocks.isElectronDesktopMock.mockReturnValue(false);
    shortcutMocks.params = undefined;
    featureMocks.teamModeEnabled = false;
    sessionStorage.clear();
    currentPathname = '/guid';
    currentSearch = '';
    detachedWindowMocks.closeCurrentWindow.mockReset();
    detachedWindowMocks.closeCurrentWindow.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('navigates to the recorded last non-settings path when clicked in a settings route', () => {
    currentPathname = '/settings/about';
    sessionStorage.setItem('aion:last-non-settings-path', '/conversation/abc');
    renderLayout();

    fireEvent.click(screen.getByLabelText(BACK_KEY));
    expect(navigate).toHaveBeenCalledWith('/conversation/abc');
  });

  it('falls back to /guid in a settings route when no path is recorded', () => {
    currentPathname = '/settings/system';
    renderLayout();

    fireEvent.click(screen.getByLabelText(BACK_KEY));
    expect(navigate).toHaveBeenCalledWith('/guid');
  });

  it('falls back to /guid when the recorded path is itself a settings path', () => {
    currentPathname = '/settings/about';
    sessionStorage.setItem('aion:last-non-settings-path', '/settings/system');
    renderLayout();

    fireEvent.click(screen.getByLabelText(BACK_KEY));
    expect(navigate).toHaveBeenCalledWith('/guid');
  });

  it('activates via keyboard (Enter and Space) in a settings route', () => {
    currentPathname = '/settings/about';
    sessionStorage.setItem('aion:last-non-settings-path', '/conversation/abc');
    renderLayout();

    const brand = screen.getByLabelText(BACK_KEY);
    fireEvent.keyDown(brand, { key: 'Enter' });
    fireEvent.keyDown(brand, { key: ' ' });
    expect(navigate).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledWith('/conversation/abc');
  });

  it('ignores non-activation keys in a settings route', () => {
    currentPathname = '/settings/about';
    sessionStorage.setItem('aion:last-non-settings-path', '/conversation/abc');
    renderLayout();

    const brand = screen.getByLabelText(BACK_KEY);
    fireEvent.keyDown(brand, { key: 'Tab' });
    fireEvent.keyDown(brand, { key: 'a' });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('renders the wordmark as a non-actionable element in a non-settings route', () => {
    currentPathname = '/guid';
    renderLayout();

    // No actionable role/label in chat routes.
    expect(screen.queryByLabelText(BACK_KEY)).toBeNull();
    const wordmark = screen.getByText('AionUi');
    fireEvent.click(wordmark);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not navigate when the wordmark is clicked in a non-settings route', () => {
    currentPathname = '/conversation/xyz';
    renderLayout();

    fireEvent.click(screen.getByText('AionUi'));
    expect(navigate).not.toHaveBeenCalled();
  });

  it('provides common shortcuts with a functional sider toggle', () => {
    currentPathname = '/conversation/xyz';
    const { container } = renderLayout();
    const sider = container.querySelector('.layout-sider');

    expect(shortcutMocks.params?.toggleSider).toEqual(expect.any(Function));
    expect(sider).not.toHaveClass('collapsed');

    act(() => shortcutMocks.params?.toggleSider());
    expect(sider).toHaveClass('collapsed');

    act(() => shortcutMocks.params?.toggleSider());
    expect(sider).not.toHaveClass('collapsed');
  });

  it('keeps the common shortcut owner mounted on team routes', () => {
    currentPathname = '/team/team-1';
    featureMocks.teamModeEnabled = true;

    renderLayout();

    expect(shortcutMocks.params?.toggleSider).toEqual(expect.any(Function));
  });

  it('renders the chrome-less shell for a detached conversation route', () => {
    currentPathname = '/conversation/detached-1';
    currentSearch = '?window=detached';

    const { container } = renderLayout();

    expect(screen.getByTestId('detached-titlebar')).toHaveTextContent('detached-1');
    expect(container.querySelector('.layout-sider')).toBeNull();
    expect(screen.queryByText('sider')).toBeNull();
    expect(shortcutMocks.params?.toggleSider).toEqual(expect.any(Function));
  });

  it('closes a detached window when an in-window action leaves its pinned conversation route', () => {
    currentPathname = '/conversation/detached-1';
    currentSearch = '?window=detached';
    const { rerender } = renderLayout();

    currentPathname = '/settings/skills';
    currentSearch = '';
    rerender(<Layout sider={<div>sider</div>} />);

    expect(detachedWindowMocks.closeCurrentWindow).toHaveBeenCalledOnce();
    expect(screen.getByTestId('detached-titlebar')).toHaveTextContent('detached-1');
    expect(screen.queryByText('sider')).toBeNull();
  });

  it('restores a manually opened browser tab when the browser refuses to close it', async () => {
    detachedWindowMocks.closeCurrentWindow.mockResolvedValueOnce(false);
    currentPathname = '/conversation/detached-1';
    currentSearch = '?window=detached';
    const { rerender } = renderLayout();

    currentPathname = '/settings/skills';
    currentSearch = '';
    rerender(<Layout sider={<div>sider</div>} />);

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/conversation/detached-1?window=detached', { replace: true })
    );
  });

  it('restores a missing pinned conversation only once when the browser cannot close the tab', async () => {
    detachedWindowMocks.closeCurrentWindow.mockResolvedValue(false);
    currentPathname = '/conversation/missing';
    currentSearch = '?window=detached';
    const { rerender } = renderLayout();

    currentPathname = '/';
    currentSearch = '';
    rerender(<Layout sider={<div>sider</div>} />);
    await waitFor(() => expect(navigate).toHaveBeenCalledOnce());

    currentPathname = '/conversation/missing';
    currentSearch = '?window=detached';
    rerender(<Layout sider={<div>sider</div>} />);
    currentPathname = '/';
    currentSearch = '';
    rerender(<Layout sider={<div>sider</div>} />);

    await waitFor(() => expect(detachedWindowMocks.closeCurrentWindow).toHaveBeenCalledOnce());
    expect(navigate).toHaveBeenCalledOnce();
  });

  it('recovers a later unrelated drift after an earlier recovery already ran', async () => {
    detachedWindowMocks.closeCurrentWindow.mockResolvedValue(false);
    currentPathname = '/conversation/detached-1';
    currentSearch = '?window=detached';
    const { rerender } = renderLayout();

    currentPathname = '/settings/skills';
    currentSearch = '';
    rerender(<Layout sider={<div>sider</div>} />);
    await waitFor(() => expect(navigate).toHaveBeenCalledOnce());

    currentPathname = '/conversation/detached-1';
    currentSearch = '?window=detached';
    rerender(<Layout sider={<div>sider</div>} />);
    currentPathname = '/guid';
    currentSearch = '';
    rerender(<Layout sider={<div>sider</div>} />);

    await waitFor(() => expect(detachedWindowMocks.closeCurrentWindow).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(2));
    expect(navigate).toHaveBeenLastCalledWith('/conversation/detached-1?window=detached', { replace: true });
  });

  it('recovers a repeated drift to the same route once the user acts again', async () => {
    detachedWindowMocks.closeCurrentWindow.mockResolvedValue(false);
    currentPathname = '/conversation/detached-1';
    currentSearch = '?window=detached';
    const { rerender } = renderLayout();

    currentPathname = '/settings/skills';
    currentSearch = '';
    rerender(<Layout sider={<div>sider</div>} />);
    await waitFor(() => expect(navigate).toHaveBeenCalledOnce());

    currentPathname = '/conversation/detached-1';
    currentSearch = '?window=detached';
    rerender(<Layout sider={<div>sider</div>} />);
    // A real click or keypress is what separates a drift the user asked for
    // from the automatic redirect that a restore can bounce straight back into.
    fireEvent.keyDown(window, { key: 'Enter' });
    currentPathname = '/settings/skills';
    currentSearch = '';
    rerender(<Layout sider={<div>sider</div>} />);

    await waitFor(() => expect(detachedWindowMocks.closeCurrentWindow).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(navigate).toHaveBeenCalledTimes(2));
    expect(navigate).toHaveBeenLastCalledWith('/conversation/detached-1?window=detached', { replace: true });
  });

  it('picks up a drift that arrived while an earlier close was still pending', async () => {
    let resolveClose: ((closed: boolean) => void) | undefined;
    detachedWindowMocks.closeCurrentWindow
      .mockReturnValueOnce(
        new Promise<boolean>((resolve) => {
          resolveClose = resolve;
        })
      )
      .mockResolvedValue(false);
    currentPathname = '/conversation/detached-1';
    currentSearch = '?window=detached';
    const { rerender } = renderLayout();

    currentPathname = '/settings/skills';
    currentSearch = '';
    rerender(<Layout sider={<div>sider</div>} />);
    currentPathname = '/guid';
    currentSearch = '';
    rerender(<Layout sider={<div>sider</div>} />);
    expect(detachedWindowMocks.closeCurrentWindow).toHaveBeenCalledOnce();

    await act(async () => {
      resolveClose?.(false);
    });

    // The blocked drift is not stranded: settling the first attempt re-runs the
    // recovery for the route the window actually ended up on.
    await waitFor(() => expect(detachedWindowMocks.closeCurrentWindow).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/conversation/detached-1?window=detached', { replace: true })
    );
  });

  it('does not stack close attempts when the route bounces while a close is pending', async () => {
    let resolveClose: ((closed: boolean) => void) | undefined;
    detachedWindowMocks.closeCurrentWindow.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        resolveClose = resolve;
      })
    );
    currentPathname = '/conversation/detached-1';
    currentSearch = '?window=detached';
    const { rerender } = renderLayout();

    currentPathname = '/settings/skills';
    currentSearch = '';
    rerender(<Layout sider={<div>sider</div>} />);
    currentPathname = '/conversation/detached-1';
    currentSearch = '?window=detached';
    rerender(<Layout sider={<div>sider</div>} />);
    currentPathname = '/settings/skills';
    currentSearch = '';
    rerender(<Layout sider={<div>sider</div>} />);

    expect(detachedWindowMocks.closeCurrentWindow).toHaveBeenCalledOnce();
    // The window is still stranded on the drifted route, so the single refused
    // close must still restore it.
    resolveClose?.(false);
    await waitFor(() => expect(navigate).toHaveBeenCalledOnce());
  });

  it('ignores a stale failed-close result after the pinned route is restored', async () => {
    let resolveClose: ((closed: boolean) => void) | undefined;
    detachedWindowMocks.closeCurrentWindow.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        resolveClose = resolve;
      })
    );
    currentPathname = '/conversation/detached-1';
    currentSearch = '?window=detached';
    const { rerender } = renderLayout();

    currentPathname = '/settings/skills';
    currentSearch = '';
    rerender(<Layout sider={<div>sider</div>} />);
    currentPathname = '/conversation/detached-1';
    currentSearch = '?window=detached';
    rerender(<Layout sider={<div>sider</div>} />);
    resolveClose?.(false);

    await act(async () => Promise.resolve());
    expect(navigate).not.toHaveBeenCalled();
  });

  it('clicking the logo icon counts toward the devtools easter-egg and never navigates', () => {
    currentPathname = '/settings/about';
    sessionStorage.setItem('aion:last-non-settings-path', '/conversation/abc');
    const { container } = renderLayout();

    // The icon is the SVG-wrapping div (bg-black), separate from the wordmark.
    const icon = container.querySelector('.bg-black') as HTMLElement;
    expect(icon).toBeTruthy();
    for (let i = 0; i < 4; i++) fireEvent.click(icon);
    expect(openDevTools).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('opens the update notification directly for tray update checks', () => {
    platformMocks.isElectronDesktopMock.mockReturnValue(true);
    const openListener = vi.fn();
    window.addEventListener('aionui-open-update-modal', openListener);

    try {
      renderLayout();

      window.dispatchEvent(new Event('tray:check-update'));

      expect(navigate).not.toHaveBeenCalled();
      expect(openListener).toHaveBeenCalledTimes(1);
      const event = openListener.mock.calls[0][0] as CustomEvent;
      expect(event.detail).toEqual({ source: 'tray' });
    } finally {
      window.removeEventListener('aionui-open-update-modal', openListener);
    }
  });
});
