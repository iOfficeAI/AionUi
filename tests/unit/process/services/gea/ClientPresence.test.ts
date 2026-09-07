import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('node:os', async (original) => ({
  ...(await original<typeof import('node:os')>()),
  platform: () => 'darwin',
  arch: () => 'arm64',
}));

const desktop = vi.hoisted(() => ({ directory: '' }));
vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getVersion: () => '1.0.0',
    getPath: () => desktop.directory,
    once: vi.fn(),
    removeListener: vi.fn(),
  },
  net: { fetch: (...args: Parameters<typeof fetch>) => fetch(...args) },
  powerMonitor: { on: vi.fn(), removeListener: vi.fn() },
  safeStorage: {},
}));

import {
  initializeSharedLarkAuthSession,
  logoutSharedLarkAuthSession,
  resetSharedLarkAuthServiceForTests,
} from '@process/services/gea/LarkAuthService';
import { initializeGeaEnvironment, resetGeaEnvironmentForTests } from '@process/services/gea/GeaEnvironmentService';

const heartbeats: { body: Record<string, unknown>; headers: Headers }[] = [];
beforeEach(async () => {
  desktop.directory = await mkdtemp(path.join(os.tmpdir(), 'gea-presence-'));
  vi.useFakeTimers();
  vi.stubEnv('AIONUI_GEA_CLIENT_INTEGRATION', '1');
  vi.stubEnv('AIONUI_GEA_VERSION_CODE', '100');
  initializeGeaEnvironment({ isPackaged: false, env: { AIONUI_GEA_BASE_URL: 'http://127.0.0.1:1234/gea-boot' } });
  heartbeats.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/v1/client/devices/heartbeat')) {
        heartbeats.push({ body: JSON.parse(init!.body as string), headers: new Headers(init!.headers) });
        return new Response(JSON.stringify({ success: true, result: { heartbeatIntervalSeconds: 30 } }));
      }
      if (url.includes('/sys/user/getUserInfo'))
        return new Response(
          JSON.stringify({
            success: true,
            result: { userInfo: { id: 'user-1', username: 'test', realname: 'Test', loginTenantId: '0' } },
          })
        );
      return new Response('{}');
    })
  );
});
afterEach(async () => {
  resetSharedLarkAuthServiceForTests();
  resetGeaEnvironmentForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await rm(desktop.directory, { recursive: true, force: true });
});

it('restores login, immediately heartbeats with a stable installation ID, and stops on logout', async () => {
  const store = { load: async () => ({ accessToken: 'test-token' }), save: vi.fn(), clear: vi.fn() };
  await initializeSharedLarkAuthSession(store);
  await vi.waitFor(() => expect(heartbeats).toHaveLength(1));
  const first = heartbeats[0];
  expect(first.body.deviceInstanceId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(first.body).not.toHaveProperty('userId');
  expect(first.body).not.toHaveProperty('tenantId');
  expect(first.body.versionCode).toBe(100);
  expect(first.headers.get('X-Access-Token')).toBe('test-token');
  await vi.advanceTimersByTimeAsync(30000);
  expect(heartbeats).toHaveLength(2);
  await logoutSharedLarkAuthSession();
  await vi.advanceTimersByTimeAsync(60000);
  expect(heartbeats).toHaveLength(2);
  resetSharedLarkAuthServiceForTests();
  await initializeSharedLarkAuthSession(store);
  await vi.waitFor(() => expect(heartbeats).toHaveLength(3));
  expect(heartbeats[2].body.deviceInstanceId).toBe(first.body.deviceInstanceId);
});

it('stops heartbeat retries when the server invalidates authentication', async () => {
  const original = globalThis.fetch;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) =>
      url.endsWith('/heartbeat') ? Promise.resolve(new Response('{}', { status: 401 })) : original(url, init)
    )
  );
  await initializeSharedLarkAuthSession({
    load: async () => ({ accessToken: 'expired-token' }),
    save: vi.fn(),
    clear: vi.fn(),
  });
  const { getSharedLarkAuthService } = await import('@process/services/gea/LarkAuthService');
  await vi.waitFor(() => expect(getSharedLarkAuthService().getStatus().authenticated).toBe(false));
  const calls = vi.mocked(fetch).mock.calls.length;
  await vi.advanceTimersByTimeAsync(600000);
  expect(vi.mocked(fetch).mock.calls).toHaveLength(calls);
  expect(getSharedLarkAuthService().getStatus().authenticated).toBe(false);
});

