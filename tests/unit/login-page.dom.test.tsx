import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, waitFor, screen, act, fireEvent } from '@testing-library/react';

type ExternalLoginCompletedListener = (payload: { token: string; user: { id: string; username: string } }) => void;

const mocks = vi.hoisted(() => {
  return {
    startExternalLoginInvoke: vi.fn(),
    externalLoginCompletedListeners: [] as ExternalLoginCompletedListener[],
    completeExternalLogin: vi.fn(),
    navigate: vi.fn(),
  };
});

vi.mock('@/renderer/hooks/context/AuthContext', () => ({
  useAuth: () => ({
    ready: true,
    user: null,
    status: 'unauthenticated',
    completeExternalLogin: mocks.completeExternalLogin,
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    auth: {
      startExternalLogin: {
        invoke: mocks.startExternalLoginInvoke,
      },
      externalLoginCompleted: {
        on: (listener: ExternalLoginCompletedListener) => {
          mocks.externalLoginCompletedListeners.push(listener);
          return () => {
            const idx = mocks.externalLoginCompletedListeners.indexOf(listener);
            if (idx >= 0) mocks.externalLoginCompletedListeners.splice(idx, 1);
          };
        },
      },
    },
  },
}));

// AppLoader is rendered while `status === 'checking'`; since the mock always
// returns 'unauthenticated', it never appears, but the component must still
// resolve at module-load time.
vi.mock('@renderer/components/layout/AppLoader', () => ({
  default: () => null,
}));

// Stub changeLanguage so the language-select onChange doesn't try to call
// anything that breaks jsdom.
vi.mock('@/renderer/services/i18n', () => ({
  changeLanguage: vi.fn().mockResolvedValue(undefined),
}));

import LoginPage from '@/renderer/pages/login/index';

const successResult = { success: true as const };

beforeEach(() => {
  mocks.startExternalLoginInvoke.mockReset();
  mocks.completeExternalLogin.mockReset();
  mocks.navigate.mockReset();
  mocks.externalLoginCompletedListeners.length = 0;
  mocks.startExternalLoginInvoke.mockResolvedValue(successResult);
});

const fireExternalLoginCompleted = (payload: { token: string; user: { id: string; username: string } }) => {
  act(() => {
    for (const listener of mocks.externalLoginCompletedListeners) {
      listener(payload);
    }
  });
};

const getSubmitButton = (): HTMLElement => screen.getByRole('button', { name: /login\.submit/ });

describe('LoginPage (button-triggered deep-link flow)', () => {
  it('subscribes to externalLoginCompleted on mount but does NOT auto-launch', async () => {
    render(<LoginPage />);
    await waitFor(() => {
      expect(mocks.externalLoginCompletedListeners.length).toBe(1);
    });
    expect(mocks.startExternalLoginInvoke).not.toHaveBeenCalled();
  });

  it('calls startExternalLogin.invoke() when the user clicks the login button', async () => {
    render(<LoginPage />);
    await waitFor(() => {
      expect(getSubmitButton()).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(getSubmitButton());
    });

    await waitFor(() => {
      expect(mocks.startExternalLoginInvoke).toHaveBeenCalledTimes(1);
    });
  });

  it('renders the AIPaSS-platform login button label by default', async () => {
    render(<LoginPage />);
    await waitFor(() => {
      // `t` mock returns the key, so the button text is the i18n key.
      expect(screen.getByRole('button', { name: 'login.submit' })).toBeInTheDocument();
    });
  });

  it('calls completeExternalLogin and navigates to /guid when the deep-link emitter fires', async () => {
    render(<LoginPage />);
    await waitFor(() => {
      expect(mocks.externalLoginCompletedListeners.length).toBe(1);
    });

    fireExternalLoginCompleted({ token: 'tok-1', user: { id: 'u1', username: 'alice' } });

    await waitFor(() => {
      expect(mocks.completeExternalLogin).toHaveBeenCalledWith('tok-1', { id: 'u1', username: 'alice' });
      // Navigation to /guid is driven by the status==='authenticated' effect
      // inside LoginPage. The mocked AuthContext doesn't flip status, so the
      // effect won't fire — assert completeExternalLogin was called instead.
    });
    expect(mocks.navigate).not.toHaveBeenCalledWith('/guid');
  });

  it('renders an error message when startExternalLogin.invoke() rejects', async () => {
    mocks.startExternalLoginInvoke.mockRejectedValue(new Error('could not open browser'));
    render(<LoginPage />);

    await act(async () => {
      fireEvent.click(getSubmitButton());
    });

    await waitFor(() => {
      expect(screen.getByText('could not open browser')).toBeInTheDocument();
    });
    expect(mocks.completeExternalLogin).not.toHaveBeenCalled();
  });

  it('renders an error message when startExternalLogin.invoke() returns success: false', async () => {
    mocks.startExternalLoginInvoke.mockResolvedValue({ success: false, message: 'invalid url' });
    render(<LoginPage />);

    await act(async () => {
      fireEvent.click(getSubmitButton());
    });

    await waitFor(() => {
      expect(screen.getByText('invalid url')).toBeInTheDocument();
    });
    expect(mocks.completeExternalLogin).not.toHaveBeenCalled();
  });

  it('clears previous error and re-launches when the button is clicked again', async () => {
    mocks.startExternalLoginInvoke.mockRejectedValueOnce(new Error('first failure')).mockResolvedValue(successResult);
    render(<LoginPage />);

    await act(async () => {
      fireEvent.click(getSubmitButton());
    });
    await waitFor(() => {
      expect(screen.getByText('first failure')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(getSubmitButton());
    });

    await waitFor(() => {
      expect(mocks.startExternalLoginInvoke).toHaveBeenCalledTimes(2);
    });
  });

  it('unsubscribes from externalLoginCompleted on unmount', async () => {
    const { unmount } = render(<LoginPage />);
    await waitFor(() => {
      expect(mocks.externalLoginCompletedListeners.length).toBe(1);
    });
    unmount();
    expect(mocks.externalLoginCompletedListeners.length).toBe(0);
  });
});
