import { chmod, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';

const serviceRoot = path.join(os.tmpdir(), `aibang-auth-service-${process.pid}`);
const codexHome = path.join(serviceRoot, 'aibang', 'runtime', 'codex-home');

const createBackendFetch = (putBodies: unknown[]) =>
  vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.origin === 'http://127.0.0.1:8787') {
      if (url.pathname === '/api/v1/auth/login' && init?.method === 'POST') {
        return Response.json({
          accessToken: 'middleware-jwt',
          expiresAt: Date.now() + 60_000,
          user: { id: 7, username: 'mainf', quota: 1000 },
        });
      }
      if (url.pathname === '/api/v1/auth/logout') return new Response(null, { status: 204 });
      throw new Error(`Unexpected middleware request: ${url.pathname}`);
    }
    if (url.pathname === '/api/agents/management') {
      return Response.json({
        success: true,
        data: [{ id: 'builtin-codex', backend: 'codex', agent_type: 'acp', agent_source: 'builtin' }],
      });
    }
    if (url.pathname === '/api/agents/builtin-codex/overrides' && init?.method === 'GET') {
      return Response.json({
        success: true,
        data: {
          command_override: '/custom/codex',
          env_override: [{ name: 'HTTPS_PROXY', value: 'http://proxy.test' }],
        },
      });
    }
    if (url.pathname === '/api/agents/builtin-codex/overrides' && init?.method === 'PUT') {
      putBodies.push(JSON.parse(String(init.body)) as unknown);
      return Response.json({});
    }
    throw new Error(`Unexpected request: ${url.pathname}`);
  });

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => serviceRoot),
  },
}));

describe('AibangAuthService', () => {
  afterEach(async () => {
    await rm(serviceRoot, { recursive: true, force: true });
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('writes only isolated Codex files and preserves unrelated overrides', async () => {
    const putBodies: unknown[] = [];
    (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort = 13400;
    const fetchMock = createBackendFetch(putBodies);
    vi.stubGlobal('fetch', fetchMock);
    const { aibangAuthService } = await import('@/process/services/AibangAuthService');

    const loginResult = await aibangAuthService.login({
      username: 'mainf',
      password: 'password',
    });
    expect(loginResult).toEqual({
      success: true,
      twoFactorRequired: false,
      expiresAt: expect.any(Number),
      user: { id: 7, username: 'mainf', quota: 1000 },
    });
    expect(loginResult).not.toHaveProperty('accessToken');
    expect(loginResult).not.toHaveProperty('flowToken');
    const config = await readFile(path.join(codexHome, 'config.toml'), 'utf8');
    await aibangAuthService.clearSession();
    await expect(readFile(path.join(codexHome, 'config.toml'))).rejects.toThrow();
    await expect(readFile(path.join(codexHome, 'auth.json'))).rejects.toThrow();
    expect(putBodies).toEqual([
      {
        command_override: '/custom/codex',
        env_override: [
          { name: 'HTTPS_PROXY', value: 'http://proxy.test' },
          { name: 'OPENAI_API_KEY', value: 'middleware-jwt' },
          { name: 'CODEX_API_KEY', value: 'middleware-jwt' },
        ],
      },
      {
        command_override: '/custom/codex',
        env_override: [{ name: 'HTTPS_PROXY', value: 'http://proxy.test' }],
      },
    ]);
    expect(config).toContain(`base_url = "http://127.0.0.1:8787/v1"`);
  });

  it('stores private session files with mode 0600', async () => {
    (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort = 13400;
    vi.stubGlobal('fetch', createBackendFetch([]));
    const { aibangAuthService } = await import('@/process/services/AibangAuthService');
    await aibangAuthService.login({ username: 'mainf', password: 'password' });
    const sessionPath = path.join(serviceRoot, 'aibang', 'auth-session.json');
    const info = await stat(sessionPath);
    await chmod(sessionPath, 0o600);
    expect(JSON.parse(await readFile(sessionPath, 'utf8'))).toEqual({
      accessToken: 'middleware-jwt',
      expiresAt: expect.any(Number),
      user: { id: 7, username: 'mainf', quota: 1000 },
    });
    expect(info.mode & 0o777).toBe(0o600);
  });

  it('keeps the 2FA continuation token in the main process', async () => {
    (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort = 13400;
    const backendFetch = createBackendFetch([]);
    const loginBodies: unknown[] = [];
    let loginCallCount = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.origin === 'http://127.0.0.1:8787' && url.pathname === '/api/v1/auth/login') {
          loginCallCount += 1;
          loginBodies.push(JSON.parse(String(init?.body)) as unknown);
          return Response.json(
            loginCallCount === 1
              ? { twoFactorRequired: true, flowToken: 'server-flow-token', expiresAt: Date.now() + 300_000 }
              : {
                  accessToken: 'middleware-jwt',
                  expiresAt: Date.now() + 60_000,
                  user: { id: 7, username: 'mainf', quota: 1000 },
                }
          );
        }
        return backendFetch(input, init);
      })
    );
    const { aibangAuthService } = await import('@/process/services/AibangAuthService');

    const firstResult = await aibangAuthService.login({ username: 'mainf', password: 'password' });
    const secondResult = await aibangAuthService.login({
      username: 'mainf',
      password: 'password',
      totpCode: '123456',
    });

    expect(firstResult).toEqual({ success: true, twoFactorRequired: true });
    expect(secondResult).toEqual({
      success: true,
      twoFactorRequired: false,
      expiresAt: expect.any(Number),
      user: { id: 7, username: 'mainf', quota: 1000 },
    });
    expect(loginBodies).toEqual([
      { username: 'mainf', password: 'password' },
      { flowToken: 'server-flow-token', totpCode: '123456' },
    ]);
  });

  it('maps middleware bad-credential responses to invalid credentials', async () => {
    (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort = 13400;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ message: 'Username or password is incorrect' }, { status: 400 }))
    );
    const { aibangAuthService } = await import('@/process/services/AibangAuthService');

    await expect(
      aibangAuthService.login({
        username: 'mainf',
        password: 'incorrect-password',
      })
    ).resolves.toEqual({
      success: false,
      code: 'invalidCredentials',
      message: 'Username or password is incorrect',
    });
  });
});