it('does not schedule another heartbeat when a late response arrives after logout', async () => {
  const original = globalThis.fetch;
  let finish!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) =>
      url.endsWith('/heartbeat')
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : original(url, init)
    )
  );
  const restoring = initializeSharedLarkAuthSession({
    load: async () => ({ accessToken: 'test-token' }),
    save: vi.fn(),
    clear: vi.fn(),
  });
  await vi.waitFor(() => expect(finish).toBeDefined());
  let loginCompleted = false;
  void restoring.then(() => {
    loginCompleted = true;
  });
  await vi.waitFor(() => expect(loginCompleted).toBe(true));
  await logoutSharedLarkAuthSession();
  finish(new Response(JSON.stringify({ success: true, result: { heartbeatIntervalSeconds: 30 } })));
  await restoring;
  const count = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/heartbeat')).length;
  await vi.advanceTimersByTimeAsync(60000);
  expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/heartbeat'))).toHaveLength(count);
});

it('resumes exactly one heartbeat loop after sleep', async () => {
  await initializeSharedLarkAuthSession({
    load: async () => ({ accessToken: 'test-token' }),
    save: vi.fn(),
    clear: vi.fn(),
  });
  await vi.waitFor(() => expect(heartbeats).toHaveLength(1));
  const { powerMonitor } = await import('electron');
  const suspend = vi
    .mocked(powerMonitor.on)
    .mock.calls.filter(([name]) => name === 'suspend')
    .at(-1)![1];
  const resume = vi
    .mocked(powerMonitor.on)
    .mock.calls.filter(([name]) => name === 'resume')
    .at(-1)![1];
  suspend();
  await vi.advanceTimersByTimeAsync(120000);
  expect(heartbeats).toHaveLength(1);
  resume();
  resume();
  await vi.advanceTimersByTimeAsync(0);
  expect(heartbeats).toHaveLength(2);
  await vi.advanceTimersByTimeAsync(30000);
  expect(heartbeats).toHaveLength(3);
});

it('uses the new authenticated identity after logout and login without keeping the old loop', async () => {
  const store = (accessToken: string) => ({ load: async () => ({ accessToken }), save: vi.fn(), clear: vi.fn() });
  await initializeSharedLarkAuthSession(store('first-token'));
  await vi.waitFor(() => expect(heartbeats).toHaveLength(1));
  await logoutSharedLarkAuthSession();
  await initializeSharedLarkAuthSession(store('second-token'));
  await vi.waitFor(() => expect(heartbeats).toHaveLength(2));
  await vi.advanceTimersByTimeAsync(30000);
  expect(heartbeats).toHaveLength(3);
  expect(heartbeats.slice(1).map((request) => request.headers.get('X-Access-Token'))).toEqual([
    'second-token',
    'second-token',
  ]);
});

it('recovers a network failure with a bounded retry and then the returned interval', async () => {
  const original = globalThis.fetch;
  let attempts = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith('/heartbeat') && ++attempts === 1) return Promise.reject(new Error('network unavailable'));
      return original(url, init);
    })
  );
  await initializeSharedLarkAuthSession({
    load: async () => ({ accessToken: 'test-token' }),
    save: vi.fn(),
    clear: vi.fn(),
  });
  await vi.waitFor(() => expect(attempts).toBe(1));
  await vi.advanceTimersByTimeAsync(30000);
  expect(heartbeats).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(30000);
  expect(heartbeats).toHaveLength(2);
});
