/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockSystemUser = {
  id: string;
  username: string;
  password_hash: string;
  jwt_secret: string | null;
  created_at: number;
  updated_at: number;
  last_login: number | null;
};

type MockServer = {
  close: ReturnType<typeof vi.fn>;
  listen: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
};

const makeSystemUser = (overrides?: Partial<MockSystemUser>): MockSystemUser => ({
  id: 'system_default_user',
  username: 'system_default_user',
  password_hash: '',
  jwt_secret: null,
  created_at: 0,
  updated_at: 0,
  last_login: null,
  ...overrides,
});

const mockWebServerModuleDeps = (options?: { createServerImpl?: () => MockServer }) => {
  vi.doMock('express', () => ({
    default: vi.fn(() => ({})),
  }));
  vi.doMock('http', () => ({
    createServer: vi.fn(
      options?.createServerImpl ??
        (() => ({
          listen: vi.fn(),
          close: vi.fn(),
          on: vi.fn(),
        }))
    ),
  }));
  vi.doMock('ws', () => ({
    WebSocketServer: vi.fn(),
  }));
  vi.doMock('child_process', () => ({
    execSync: vi.fn(),
  }));
  vi.doMock('os', () => ({
    networkInterfaces: vi.fn(() => ({})),
  }));
  vi.doMock('@process/webserver/config/constants', () => ({
    AUTH_CONFIG: {
      DEFAULT_USER: {
        USERNAME: 'admin',
      },
    },
    SERVER_CONFIG: {
      DEFAULT_PORT: 3000,
      DEFAULT_HOST: '127.0.0.1',
      REMOTE_HOST: '0.0.0.0',
      setServerConfig: vi.fn(),
    },
  }));
  vi.doMock('@process/webserver/adapter', () => ({
    initWebAdapter: vi.fn(),
  }));
  vi.doMock('@process/webserver/setup', () => ({
    setupBasicMiddleware: vi.fn(),
    setupCors: vi.fn(),
    setupErrorHandler: vi.fn(),
  }));
  vi.doMock('@process/webserver/routes/authRoutes', () => ({
    registerAuthRoutes: vi.fn(),
  }));
  vi.doMock('@process/webserver/routes/apiRoutes', () => ({
    registerApiRoutes: vi.fn(),
  }));
  vi.doMock('@process/webserver/routes/staticRoutes', () => ({
    registerStaticRoutes: vi.fn(),
    resolveRendererPath: vi.fn(() => null),
  }));
  vi.doMock('@process/bridge/webuiBridge', () => ({
    generateQRLoginUrlDirect: vi.fn(() => ({
      qrUrl: 'http://localhost:3000/qr-login?token=test',
      expiresAt: 0,
    })),
  }));
  vi.doMock('@process/services/ApiCallbackManager', () => ({
    ApiCallbackManager: {
      getInstance: vi.fn(),
    },
  }));
};

