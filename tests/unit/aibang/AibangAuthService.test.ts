import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const serviceRoot = path.join(os.tmpdir(), `aibang-auth-service-${process.pid}`);
const codexHome = path.join(serviceRoot, 'aibang', 'runtime', 'codex-home');
const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
const originalCodexApiKey = process.env.CODEX_API_KEY;

type NewApiCall = {
  method: string;
  pathname: string;
  body?: unknown;
  authorization?: string;
};

type BackendOptions = {
  commandOverride?: string | null;
  loginMessage?: string;
  loginSuccess?: boolean;
  overridePutStatus?: number;
  tokenKeyStatus?: number;
};

const createFetchMock = (newApiCalls: NewApiCall[], putBodies: unknown[], options: BackendOptions = {}) =>
  (() => {
    const state = { createdTokenName: '' };

    return vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(String(input));
      const body = init?.body === undefined ? undefined : (JSON.parse(String(init.body)) as unknown);
      const authorization = ((init?.headers ?? {}) as Record<string, string>).Authorization;
      if (url.origin === 'http://127.0.0.1:5000') {
        newApiCalls.push({
          method: init?.method ?? 'GET',
          pathname: url.pathname,
          ...(body === undefined ? {} : { body }),
          ...(authorization === undefined ? {} : { authorization }),
        });
        if (url.pathname === '/api/user/login/encryption-key') {
          return Response.json({ success: true, data: { enabled: false } });
        }
        if ((url.pathname === '/api/user/login' || url.pathname === '/api/user/login/2fa') && init?.method === 'POST') {
          const loginSucceeded = options.loginSuccess ?? true;
          return Response.json({
            success: loginSucceeded,
            ...(loginSucceeded
              ? {
                  data: {
                    access_token: 'dashboard-access-token',
                    access_expires_at: Math.floor((Date.now() + 3_600_000) / 1000),
                    user: { id: 7, username: 'mainf', quota: 1000 },
                  },
                }
              : { message: options.loginMessage ?? 'Login failed' }),
          });
        }
        if (url.pathname === '/api/token/' && init?.method === 'POST') {
          state.createdTokenName = (body as { name?: string } | undefined)?.name ?? '';
          return Response.json({ success: true, message: '' });
        }
        if (url.pathname === '/api/token/search') {
          return Response.json({
            success: true,
            data: { items: [{ id: 421, name: state.createdTokenName }] },
          });
        }
        if (url.pathname === '/api/token/421/key' && init?.method === 'POST') {
          return Response.json(
            { success: options.tokenKeyStatus === undefined, data: { key: 'sk-new-api-token' } },
            { status: options.tokenKeyStatus ?? 200 }
          );
        }
        if (url.pathname === '/api/token/421' && init?.method === 'DELETE') {
          return Response.json({ success: true });
        }
        if (url.pathname === '/api/user/auth/logout' && init?.method === 'POST') {
          return Response.json({ success: true, data: { revoked_sid: 'session-id' } });
        }
        throw new Error(`Unexpected new-api request: ${init?.method ?? 'GET'} ${url.pathname}`);
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
            command_override: 'commandOverride' in options ? options.commandOverride : '/custom/codex',
            env_override: [{ name: 'HTTPS_PROXY', value: 'http://proxy.test' }],
          },
        });
      }
      if (url.pathname === '/api/agents/builtin-codex/overrides' && init?.method === 'PUT') {
        putBodies.push(body);
        return Response.json({}, { status: options.overridePutStatus ?? 200 });
      }
      throw new Error(`Unexpected backend request: ${init?.method ?? 'GET'} ${url.pathname}`);
    });
  })();

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => serviceRoot),
    getAppPath: vi.fn(() => serviceRoot),
    isPackaged: false,
  },
}));

