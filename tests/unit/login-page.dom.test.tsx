import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, waitFor, screen, act } from '@testing-library/react';

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
  useTranslation: () => ({ t: (key: string) => key }),
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

describe('LoginPage (deep-link flow)', () => {
  it('calls startExternalLogin.invoke() once on mount', async () => {
    render(<LoginPage />);
    await waitFor(() => {
      expect(mocks.startExternalLoginInvoke).toHaveBeenCalledTimes(1);
    });
  });

  it('subscribes to externalLoginCompleted once on mount', async () => {
    render(<LoginPage />);
    await waitFor(() => {
      expect(mocks.externalLoginCompletedListeners.length).toBe(1);
    });
  });

  it('calls completeExternalLogin and navigates to /guid when the emitter fires', async () => {
    render(<LoginPage />);
    await waitFor(() => {
      expect(mocks.externalLoginCompletedListeners.length).toBe(1);
    });

    fireExternalLoginCompleted({ token: 'tok-1', user: { id: 'u1', username: 'alice' } });

    await waitFor(() => {
      expect(mocks.completeExternalLogin).toHaveBeenCalledWith('tok-1', { id: 'u1', username: 'alice' });
      expect(mocks.navigate).toHaveBeenCalledWith('/guid', { replace: true });
    });
  });

  it('renders an error alert when startExternalLogin.invoke() rejects', async () => {
    mocks.startExternalLoginInvoke.mockRejectedValue(new Error('window closed'));
    render(<LoginPage />);
    await waitFor(() => {
      expect(screen.getByText('window closed')).toBeInTheDocument();
    });
    expect(mocks.completeExternalLogin).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('renders an error alert when startExternalLogin.invoke() returns success: false', async () => {
    mocks.startExternalLoginInvoke.mockResolvedValue({ success: false, message: 'could not open browser' });
    render(<LoginPage />);
    await waitFor(() => {
      expect(screen.getByText('could not open browser')).toBeInTheDocument();
    });
    expect(mocks.completeExternalLogin).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
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
