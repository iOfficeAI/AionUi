/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('@/renderer/hooks/context/NewApiAccountContext', () => ({
  useNewApiAccount: () => ({
    login: vi.fn(),
  }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
  openExternalUrl: vi.fn(),
}));

vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
  return {
    ...actual,
    Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    Dropdown: ({ children }: { children?: React.ReactNode; droplist?: React.ReactNode }) => <div>{children}</div>,
    Menu: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Form: Object.assign(({ children }: { children?: React.ReactNode }) => <div>{children}</div>, {
      useForm: () => [{}],
      Item: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    }),
    Input: { Password: ({ placeholder }: { placeholder?: string }) => <input placeholder={placeholder} /> },
    Button: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => (
      <button type='button' onClick={onClick}>
        {children}
      </button>
    ),
    Message: { success: vi.fn(), error: vi.fn() },
  };
});

import SiderFooter from '@/renderer/components/layout/Sider/SiderFooter';

describe('SiderFooter desktop account panel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hides settings entry when desktop account is not logged in', () => {
    render(
      <SiderFooter
        isMobile={false}
        isSettings={false}
        theme='light'
        siderTooltipProps={{} as never}
        onSettingsClick={vi.fn()}
        onThemeToggle={vi.fn()}
        showDesktopAccount
        desktopAccountLoggedIn={false}
        desktopAccountStatus={{ loggedIn: false, baseUrl: 'https://api.mxou.cn', models: [], updatedAt: 0 }}
      />
    );

    expect(screen.queryByTestId('desktop-account-settings-trigger')).not.toBeInTheDocument();
    expect(screen.getByText('settings.newApiLogin')).toBeInTheDocument();
  });
});