describe('initializeDefaultAdmin', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('skips reinitialization when the renamed system user already has a password', async () => {
    mockWebServerModuleDeps();

    const setSystemUserCredentialsMock = vi.fn();
    const createUserMock = vi.fn();
    const updatePasswordMock = vi.fn();
    const generateRandomPasswordMock = vi.fn(() => 'generated-password');
    const hashPasswordMock = vi.fn(async () => 'hashed-password');

    vi.doMock('@process/webserver/auth/repository/UserRepository', () => ({
      UserRepository: {
        getSystemUser: vi.fn(() => makeSystemUser({ username: 'renamed-admin', password_hash: 'existing-hash' })),
        findByUsername: vi.fn(() => null),
        setSystemUserCredentials: setSystemUserCredentialsMock,
        createUser: createUserMock,
        updatePassword: updatePasswordMock,
      },
    }));
    vi.doMock('@process/webserver/auth/service/AuthService', () => ({
      AuthService: {
        generateRandomPassword: generateRandomPasswordMock,
        hashPassword: hashPasswordMock,
      },
    }));

    const { initializeDefaultAdmin } = await import('@process/webserver/index');
    await expect(initializeDefaultAdmin()).resolves.toBeNull();

    expect(generateRandomPasswordMock).not.toHaveBeenCalled();
    expect(hashPasswordMock).not.toHaveBeenCalled();
    expect(setSystemUserCredentialsMock).not.toHaveBeenCalled();
    expect(createUserMock).not.toHaveBeenCalled();
    expect(updatePasswordMock).not.toHaveBeenCalled();
  });

  it('preserves a custom system username when bootstrapping a missing password', async () => {
    mockWebServerModuleDeps();

    const setSystemUserCredentialsMock = vi.fn();
    const createUserMock = vi.fn();
    const updatePasswordMock = vi.fn();

    vi.doMock('@process/webserver/auth/repository/UserRepository', () => ({
      UserRepository: {
        getSystemUser: vi.fn(() => makeSystemUser({ username: 'renamed-admin', password_hash: '' })),
        findByUsername: vi.fn(() => null),
        setSystemUserCredentials: setSystemUserCredentialsMock,
        createUser: createUserMock,
        updatePassword: updatePasswordMock,
      },
    }));
    vi.doMock('@process/webserver/auth/service/AuthService', () => ({
      AuthService: {
        generateRandomPassword: vi.fn(() => 'generated-password'),
        hashPassword: vi.fn(async () => 'hashed-password'),
      },
    }));

    const { initializeDefaultAdmin } = await import('@process/webserver/index');
    await expect(initializeDefaultAdmin()).resolves.toEqual({
      username: 'renamed-admin',
      password: 'generated-password',
    });

    expect(setSystemUserCredentialsMock).toHaveBeenCalledWith('renamed-admin', 'hashed-password');
    expect(createUserMock).not.toHaveBeenCalled();
    expect(updatePasswordMock).not.toHaveBeenCalled();
  });
});

describe('startWebServerWithInstance', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('retries on the next port when the initial port is already in use', async () => {
    const createdServers: MockServer[] = [];
    let createCount = 0;

    mockWebServerModuleDeps({
      createServerImpl: () => {
        const listeners = new Map<string, (...args: unknown[]) => void>();
        const server: MockServer = {
          close: vi.fn(),
          on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
            listeners.set(event, handler);
            return server;
          }),
          listen: vi.fn((port: number, _host: string, callback?: () => void) => {
            if (createCount === 0) {
              createCount += 1;
              queueMicrotask(() => {
                const errorHandler = listeners.get('error');
                if (!errorHandler) {
                  throw Object.assign(new Error('listener missing'), { code: 'EADDRINUSE' });
                }
                errorHandler(Object.assign(new Error('address in use'), { code: 'EADDRINUSE' }));
              });
              return server;
            }

            createCount += 1;
            callback?.();
            return server;
          }),
        };

        createdServers.push(server);
        return server;
      },
    });

    vi.doMock('@process/webserver/auth/repository/UserRepository', () => ({
      UserRepository: {
        getSystemUser: vi.fn(async () => null),
        findByUsername: vi.fn(async () => ({ id: 'admin', password_hash: 'hash' })),
      },
    }));
    vi.doMock('@process/webserver/auth/service/AuthService', () => ({
      AuthService: {
        generateRandomPassword: vi.fn(() => 'generated-password'),
        hashPassword: vi.fn(async () => 'hashed-password'),
      },
    }));

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const { startWebServerWithInstance } = await import('@process/webserver/index');
    const { SERVER_CONFIG } = await import('@process/webserver/config/constants');

    const result = await startWebServerWithInstance(3000, true);

    expect(createdServers).toHaveLength(2);
    expect(createdServers[0]?.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(createdServers[0]?.listen).toHaveBeenCalledWith(3000, SERVER_CONFIG.REMOTE_HOST, expect.any(Function));
    expect(createdServers[0]?.close).toHaveBeenCalledTimes(1);
    expect(createdServers[1]?.listen).toHaveBeenCalledWith(3001, SERVER_CONFIG.REMOTE_HOST, expect.any(Function));
    expect(result.port).toBe(3001);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '⚠️ Port 3000 is in use, trying 3001... / 端口 3000 已被占用，尝试 3001...'
    );
  });
});