describe('AibangAuthService', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = originalOpenAiApiKey;
    process.env.CODEX_API_KEY = originalCodexApiKey;
  });

  afterEach(async () => {
    await rm(serviceRoot, { recursive: true, force: true });
    if (originalOpenAiApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAiApiKey;
    if (originalCodexApiKey === undefined) delete process.env.CODEX_API_KEY;
    else process.env.CODEX_API_KEY = originalCodexApiKey;
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('creates a scoped token, writes isolated Codex files, and cleans up on logout', async () => {
    const newApiCalls: NewApiCall[] = [];
    const putBodies: unknown[] = [];
    (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort = 13400;
    vi.stubGlobal('fetch', createFetchMock(newApiCalls, putBodies));
    process.env.OPENAI_API_KEY = 'user-openai-key';
    process.env.CODEX_API_KEY = 'user-codex-key';
    const { aibangAuthService } = await import('@/process/services/AibangAuthService');

    const loginResult = await aibangAuthService.login({ username: 'mainf', password: 'password' });

    expect(loginResult).toEqual({
      success: true,
      twoFactorRequired: false,
      expiresAt: expect.any(Number),
      user: { id: 7, username: 'mainf', quota: 1000 },
    });
    expect(loginResult).not.toHaveProperty('dashboardAccessToken');
    expect(loginResult).not.toHaveProperty('apiToken');
    expect(newApiCalls.find((call) => call.pathname === '/api/token/')).toMatchObject({
      body: {
        name: expect.stringMatching(/^AIbang Desktop /),
        expired_time: expect.any(Number),
        remain_quota: 500_000,
        unlimited_quota: false,
        model_limits_enabled: true,
        model_limits: 'gpt-5.6-sol',
        group: '',
      },
      authorization: 'Bearer dashboard-access-token',
    });
    expect(process.env.OPENAI_API_KEY).toBe('sk-new-api-token');
    expect(process.env.CODEX_API_KEY).toBe('sk-new-api-token');
    expect(await readFile(path.join(codexHome, 'config.toml'), 'utf8')).toContain(
      'base_url = "http://127.0.0.1:5000/v1"'
    );

    await aibangAuthService.clearSession();

    expect(newApiCalls.find((call) => call.pathname === '/api/token/421' && call.method === 'DELETE')).toBeTruthy();
    expect(newApiCalls.find((call) => call.pathname === '/api/user/auth/logout')).toMatchObject({
      authorization: 'Bearer dashboard-access-token',
    });
    await expect(readFile(path.join(codexHome, 'config.toml'))).rejects.toThrow();
    await expect(readFile(path.join(codexHome, 'auth.json'))).rejects.toThrow();
    expect(process.env.OPENAI_API_KEY).toBe('user-openai-key');
    expect(process.env.CODEX_API_KEY).toBe('user-codex-key');
    expect(putBodies).toEqual([
      {
        command_override: '/custom/codex',
        env_override: [{ name: 'HTTPS_PROXY', value: 'http://proxy.test' }],
      },
      {
        command_override: '/custom/codex',
        env_override: [{ name: 'HTTPS_PROXY', value: 'http://proxy.test' }],
      },
    ]);
  });

  it('stores private session files with mode 0600', async () => {
    (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort = 13400;
    vi.stubGlobal('fetch', createFetchMock([], []));
    const { aibangAuthService } = await import('@/process/services/AibangAuthService');
    await aibangAuthService.login({ username: 'mainf', password: 'password' });

    const sessionPath = path.join(serviceRoot, 'aibang', 'auth-session.json');
    const configPath = path.join(codexHome, 'config.toml');
    const authPath = path.join(codexHome, 'auth.json');
    const modes = await Promise.all([stat(sessionPath), stat(configPath), stat(authPath)]);
    expect(modes.map((entry) => entry.mode & 0o777)).toEqual([0o600, 0o600, 0o600]);
    expect(JSON.parse(await readFile(sessionPath, 'utf8'))).toEqual({
      dashboardAccessToken: 'dashboard-access-token',
      apiTokenId: 421,
      apiToken: 'sk-new-api-token',
      expiresAt: expect.any(Number),
      user: { id: 7, username: 'mainf', quota: 1000 },
    });
    expect(JSON.parse(await readFile(authPath, 'utf8'))).toEqual({
      OPENAI_API_KEY: 'sk-new-api-token',
    });
  });

  it('points the built-in Codex agent at the bundled binary when no custom path exists', async () => {
    const putBodies: unknown[] = [];
    (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort = 13400;
    vi.stubGlobal('fetch', createFetchMock([], putBodies, { commandOverride: null }));
    const { aibangAuthService, buildBundledCodexPath } = await import('@/process/services/AibangAuthService');
    const bundledCodexPath = buildBundledCodexPath(serviceRoot);
    if (!bundledCodexPath) throw new Error('Unsupported test platform');
    await mkdir(path.dirname(bundledCodexPath), { recursive: true });
    await writeFile(bundledCodexPath, '', { mode: 0o755 });

    await aibangAuthService.login({ username: 'mainf', password: 'password' });

    expect(putBodies[0]).toEqual({
      command_override: bundledCodexPath,
      env_override: [{ name: 'HTTPS_PROXY', value: 'http://proxy.test' }],
    });
  });

  it('keeps the 2FA continuation token in the main process', async () => {
    const newApiCalls: NewApiCall[] = [];
    const tokenFetch = createFetchMock(newApiCalls, []);
    let loginCallCount = 0;
    (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort = 13400;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.pathname === '/api/user/login' || url.pathname === '/api/user/login/2fa') {
          loginCallCount += 1;
          newApiCalls.push({
            method: init?.method ?? 'GET',
            pathname: url.pathname,
            body: init?.body === undefined ? undefined : (JSON.parse(String(init.body)) as unknown),
          });
          return Response.json(
            loginCallCount === 1
              ? {
                  success: true,
                  data: {
                    require_2fa: true,
                    flow_token: 'server-flow-token',
                    expires_at: Math.floor((Date.now() + 300_000) / 1000),
                  },
                }
              : {
                  success: true,
                  data: {
                    access_token: 'dashboard-access-token',
                    access_expires_at: Math.floor((Date.now() + 3_600_000) / 1000),
                    user: { id: 7, username: 'mainf', quota: 1000 },
                  },
                }
          );
        }
        return tokenFetch(input, init);
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
    expect(secondResult).toMatchObject({ success: true, twoFactorRequired: false });
    expect(newApiCalls.find((call) => call.pathname === '/api/user/login/2fa')).toMatchObject({
      body: { flow_token: 'server-flow-token', code: '123456' },
    });
  });

  it('serializes concurrent authentication operations', async () => {
    const newApiCalls: NewApiCall[] = [];
    const baseFetch = createFetchMock(newApiCalls, []);
    let activeRequests = 0;
    let peakActiveRequests = 0;
    (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort = 13400;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
        activeRequests += 1;
        peakActiveRequests = Math.max(peakActiveRequests, activeRequests);
        await new Promise((resolve) => setTimeout(resolve, 5));
        try {
          return await baseFetch(input, init);
        } finally {
          activeRequests -= 1;
        }
      })
    );
    const { aibangAuthService } = await import('@/process/services/AibangAuthService');

    const [first, second] = await Promise.all([
      aibangAuthService.login({ username: 'mainf', password: 'password' }),
      aibangAuthService.login({ username: 'mainf', password: 'password' }),
    ]);

    expect(first).toMatchObject({ success: true });
    expect(second).toMatchObject({ success: true });
    expect(peakActiveRequests).toBe(1);
  });

  it('maps new-api bad-credential responses to invalid credentials', async () => {
    (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort = 13400;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL | RequestInfo) => {
        const url = new URL(String(input));
        if (url.pathname === '/api/user/login/encryption-key') {
          return Response.json({ success: true, data: { enabled: false } });
        }
        return Response.json({ success: false, message: 'Username or password is incorrect' }, { status: 400 });
      })
    );
    const { aibangAuthService } = await import('@/process/services/AibangAuthService');

    await expect(aibangAuthService.login({ username: 'mainf', password: 'incorrect-password' })).resolves.toEqual({
      success: false,
      code: 'invalidCredentials',
      message: 'Username or password is incorrect',
    });
  });

  it('deletes a created token when retrieving its key fails', async () => {
    const newApiCalls: NewApiCall[] = [];
    (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort = 13400;
    vi.stubGlobal('fetch', createFetchMock(newApiCalls, [], { tokenKeyStatus: 500 }));
    const { aibangAuthService } = await import('@/process/services/AibangAuthService');

    const result = await aibangAuthService.login({ username: 'mainf', password: 'password' });

    expect(result).toMatchObject({ success: false, code: 'serverError' });
    expect(newApiCalls.find((call) => call.pathname === '/api/token/421' && call.method === 'DELETE')).toBeTruthy();
    await expect(readFile(path.join(serviceRoot, 'aibang', 'auth-session.json'))).rejects.toThrow();
  });

  it('maps an HTTP 200 new-api business failure to invalid credentials', async () => {
    const newApiCalls: NewApiCall[] = [];
    vi.stubGlobal(
      'fetch',
      createFetchMock(newApiCalls, [], {
        loginMessage: 'Username or password is incorrect',
        loginSuccess: false,
      })
    );
    const { aibangAuthService } = await import('@/process/services/AibangAuthService');

    await expect(aibangAuthService.login({ username: 'mainf', password: 'incorrect-password' })).resolves.toEqual({
      success: false,
      code: 'invalidCredentials',
      message: 'Username or password is incorrect',
    });
    expect(newApiCalls.some((call) => call.pathname.startsWith('/api/token/'))).toBe(false);
  });

  it('deletes a created token when local session configuration fails', async () => {
    const newApiCalls: NewApiCall[] = [];
    (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort = 13400;
    vi.stubGlobal('fetch', createFetchMock(newApiCalls, [], { overridePutStatus: 500 }));
    const { aibangAuthService } = await import('@/process/services/AibangAuthService');

    const result = await aibangAuthService.login({ username: 'mainf', password: 'password' });

    expect(result).toMatchObject({ success: false, code: 'networkError' });
    expect(newApiCalls.find((call) => call.pathname === '/api/token/421' && call.method === 'DELETE')).toBeTruthy();
    await expect(readFile(path.join(serviceRoot, 'aibang', 'auth-session.json'))).rejects.toThrow();
  });

  it('removes local session files when new-api rejects a dashboard session', async () => {
    const putBodies: unknown[] = [];
    (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort = 13400;
    const baseFetch = createFetchMock([], putBodies);
    process.env.OPENAI_API_KEY = 'user-openai-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.pathname === '/api/user/self') {
          return Response.json({ success: false, message: 'Session revoked' }, { status: 401 });
        }
        return baseFetch(input, init);
      })
    );
    const { aibangAuthService } = await import('@/process/services/AibangAuthService');
    await aibangAuthService.login({ username: 'mainf', password: 'password' });

    await expect(aibangAuthService.refreshSession()).resolves.toEqual({ authenticated: false });
    await expect(readFile(path.join(codexHome, 'auth.json'))).rejects.toThrow();
    await expect(readFile(path.join(codexHome, 'config.toml'))).rejects.toThrow();
    await expect(readFile(path.join(serviceRoot, 'aibang', 'auth-session.json'))).rejects.toThrow();
    expect(process.env.OPENAI_API_KEY).toBe('user-openai-key');
  });
});
