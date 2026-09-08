import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { ipcBridge } from '@/common';
import type {
  GeaEnvironmentStatus,
  GeaEnvironmentUpdateResult,
  LarkAuthResult,
  LarkAuthUser,
  LarkQrLoginPollResult,
  LarkQrLoginSession,
} from '@/common/types/platform/larkAuth';
import { PREVIEW_SCOPE_KEY_PREFIX } from '@/renderer/pages/conversation/Preview/context/previewScope';
import { resumeRealtimeWebSocket } from '@/common/adapter/httpBridge';

type AuthStatus = 'checking' | 'authenticated' | 'unauthenticated';

export type AuthUser = LarkAuthUser;

type AuthContextValue = {
  ready: boolean;
  user: AuthUser | null;
  status: AuthStatus;
  /** Changes whenever the authenticated session identity changes. */
  authSessionEpoch: number;
  getGeaEnvironment: () => Promise<LarkAuthResult<GeaEnvironmentStatus>>;
  updateGeaEnvironment: (baseUrl: string) => Promise<LarkAuthResult<GeaEnvironmentUpdateResult>>;
  startLarkQrLogin: () => Promise<LarkAuthResult<LarkQrLoginSession>>;
  pollLarkQrLogin: (qrcodeId: string) => Promise<LarkAuthResult<LarkQrLoginPollResult>>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  clearAuthCache: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const AUTH_USER_ENDPOINT = '/api/auth/user';
const isDesktopRuntime = typeof window !== 'undefined' && Boolean(window.electronAPI);

let authSessionEpoch = 0;
const authSessionEpochListeners = new Set<() => void>();

const subscribeAuthSessionEpoch = (listener: () => void): (() => void) => {
  authSessionEpochListeners.add(listener);
  return () => authSessionEpochListeners.delete(listener);
};

export const getAuthSessionEpochSnapshot = (): number => authSessionEpoch;

/** Publish an authenticated-session boundary without exposing an external id
 * as a Core user id. Shared caches subscribe to the monotonically increasing
 * epoch and resolve their own Core-scoped values again. */
export const notifyAuthSessionChanged = (): void => {
  authSessionEpoch += 1;
  for (const listener of authSessionEpochListeners) listener();
};

export const useAuthSessionEpoch = (): number =>
  useSyncExternalStore(subscribeAuthSessionEpoch, getAuthSessionEpochSnapshot, getAuthSessionEpochSnapshot);

/** Reset the module store between tests. */
export const resetAuthSessionEpochForTests = (): void => {
  authSessionEpoch = 0;
  for (const listener of authSessionEpochListeners) listener();
};

function clearAuthCache(): void {
  if (typeof window === 'undefined') return;

  try {
    const keysToRemove: string[] = [];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
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

async function fetchLarkAuthResult<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<LarkAuthResult<T>> {
  try {
    const response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
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
  const sessionEpoch = useAuthSessionEpoch();
  const abortRef = useRef<AbortController | null>(null);
  const authOperationEpochRef = useRef(0);
  const authIdentityRef = useRef('checking');
  const pendingAuthRequestsRef = useRef(new Set<Promise<unknown>>());

  const beginAuthOperation = useCallback((): { controller: AbortController; epoch: number } => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    authOperationEpochRef.current += 1;
    return { controller, epoch: authOperationEpochRef.current };
  }, []);

  const invalidateAuthOperations = useCallback((): number => {
    authOperationEpochRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    return authOperationEpochRef.current;
  }, []);

  const trackAuthRequest = useCallback(function track<T>(request: Promise<T>): Promise<T> {
    pendingAuthRequestsRef.current.add(request);
    void request.then(
      () => pendingAuthRequestsRef.current.delete(request),
      () => pendingAuthRequestsRef.current.delete(request)
    );
    return request;
  }, []);

  const publishAuthState = useCallback(
    (nextStatus: Exclude<AuthStatus, 'checking'>, nextUser: AuthUser | null, forceSessionBoundary = false) => {
      // The external user id is only an invalidation signal. Core-scoped callers
      // must still resolve Core's own user id after this epoch changes. A newly
      // established WebHost session is a boundary even for the same identity.
      const nextIdentity = nextStatus === 'authenticated' ? `authenticated:${nextUser?.id ?? 'unknown'}` : nextStatus;
      if (forceSessionBoundary || authIdentityRef.current !== nextIdentity) {
        authIdentityRef.current = nextIdentity;
        notifyAuthSessionChanged();
      }
      setUser(nextUser);
      setStatus(nextStatus);
    },
    []
  );

  const refresh = useCallback(async () => {
    const operation = beginAuthOperation();
    if (isDesktopRuntime) {
      const request = trackAuthRequest(ipcBridge.larkAuth.status.invoke());
      const result = await request;
      if (authOperationEpochRef.current !== operation.epoch) return;
      if (result.success && result.data.authenticated && result.data.user) {
        publishAuthState('authenticated', result.data.user);
      } else {
        publishAuthState('unauthenticated', null);
      }
      setReady(true);
      return;
    }

    setStatus('checking');
    const request = trackAuthRequest(fetchCurrentUser(operation.controller.signal));
    const currentUser = await request;
    if (authOperationEpochRef.current !== operation.epoch) return;
    if (currentUser) {
      publishAuthState('authenticated', currentUser);
    } else {
      publishAuthState('unauthenticated', null);
    }
    setReady(true);
  }, [beginAuthOperation, publishAuthState, trackAuthRequest]);

  useEffect(() => {
    void refresh();
    return () => {
      invalidateAuthOperations();
    };
  }, [invalidateAuthOperations, refresh]);

  const startLarkQrLogin = useCallback(
    () =>
      isDesktopRuntime
        ? ipcBridge.larkAuth.createQrSession.invoke()
        : fetchLarkAuthResult<LarkQrLoginSession>('/api/lark-auth/qr-session', {}),
    []
  );

  const getGeaEnvironment = useCallback(
    () =>
      isDesktopRuntime
        ? ipcBridge.larkAuth.environment.invoke()
        : fetchLarkAuthResult<GeaEnvironmentStatus>('/api/lark-auth/environment'),
    []
  );

  const updateGeaEnvironment = useCallback(
    async (baseUrl: string): Promise<LarkAuthResult<GeaEnvironmentUpdateResult>> => {
      if (!isDesktopRuntime) return { success: false, code: 'invalidResponse' };
      const epoch = invalidateAuthOperations();
      publishAuthState('unauthenticated', null);
      clearAuthCache();
      setReady(true);
      const result = await ipcBridge.larkAuth.updateEnvironment.invoke({ baseUrl });
      if (authOperationEpochRef.current !== epoch) return { success: false, code: 'invalidResponse' };
      // Polls started before the switch may finish later, but cannot republish the old identity.
      return result;
    },
    [invalidateAuthOperations, publishAuthState]
  );

  const pollLarkQrLogin = useCallback(
    async (qrcodeId: string) => {
      const operation = beginAuthOperation();
      const request = trackAuthRequest(
        isDesktopRuntime
          ? ipcBridge.larkAuth.pollQrSession.invoke({ qrcodeId })
          : fetchLarkAuthResult<LarkQrLoginPollResult>('/api/lark-auth/poll', { qrcodeId }, operation.controller.signal)
      );
      const result = await request;
      if (authOperationEpochRef.current !== operation.epoch) return result;
      if (result.success && result.data.status === 'authenticated' && result.data.user) {
        publishAuthState('authenticated', result.data.user, !isDesktopRuntime);
        setReady(true);
        if (!isDesktopRuntime) {
          const reconnect = (
            window as Window & {
              __websocketReconnect?: (authSessionEpoch: number) => void;
            }
          ).__websocketReconnect;
          const nextAuthSessionEpoch = getAuthSessionEpochSnapshot();
          reconnect?.(nextAuthSessionEpoch);
          resumeRealtimeWebSocket(nextAuthSessionEpoch);
        }
      }
      return result;
    },
    [beginAuthOperation, publishAuthState, trackAuthRequest]
  );

  const logout = useCallback(async () => {
    const pendingAuthRequests = [...pendingAuthRequestsRef.current];
    const operationEpoch = invalidateAuthOperations();
    if (isDesktopRuntime) {
      await Promise.allSettled(pendingAuthRequests);
      if (authOperationEpochRef.current !== operationEpoch) return;
      const result = await ipcBridge.larkAuth.logout.invoke();
      if (result.success === false) throw new Error(result.code);
      if (authOperationEpochRef.current !== operationEpoch) return;
      publishAuthState('unauthenticated', null);
      setReady(true);
      clearAuthCache();
      return;
    }

    publishAuthState('unauthenticated', null, true);
    clearAuthCache();
    await Promise.allSettled(pendingAuthRequests);
    if (authOperationEpochRef.current !== operationEpoch) return;
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await fetch('/api/lark-auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
        signal: controller.signal,
      });
    } catch (error) {
      console.error('Logout request failed:', error);
    }
  }, [invalidateAuthOperations, publishAuthState]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      user,
      status,
      authSessionEpoch: sessionEpoch,
      getGeaEnvironment,
      startLarkQrLogin,
      updateGeaEnvironment,
      pollLarkQrLogin,
      logout,
      refresh,
      clearAuthCache,
    }),
    [
      getGeaEnvironment,
      logout,
      pollLarkQrLogin,
      ready,
      refresh,
      sessionEpoch,
      startLarkQrLogin,
      status,
      updateGeaEnvironment,
      user,
    ]
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
