/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * @vitest-environment jsdom
 */

import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useSWRConfig } from 'swr';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '@/common/types/platform/auth';

const httpBridgeMocks = vi.hoisted(() => {
  type Listener = (event: { source: 'http' | 'realtime'; code?: string; path?: string }) => void;
  const listeners = new Set<Listener>();
  return {
    listeners,
    httpRequest: vi.fn(async () => undefined),
    onAuthExpired: vi.fn((listener: Listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
    emitAuthExpired(event: Parameters<Listener>[0]) {
      for (const listener of listeners) listener(event);
    },
  };
});

const configServiceMocks = vi.hoisted(() => ({
  reset: vi.fn(),
}));

const accountMocks = vi.hoisted(() => ({
  changePassword: vi.fn(),
}));

vi.mock('@/common/adapter/httpBridge', () => ({
  httpRequest: httpBridgeMocks.httpRequest,
  onAuthExpired: httpBridgeMocks.onAuthExpired,
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  authAccount: {
    changePassword: { invoke: accountMocks.changePassword },
  },
}));

vi.mock('@/common/config/configService', () => ({
  configService: configServiceMocks,
}));

vi.mock('@/renderer/pages/conversation/Preview/context/PreviewContext', async () => {
  const ReactModule = await import('react');
  return {
    PreviewProvider: ({ children }: React.PropsWithChildren) => {
      const [secret, setSecret] = ReactModule.useState('');
      return ReactModule.createElement(
        ReactModule.Fragment,
        null,
        ReactModule.createElement('output', { 'data-testid': 'preview-secret' }, secret || '-'),
        ReactModule.createElement(
          'button',
          { 'data-testid': 'set-preview-secret', onClick: () => setSecret('account-a-preview') },
          'set preview'
        ),
        children
      );
    },
  };
});

type AuthModule = typeof import('@/renderer/hooks/context/AuthContext');
type AccountProvidersModule = typeof import('@/renderer/hooks/context/AuthContext/AccountScopedProviders');
type AccountSWRModule = typeof import('@/renderer/hooks/context/AuthContext/accountSWR');
type AuthSnapshot = ReturnType<AuthModule['useAuth']>;
type SwrCache = ReturnType<typeof useSWRConfig>['cache'];

let AuthProvider: AuthModule['AuthProvider'];
let AccountScopedProviders: AccountProvidersModule['AccountScopedProviders'];
let accountSWRModule: AccountSWRModule;
let useAuth: AuthModule['useAuth'];
let latestAuth: AuthSnapshot | undefined;
let latestCache: SwrCache | undefined;
let originalElectronApi: unknown;

const accountA: AuthUser = {
  id: 'account-a',
  username: 'alice',
  role: 'admin',
  status: 'active',
  must_change_password: false,
};

const accountB: AuthUser = {
  id: 'account-b',
  username: 'bob',
  role: 'member',
  status: 'active',
  must_change_password: false,
};

function userResponse(user: AuthUser): Response {
  return new Response(JSON.stringify({ success: true, user }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function unauthenticatedResponse(): Response {
  return new Response(JSON.stringify({ success: false }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

function buildFetch(initialUser: AuthUser | null): ReturnType<typeof vi.fn> {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/auth/user') return initialUser ? userResponse(initialUser) : unauthenticatedResponse();
    if (url === '/login') {
      const body = JSON.parse(String(init?.body)) as { username: string };
      return userResponse(body.username === accountA.username ? accountA : accountB);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

const Probe: React.FC = () => {
  latestAuth = useAuth();
  latestCache = useSWRConfig().cache;
  return React.createElement(
    'output',
    { 'data-testid': 'auth-status' },
    `${latestAuth.status}:${latestAuth.user?.id ?? '-'}`
  );
};

function renderAuthTree(): ReturnType<typeof render> {
  return render(
    React.createElement(
      AuthProvider,
      null,
      React.createElement(AccountScopedProviders, null, React.createElement(Probe))
    )
  );
}

beforeAll(async () => {
  originalElectronApi = (window as Window & { electronAPI?: unknown }).electronAPI;
  delete (window as Window & { electronAPI?: unknown }).electronAPI;
  const authModule = await import('@/renderer/hooks/context/AuthContext');
  const providersModule = await import('@/renderer/hooks/context/AuthContext/AccountScopedProviders');
  accountSWRModule = await import('@/renderer/hooks/context/AuthContext/accountSWR');
  AuthProvider = authModule.AuthProvider;
  useAuth = authModule.useAuth;
  AccountScopedProviders = providersModule.AccountScopedProviders;
});

afterAll(() => {
  (window as Window & { electronAPI?: unknown }).electronAPI = originalElectronApi;
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  latestAuth = undefined;
  latestCache = undefined;
  httpBridgeMocks.listeners.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('browser account transitions', () => {
  it('replaces SWR and preview memory across account A, logout, and account B', async () => {
    vi.stubGlobal('fetch', buildFetch(null));
    renderAuthTree();
    await waitFor(() => expect(latestAuth?.status).toBe('unauthenticated'));

    await act(async () => {
      await latestAuth?.login({ username: accountA.username, password: 'secret' });
    });
    expect(latestAuth?.user?.id).toBe(accountA.id);
    const accountACache = latestCache;
    await act(async () => {
      await accountSWRModule.mutateAccountCache('providers', [{ owner: accountA.id }], { revalidate: false });
    });
    expect(accountACache?.get('providers')).toMatchObject({ data: [{ owner: accountA.id }] });
    fireEvent.click(screen.getByTestId('set-preview-secret'));
    expect(screen.getByTestId('preview-secret')).toHaveTextContent('account-a-preview');

    await act(async () => {
      await latestAuth?.logout();
    });
    expect(latestAuth?.status).toBe('unauthenticated');
    expect(latestCache).not.toBe(accountACache);
    expect(latestCache?.get('providers')).toBeUndefined();
    expect(screen.getByTestId('preview-secret')).toHaveTextContent('-');

    await act(async () => {
      await latestAuth?.login({ username: accountB.username, password: 'secret' });
    });
    expect(latestAuth?.user?.id).toBe(accountB.id);
    expect(latestCache).not.toBe(accountACache);
    expect(latestCache?.get('providers')).toBeUndefined();
    expect(screen.getByTestId('preview-secret')).toHaveTextContent('-');

    await act(async () => {
      await accountSWRModule.mutateAccountCache('providers', [{ owner: accountB.id }], { revalidate: false });
    });
    expect(latestCache?.get('providers')).toMatchObject({ data: [{ owner: accountB.id }] });
  });

  it('centralizes realtime expiry into a full unauthenticated transition', async () => {
    vi.stubGlobal('fetch', buildFetch(accountA));
    renderAuthTree();
    await waitFor(() => expect(latestAuth?.user?.id).toBe(accountA.id));
    const accountACache = latestCache;
    act(() => accountACache?.set('conversation/account-a', { secret: true }));

    act(() => httpBridgeMocks.emitAuthExpired({ source: 'realtime', code: 'REALTIME_AUTH_EXPIRED' }));

    expect(latestAuth?.status).toBe('unauthenticated');
    expect(latestAuth?.user).toBeNull();
    expect(configServiceMocks.reset).toHaveBeenCalled();
    expect(latestCache).not.toBe(accountACache);
    expect(latestCache?.get('conversation/account-a')).toBeUndefined();
  });

  it('keeps the same account cache while a current-user refresh is checking', async () => {
    vi.stubGlobal('fetch', buildFetch(accountA));
    renderAuthTree();
    await waitFor(() => expect(latestAuth?.user?.id).toBe(accountA.id));
    const accountACache = latestCache;
    await act(async () => {
      await accountSWRModule.mutateAccountCache('providers', [{ owner: accountA.id }], { revalidate: false });
      await latestAuth?.refresh();
    });

    expect(latestAuth?.user?.id).toBe(accountA.id);
    expect(latestCache).toBe(accountACache);
    expect(latestCache?.get('providers')).toMatchObject({ data: [{ owner: accountA.id }] });
  });

  it('keeps the newest refresh result when an aborted older request resolves last', async () => {
    const fetchMock = buildFetch(null);
    vi.stubGlobal('fetch', fetchMock);
    renderAuthTree();
    await waitFor(() => expect(latestAuth?.status).toBe('unauthenticated'));

    let resolveOlder: ((response: Response) => void) | undefined;
    let olderSignal: AbortSignal | null = null;
    const olderResponse = new Promise<Response>((resolve) => {
      resolveOlder = resolve;
    });
    fetchMock.mockImplementationOnce((_input: RequestInfo | URL, init?: RequestInit) => {
      olderSignal = init?.signal as AbortSignal;
      return olderResponse;
    });
    fetchMock.mockResolvedValueOnce(userResponse(accountB));

    let olderRefresh: Promise<void> | undefined;
    await act(async () => {
      olderRefresh = latestAuth?.refresh();
      await Promise.resolve();
    });
    await act(async () => {
      await latestAuth?.refresh();
    });
    expect(olderSignal?.aborted).toBe(true);
    expect(latestAuth?.user?.id).toBe(accountB.id);

    resolveOlder?.(userResponse(accountA));
    await act(async () => {
      await olderRefresh;
    });
    expect(latestAuth?.user?.id).toBe(accountB.id);
  });

  it('aborts an in-flight refresh and ignores its result after logout', async () => {
    const fetchMock = buildFetch(accountA);
    vi.stubGlobal('fetch', fetchMock);
    renderAuthTree();
    await waitFor(() => expect(latestAuth?.user?.id).toBe(accountA.id));

    let resolveRefresh: ((response: Response) => void) | undefined;
    let refreshSignal: AbortSignal | null = null;
    const pendingResponse = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    fetchMock.mockImplementationOnce((_input: RequestInfo | URL, init?: RequestInit) => {
      refreshSignal = init?.signal as AbortSignal;
      return pendingResponse;
    });

    let pendingRefresh: Promise<void> | undefined;
    await act(async () => {
      pendingRefresh = latestAuth?.refresh();
      await Promise.resolve();
    });
    await act(async () => {
      await latestAuth?.logout();
    });
    expect(refreshSignal?.aborted).toBe(true);
    expect(latestAuth?.status).toBe('unauthenticated');

    resolveRefresh?.(userResponse(accountB));
    await act(async () => {
      await pendingRefresh;
    });
    expect(latestAuth?.status).toBe('unauthenticated');
    expect(latestAuth?.user).toBeNull();
  });
});
