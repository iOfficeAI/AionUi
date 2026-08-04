/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import SiderFooter from '@renderer/components/layout/Sider/SiderFooter';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const renderFooter = (avatar?: string, isSettings = false) => {
  const onSettingsClick = vi.fn();
  const onWebuiClick = vi.fn();
  const onLogoutClick = vi.fn();
  const result = render(
    <SiderFooter
      isMobile={false}
      isSettings={isSettings}
      theme='light'
      siderTooltipProps={{}}
      onSettingsClick={onSettingsClick}
      onWebuiClick={onWebuiClick}
      onThemeToggle={vi.fn()}
      showAccount
      user={{
        id: 'user-1',
        username: 'zhangsan',
        realname: '张三',
        avatar,
      }}
      onLogoutClick={onLogoutClick}
    />
  );

  return { ...result, onLogoutClick, onSettingsClick, onWebuiClick };
};

describe('SiderFooter account menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the user at the bottom and opens account actions on click', async () => {
    renderFooter('https://gea.example/avatar.png');

    fireEvent.click(screen.getByTestId('sider-account-trigger'));

    expect(await screen.findByTestId('sider-account-menu')).toBeInTheDocument();
    expect(screen.getAllByText('张三').length).toBeGreaterThan(0);
  });

  it('opens settings and closes the account menu', async () => {
    const { onSettingsClick } = renderFooter();
    fireEvent.click(screen.getByTestId('sider-account-trigger'));

    fireEvent.click(await screen.findByTestId('sider-account-settings'));

    expect(onSettingsClick).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByTestId('sider-account-menu')).not.toBeInTheDocument());
  });

  it('opens WebUI settings from the account menu', async () => {
    const { onWebuiClick } = renderFooter();
    fireEvent.click(screen.getByTestId('sider-account-trigger'));

    fireEvent.click(await screen.findByTestId('sider-account-webui'));

    expect(onWebuiClick).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByTestId('sider-account-menu')).not.toBeInTheDocument());
  });

  it('logs out from the account menu', async () => {
    const { onLogoutClick } = renderFooter();
    fireEvent.click(screen.getByTestId('sider-account-trigger'));

    fireEvent.click(await screen.findByTestId('sider-account-logout'));

    expect(onLogoutClick).toHaveBeenCalledOnce();
  });

  it('falls back to the current brand image when the user avatar fails', () => {
    const { container } = renderFooter('https://gea.example/missing.png');
    const avatar = container.querySelector('[data-testid="sider-account-trigger"] img') as HTMLImageElement;

    fireEvent.error(avatar);

    expect(avatar).not.toHaveAttribute('src', 'https://gea.example/missing.png');
  });

  it('keeps the theme action available inside settings', () => {
    renderFooter(undefined, true);

    expect(screen.getByLabelText('settings.darkMode')).toBeInTheDocument();
  });
});
