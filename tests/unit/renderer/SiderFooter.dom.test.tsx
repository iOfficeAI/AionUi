/**
 * @license
 * Copyright 2026 AIbang (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConfigProvider } from '@arco-design/web-react';
import { describe, expect, it, vi } from 'vitest';
import SiderFooter from '@/renderer/components/layout/Sider/SiderFooter';

const { openExternalUrlMock } = vi.hoisted(() => ({
  openExternalUrlMock: vi.fn(async () => undefined),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === 'settings.accountCredits') return 'Credits';
      if (key === 'settings.contactDeveloper') return 'Contact Developer';
      if (key === 'settings.checkForUpdates') return 'Check for Updates';
      if (key === 'settings.personalWorkspace') return 'Personal Workspace';
      if (key === 'settings.googleLogout') return 'Logout';
      if (key === 'common.settings') return 'Settings';
      return key;
    },
  }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  openExternalUrl: openExternalUrlMock,
}));

vi.mock('@icon-park/react', () => ({
  Down: () => <span aria-hidden='true'>down</span>,
  Lightning: () => <span aria-hidden='true'>credits</span>,
  Logout: () => <span aria-hidden='true'>logout</span>,
  MessageOne: () => <span aria-hidden='true'>message</span>,
  Refresh: () => <span aria-hidden='true'>refresh</span>,
  SettingTwo: () => <span aria-hidden='true'>settings</span>,
  Moon: () => <span aria-hidden='true'>moon</span>,
  SunOne: () => <span aria-hidden='true'>sun</span>,
}));

describe('SiderFooter', () => {
  it('opens the account menu and routes its actions', async () => {
    vi.stubGlobal('__APP_VERSION__', '2.1.61');
    const onSettingsClick = vi.fn();
    const onCreditsClick = vi.fn();
    const onLogoutClick = vi.fn();
    const dispatchEventSpy = vi.spyOn(window, 'dispatchEvent');

    render(
      <ConfigProvider>
        <SiderFooter
          isMobile={false}
          isSettings={false}
          collapsed={false}
          theme='dark'
          siderTooltipProps={{}}
          onSettingsClick={onSettingsClick}
          onCreditsClick={onCreditsClick}
          onThemeToggle={vi.fn()}
          showLogout
          onLogoutClick={onLogoutClick}
          accountUsername='mainf'
          accountQuota={1000}
        />
      </ConfigProvider>
    );

    fireEvent.click(screen.getByTestId('sider-account-menu-trigger'));

    expect(await screen.findByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Credits')).toBeInTheDocument();
    expect(screen.getByText('1,000')).toBeInTheDocument();
    expect(screen.queryByText('⌘,')).not.toBeInTheDocument();
    expect(screen.getByText('Contact Developer')).toBeInTheDocument();
    expect(screen.getByText('Check for Updates')).toBeInTheDocument();
    expect(screen.getByText('Logout')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Settings'));
    expect(onSettingsClick).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('sider-account-menu-trigger'));
    fireEvent.click(await screen.findByText('Credits'));
    expect(onCreditsClick).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('sider-account-menu-trigger'));
    fireEvent.click(await screen.findByText('Contact Developer'));
    await waitFor(() => expect(openExternalUrlMock).toHaveBeenCalledWith('https://x.com/WailiVery'));

    fireEvent.click(screen.getByTestId('sider-account-menu-trigger'));
    fireEvent.click(await screen.findByText('Check for Updates'));
    expect(dispatchEventSpy).toHaveBeenCalledWith(expect.objectContaining({ type: 'aibang-open-update-modal' }));

    fireEvent.click(screen.getByTestId('sider-account-menu-trigger'));
    fireEvent.click(await screen.findByText('Logout'));
    expect(onLogoutClick).toHaveBeenCalledTimes(1);

    dispatchEventSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});
