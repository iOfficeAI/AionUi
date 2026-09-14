import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '@/renderer/hooks/context/AuthContext';

type ElectronWindow = Window & {
  electronAPI?: {
    aibangAuth: {
      login: ReturnType<typeof vi.fn>;
      getStatus: ReturnType<typeof vi.fn>;
      refreshSession: ReturnType<typeof vi.fn>;
      clearSession: ReturnType<typeof vi.fn>;
    };
  };
};

describe('desktop AuthContext', () => {
  afterEach(() => {
    (window as ElectronWindow).electronAPI = undefined;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps new-api credentials outside the renderer while handling 2FA', async () => {
    const fetchSpy = vi.spyOn(window, 'fetch').mockResolvedValue(new Response('{}'));
    const electronAPI = {
      aibangAuth: {
        refreshSession: vi.fn(async () => ({
          authenticated: true,
          user: { id: 7, username: 'mainf', quota: 1000 },
        })),
        login: vi
          .fn()
          .mockResolvedValueOnce({ success: true, twoFactorRequired: true })
          .mockResolvedValueOnce({
            success: true,
            twoFactorRequired: false,
            expiresAt: Date.now() + 60_000,
            user: { id: 7, username: 'mainf', quota: 1000 },
          }),
        getStatus: vi.fn(async () => ({
          authenticated: true,
          user: { id: 7, username: 'mainf', quota: 1000 },
        })),
        clearSession: vi.fn(async () => undefined),
      },
    };
    (window as ElectronWindow).electronAPI = electronAPI;

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(result.current.user).toEqual({ id: '7', username: 'mainf', quota: 1000 });

    await act(() => result.current.login({ username: 'mainf', password: 'password' }));
    expect(result.current.user).toEqual({ id: '7', username: 'mainf', quota: 1000 });

    expect(electronAPI.aibangAuth.login).toHaveBeenNthCalledWith(1, {
      username: 'mainf',
      password: 'password',
      totpCode: undefined,
    });

    await act(() =>
      result.current.login({
        username: 'mainf',
        password: 'password',
        totpCode: '123456',
      })
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(electronAPI.aibangAuth.login).toHaveBeenNthCalledWith(2, {
      username: 'mainf',
      password: 'password',
      totpCode: '123456',
    });

    await act(() => result.current.logout());
    expect(electronAPI.aibangAuth.clearSession).toHaveBeenCalled();
    expect(result.current.status).toBe('unauthenticated');
  });

  it('returns to the login page when the desktop session poll detects key expiry', async () => {
    vi.useFakeTimers();
    (window as ElectronWindow).electronAPI = {
      aibangAuth: {
        refreshSession: vi
          .fn()
          .mockResolvedValueOnce({
            authenticated: true,
            user: { id: 7, username: 'mainf', quota: 1000 },
          })
          .mockResolvedValueOnce({ authenticated: false }),
        login: vi.fn(),
        getStatus: vi.fn(),
        clearSession: vi.fn(async () => undefined),
      },
    };

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await act(async () => {});
    expect(result.current.status).toBe('authenticated');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });

    expect(result.current.status).toBe('unauthenticated');
    expect(result.current.user).toBeNull();
  });
});
