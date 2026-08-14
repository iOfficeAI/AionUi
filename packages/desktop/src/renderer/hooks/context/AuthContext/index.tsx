/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { httpRequest, onAuthExpired } from '@/common/adapter/httpBridge';
import { authAccount } from '@/common/adapter/ipcBridge';
import { configService } from '@/common/config/configService';
import type { AuthUser } from '@/common/types/platform/auth';
import {
  clearAccountScopedBrowserState,
  normalizeAuthUserPayload,
  prepareAccountLogout,
  prepareAuthenticatedAccount,
} from './authStorage';

type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated';

export type { AuthUser } from '@/common/types/platform/auth';

type LoginParams = {
  username: string;
  password: string;
  remember?: boolean;
};

type LoginErrorCode = 'invalidCredentials' | 'tooManyAttempts' | 'serverError' | 'networkError' | 'unknown';

type LoginResult = {
  success: boolean;
  code?: LoginErrorCode;
  user?: AuthUser;
};

type ChangePasswordParams = {
  currentPassword: string;
  newPassword: string;
};

type AuthContextValue = {
  ready: boolean;
  user: AuthUser | null;
  status: AuthStatus;
  login: (params: LoginParams) => Promise<LoginResult>;
  changePassword: (params: ChangePasswordParams) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  clearAuthCache: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const AUTH_USER_ENDPOINT = '/api/auth/user';

const isDesktopRuntime = typeof window !== 'undefined' && Boolean(window.electronAPI);

// Clear browser state that may contain data from the previous account.
function clearAuthCache(): void {
  if (typeof window === 'undefined') return;

  try {
    clearAccountScopedBrowserState();
  } catch (error) {
    console.error('Failed to clear auth cache:', error);
  }
}

async function fetchCurrentUser(signal?: AbortSignal): Promise<AuthUser | null> {
  try {
    const response = await fetch(AUTH_USER_ENDPOINT, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      signal,
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      success?: boolean;
      user?: unknown;
      data?: unknown;
    };
    let nestedUser: unknown = data.data;
    if (data.data && typeof data.data === 'object' && 'user' in data.data) {
      nestedUser = (data.data as { user?: unknown }).user;
    }
    return normalizeAuthUserPayload(data.user ?? nestedUser);
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      return null;
    }
    console.error('Failed to fetch current user:', error);
  }

  return null;
}

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [ready, setReady] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const authGenerationRef = useRef(0);
  const currentUserIdRef = useRef<string | undefined>(undefined);
  currentUserIdRef.current = user?.id;

  const invalidatePendingRefresh = useCallback((): void => {
    authGenerationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const completeUnauthenticatedTransition = useCallback((): void => {
    prepareAccountLogout(currentUserIdRef.current);
    configService.reset();
    setUser(null);
    setStatus('unauthenticated');
    setReady(true);
  }, []);

  const acceptAuthenticatedUser = useCallback((nextUser: AuthUser): void => {
    if (prepareAuthenticatedAccount(nextUser.id)) configService.reset();
    setUser(nextUser);
    setStatus('authenticated');
    setReady(true);
  }, []);

  const refresh = useCallback(async () => {
    invalidatePendingRefresh();
    if (isDesktopRuntime) {
      setStatus('authenticated');
      setUser(null);
      setReady(true);
      return;
    }

    const generation = authGenerationRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('checking');

    const currentUser = await fetchCurrentUser(controller.signal);
    if (controller.signal.aborted || abortRef.current !== controller || authGenerationRef.current !== generation) {
      return;
    }
    abortRef.current = null;
    if (currentUser?.status === 'active') {
      acceptAuthenticatedUser(currentUser);
    } else {
      completeUnauthenticatedTransition();
    }
  }, [acceptAuthenticatedUser, completeUnauthenticatedTransition, invalidatePendingRefresh]);

  useEffect(() => {
    void refresh();
    return invalidatePendingRefresh;
  }, [invalidatePendingRefresh, refresh]);

  useEffect(() => {
    if (isDesktopRuntime) return undefined;
    return onAuthExpired(() => {
      invalidatePendingRefresh();
      completeUnauthenticatedTransition();
    });
  }, [completeUnauthenticatedTransition, invalidatePendingRefresh]);

  const login = useCallback(
    async ({ username, password, remember }: LoginParams): Promise<LoginResult> => {
      try {
        if (isDesktopRuntime) {
          setReady(true);
          return { success: true };
        }

        invalidatePendingRefresh();

        // Login is intentionally CSRF-exempt and establishes the authenticated session.
        const response = await fetch('/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          cache: 'no-store',
          body: JSON.stringify({ username, password, remember }),
        });

        const data = (await response.json()) as {
          success: boolean;
          user?: unknown;
        };

        const authenticatedUser = normalizeAuthUserPayload(data.user);

        if (!response.ok || !data.success || !authenticatedUser || authenticatedUser.status !== 'active') {
          let code: LoginErrorCode = 'unknown';

          if (response.status === 401) {
            code = 'invalidCredentials';
          } else if (response.status === 429) {
            code = 'tooManyAttempts';
          } else if (response.status >= 500) {
            code = 'serverError';
          }

          return {
            success: false,
            code,
          };
        }

        acceptAuthenticatedUser(authenticatedUser);

        // Re-enable WebSocket reconnection after successful login (WebUI mode only)
        const reconnect = (window as Window & { __websocketReconnect?: () => void }).__websocketReconnect;
        if (reconnect) {
          reconnect();
        }

        return { success: true, user: authenticatedUser };
      } catch (error) {
        console.error('Login request failed:', error);
        return {
          success: false,
          code: 'networkError',
        };
      }
    },
    [acceptAuthenticatedUser, invalidatePendingRefresh]
  );

  const changePassword = useCallback(
    async ({ currentPassword, newPassword }: ChangePasswordParams): Promise<AuthUser> => {
      invalidatePendingRefresh();
      const responseUser = await authAccount.changePassword.invoke({
        current_password: currentPassword,
        new_password: newPassword,
      });
      const nextUser = normalizeAuthUserPayload(responseUser);
      if (!nextUser) throw new Error('INVALID_AUTH_USER_RESPONSE');
      acceptAuthenticatedUser(nextUser);
      return nextUser;
    },
    [acceptAuthenticatedUser, invalidatePendingRefresh]
  );

  const logout = useCallback(async () => {
    invalidatePendingRefresh();
    if (isDesktopRuntime) {
      setUser(null);
      setStatus('authenticated');
      setReady(true);
      return;
    }

    try {
      await httpRequest<void>('POST', '/logout');
    } catch (error) {
      console.error('Logout request failed:', error);
    } finally {
      completeUnauthenticatedTransition();
    }
  }, [completeUnauthenticatedTransition, invalidatePendingRefresh]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      user,
      status,
      login,
      changePassword,
      logout,
      refresh,
      clearAuthCache,
    }),
    [changePassword, login, logout, ready, refresh, status, user]
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
