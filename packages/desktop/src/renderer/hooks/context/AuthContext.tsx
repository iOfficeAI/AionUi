import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { PREVIEW_SCOPE_KEY_PREFIX } from '@/renderer/pages/conversation/Preview/context/previewScope';
import { AIPAAS_BASE_URL } from '@/renderer/api';

const LOGOUT_ENDPOINT = `${AIPAAS_BASE_URL}/system/security/logout/logout`;

type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated';

export interface AuthUser {
  id: string;
  username: string;
  token: string;
}

interface ExternalAuthPayload {
  token: string;
  userId: string;
  username: string;
}

interface AuthContextValue {
  ready: boolean;
  user: AuthUser | null;
  status: AuthStatus;
  completeExternalLogin: (token: string, user: { id: string; username: string }) => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const EXTERNAL_AUTH_STORAGE_KEY = 'external_auth';

function clearAuthCache(): void {
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (
        key &&
        (key.includes('auth') ||
          key.includes('csrf') ||
          key.includes('token') ||
          key.startsWith(PREVIEW_SCOPE_KEY_PREFIX))
      ) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    console.error('Failed to clear auth cache:', error);
  }
}

function readExternalAuth(): ExternalAuthPayload | null {
  try {
    const raw = localStorage.getItem(EXTERNAL_AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ExternalAuthPayload>;
    if (typeof parsed.token !== 'string' || !parsed.token) return null;
    if (typeof parsed.userId !== 'string' || !parsed.userId) return null;
    if (typeof parsed.username !== 'string' || !parsed.username) return null;
    return { token: parsed.token, userId: parsed.userId, username: parsed.username };
  } catch (error) {
    console.error('Failed to read external_auth:', error);
    return null;
  }
}

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    setStatus('checking');
    const stored = readExternalAuth();
    if (stored) {
      setUser({ id: stored.userId, username: stored.username, token: stored.token });
      setStatus('authenticated');
    } else {
      setUser(null);
      setStatus('unauthenticated');
    }
    setReady(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const completeExternalLogin = useCallback((token: string, payload: { id: string; username: string }) => {
    const record: ExternalAuthPayload = {
      token,
      userId: payload.id,
      username: payload.username,
    };
    try {
      localStorage.setItem(EXTERNAL_AUTH_STORAGE_KEY, JSON.stringify(record));
    } catch (error) {
      console.error('Failed to persist external_auth:', error);
    }
    setUser({ id: payload.id, username: payload.username, token });
    setStatus('authenticated');
    setReady(true);
  }, []);

  const logout = useCallback(async () => {
    const token = readExternalAuth()?.token;
    if (token) {
      try {
        await fetch(LOGOUT_ENDPOINT, {
          method: 'POST',
          headers: { token },
        });
      } catch (error) {
        console.error('Logout request failed:', error);
      }
    }
    setUser(null);
    setStatus('unauthenticated');
    clearAuthCache();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      user,
      status,
      completeExternalLogin,
      logout,
      refresh,
    }),
    [completeExternalLogin, logout, ready, refresh, status, user]
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
