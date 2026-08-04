import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ipcBridge } from '@/common';
import type {
  LarkAuthResult,
  LarkAuthUser,
  LarkQrLoginPollResult,
  LarkQrLoginSession,
} from '@/common/types/platform/larkAuth';

type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated';

export type AuthUser = LarkAuthUser;

type AuthContextValue = {
  ready: boolean;
  user: AuthUser | null;
  status: AuthStatus;
  startLarkQrLogin: () => Promise<LarkAuthResult<LarkQrLoginSession>>;
  pollLarkQrLogin: (qrcodeId: string) => Promise<LarkAuthResult<LarkQrLoginPollResult>>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  clearAuthCache: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const AUTH_USER_ENDPOINT = '/api/auth/user';
const isDesktopRuntime = typeof window !== 'undefined' && Boolean(window.electronAPI);

function clearAuthCache(): void {
  if (typeof window === 'undefined') return;

  try {
    const keysToRemove: string[] = [];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key && (key.includes('auth') || key.includes('csrf') || key.includes('token'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    console.error('Failed to clear auth cache:', error);
  }
}

async function fetchCurrentUser(signal?: AbortSignal): Promise<AuthUser | null> {
  try {
    const response = await fetch(AUTH_USER_ENDPOINT, {
      method: 'GET',
      credentials: 'include',
      signal,
    });
    if (!response.ok) return null;

    const data = (await response.json()) as { success: boolean; user?: AuthUser };
    return data.success && data.user ? data.user : null;
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      console.error('Failed to fetch current user:', error);
    }
    return null;
  }
}

async function fetchLarkAuthResult<T>(path: string, body?: unknown): Promise<LarkAuthResult<T>> {
  try {
    const response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      return { success: false, code: response.status >= 500 ? 'serverError' : 'invalidResponse' };
    }
    return (await response.json()) as LarkAuthResult<T>;
  } catch {
    return { success: false, code: 'networkError' };
  }
}

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [ready, setReady] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (isDesktopRuntime) {
      const result = await ipcBridge.larkAuth.status.invoke();
      if (result.success && result.data.authenticated && result.data.user) {
        setStatus('authenticated');
        setUser(result.data.user);
      } else {
        setStatus('unauthenticated');
        setUser(null);
      }
      setReady(true);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('checking');
    const currentUser = await fetchCurrentUser(controller.signal);
    if (currentUser) {
      setUser(currentUser);
      setStatus('authenticated');
    } else {
      setUser(null);
      setStatus('unauthenticated');
    }
    setReady(true);
  }, []);

  useEffect(() => {
    void refresh();
    return () => abortRef.current?.abort();
  }, [refresh]);

  const startLarkQrLogin = useCallback(
    () =>
      isDesktopRuntime
        ? ipcBridge.larkAuth.createQrSession.invoke()
        : fetchLarkAuthResult<LarkQrLoginSession>('/api/lark-auth/qr-session', {}),
    []
  );

  const pollLarkQrLogin = useCallback(async (qrcodeId: string) => {
    const result = isDesktopRuntime
      ? await ipcBridge.larkAuth.pollQrSession.invoke({ qrcodeId })
      : await fetchLarkAuthResult<LarkQrLoginPollResult>('/api/lark-auth/poll', { qrcodeId });
    if (result.success && result.data.status === 'authenticated' && result.data.user) {
      setUser(result.data.user);
      setStatus('authenticated');
      setReady(true);
      if (!isDesktopRuntime) {
        const reconnect = (window as Window & { __websocketReconnect?: () => void }).__websocketReconnect;
        reconnect?.();
      }
    }
    return result;
  }, []);

  const logout = useCallback(async () => {
    if (isDesktopRuntime) {
      await ipcBridge.larkAuth.logout.invoke();
      setUser(null);
      setStatus('unauthenticated');
      setReady(true);
      return;
    }

    try {
      await fetch('/api/lark-auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
    } catch (error) {
      console.error('Logout request failed:', error);
    } finally {
      setUser(null);
      setStatus('unauthenticated');
      clearAuthCache();
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      user,
      status,
      startLarkQrLogin,
      pollLarkQrLogin,
      logout,
      refresh,
      clearAuthCache,
    }),
    [logout, pollLarkQrLogin, ready, refresh, startLarkQrLogin, status, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
