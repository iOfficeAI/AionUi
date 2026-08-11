import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

// Mock window.matchMedia for Arco Design responsive observer
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// === Mocking Dependencies === //

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en-US' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

const mockMessageSuccess = vi.fn();
const mockMessageError = vi.fn();

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      ...actual.Message,
      useMessage: () => [
        { success: mockMessageSuccess, error: mockMessageError, info: vi.fn(), warning: vi.fn() },
        <div key='message-holder' data-testid='message-holder' />,
      ],
    },
  };
});

vi.mock('@icon-park/react', () => ({}));

vi.mock('@/renderer/components/base/AionScrollArea', () => ({
  default: ({ children }: any) => <div data-testid='scroll-area'>{children}</div>,
}));

vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'dark' }),
}));

vi.mock('@/renderer/components/settings/SettingsModal/settingsViewContext', () => ({
  useSettingsViewMode: () => 'modal',
}));

// IPC Bridge mocks
const mockGoogleAuthLogin = vi.fn();
const mockGoogleAuthLogout = vi.fn();
const mockGoogleAuthStatus = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    googleAuth: {
      login: { invoke: (...args: any[]) => mockGoogleAuthLogin(...args) },
      logout: { invoke: (...args: any[]) => mockGoogleAuthLogout(...args) },
      status: { invoke: (...args: any[]) => mockGoogleAuthStatus(...args) },
    },
  },
}));

vi.mock('@/common/config/storage', () => ({
  ConfigStorage: {
    get: vi.fn().mockResolvedValue({}),
    set: vi.fn().mockResolvedValue(undefined),
  },
}));

import GeminiModalContent from '@/renderer/components/settings/SettingsModal/contents/GeminiModalContent';

describe('GeminiModalContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGoogleAuthStatus.mockResolvedValue({ success: false });
  });

  it('renders the Google login button', async () => {
    await act(async () => {
      render(<GeminiModalContent />);
    });

    const loginButton = screen.getByText('settings.googleLogin');
    expect(loginButton).toBeTruthy();
  });

  it('does not call message.error after unmount when login fails', async () => {
    // Login returns a pending promise that we control
    let rejectLogin!: (error: Error) => void;
    mockGoogleAuthLogin.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectLogin = reject;
      })
    );

    const { unmount } = await act(async () => {
      return render(<GeminiModalContent />);
    });

    // Click login button
    const loginButton = screen.getByText('settings.googleLogin');
    await act(async () => {
      fireEvent.click(loginButton);
    });

    // Unmount the component while login is still pending
    unmount();

    // Now reject the login promise (simulates async failure after unmount)
    await act(async () => {
      rejectLogin(new Error('Network error'));
    });

    // message.error should NOT have been called because component is unmounted
    expect(mockMessageError).not.toHaveBeenCalled();
  });

  it('calls message.error when login fails while mounted', async () => {
    mockGoogleAuthLogin.mockRejectedValue(new Error('Network error'));

    await act(async () => {
      render(<GeminiModalContent />);
    });

    const loginButton = screen.getByText('settings.googleLogin');
    await act(async () => {
      fireEvent.click(loginButton);
    });

    expect(mockMessageError).toHaveBeenCalled();
  });

  it('does not call message.success after unmount when login succeeds', async () => {
    let resolveLogin!: (value: any) => void;
    mockGoogleAuthLogin.mockReturnValue(
      new Promise((resolve) => {
        resolveLogin = resolve;
      })
    );

    const { unmount } = await act(async () => {
      return render(<GeminiModalContent />);
    });

    const loginButton = screen.getByText('settings.googleLogin');
    await act(async () => {
      fireEvent.click(loginButton);
    });

    unmount();

    await act(async () => {
      resolveLogin({ success: true, data: { account: 'test@gmail.com' } });
    });

    expect(mockMessageSuccess).not.toHaveBeenCalled();
  });
});
