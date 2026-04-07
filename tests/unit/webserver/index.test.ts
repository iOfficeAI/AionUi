/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type AuthUser = {
  id: string;
  username: string;
  password_hash: string;
  jwt_secret: string | null;
  created_at: number;
  updated_at: number;
  last_login: number | null;
};

const {
  createServerMock,
  webSocketServerMock,
  setupBasicMiddlewareMock,
  setupCorsMock,
  setupErrorHandlerMock,
  registerAuthRoutesMock,
  registerApiRoutesMock,
  registerStaticRoutesMock,
  initWebAdapterMock,
  generateRandomPasswordMock,
  hashPasswordMock,
  getSystemUserMock,
  findByUsernameMock,
  setSystemUserCredentialsMock,
  updatePasswordMock,
  createUserMock,
} = vi.hoisted(() => {
  const server = {
    listen: vi.fn(),
    on: vi.fn(),
    close: vi.fn(),
  };

  server.listen.mockImplementation((_port: number, _host: string, callback?: () => void) => {
    callback?.();
    return server;
  });
  server.on.mockImplementation(() => server);

  return {
    createServerMock: vi.fn(() => server),
    webSocketServerMock: vi.fn(function MockWebSocketServer() {
      return {};
    }),
    setupBasicMiddlewareMock: vi.fn(),
    setupCorsMock: vi.fn(),
    setupErrorHandlerMock: vi.fn(),
    registerAuthRoutesMock: vi.fn(),
    registerApiRoutesMock: vi.fn(),
    registerStaticRoutesMock: vi.fn(),
    initWebAdapterMock: vi.fn(),
    generateRandomPasswordMock: vi.fn(() => 'GeneratedPass123'),
    hashPasswordMock: vi.fn(async () => 'hashed-password'),
    getSystemUserMock: vi.fn(),
    findByUsernameMock: vi.fn(),
    setSystemUserCredentialsMock: vi.fn(async () => {}),
    updatePasswordMock: vi.fn(async () => {}),
    createUserMock: vi.fn(async () => {}),
  };
});

vi.mock('express', () => ({
  default: vi.fn(() => ({})),
}));

vi.mock('http', () => ({
  createServer: (...args: Parameters<typeof createServerMock>) => createServerMock(...args),
}));

vi.mock('ws', () => ({
  WebSocketServer: webSocketServerMock,
}));

vi.mock('@process/webserver/setup', () => ({
  setupBasicMiddleware: setupBasicMiddlewareMock,
  setupCors: setupCorsMock,
  setupErrorHandler: setupErrorHandlerMock,
}));

vi.mock('@process/webserver/routes/authRoutes', () => ({
  registerAuthRoutes: registerAuthRoutesMock,
}));

vi.mock('@process/webserver/routes/apiRoutes', () => ({
  registerApiRoutes: registerApiRoutesMock,
}));

vi.mock('@process/webserver/routes/staticRoutes', () => ({
  registerStaticRoutes: registerStaticRoutesMock,
}));

vi.mock('@process/webserver/adapter', () => ({
  initWebAdapter: initWebAdapterMock,
}));

vi.mock('@process/bridge/webuiQR', () => ({
  generateQRLoginUrlDirect: vi.fn(() => ({ qrUrl: 'http://localhost:3000/qr' })),
}));

vi.mock('@process/webserver/auth/service/AuthService', () => ({
  AuthService: {
    generateRandomPassword: generateRandomPasswordMock,
    hashPassword: hashPasswordMock,
  },
}));

vi.mock('@process/webserver/auth/repository/UserRepository', () => ({
  UserRepository: {
    getSystemUser: getSystemUserMock,
    findByUsername: findByUsernameMock,
    setSystemUserCredentials: setSystemUserCredentialsMock,
    updatePassword: updatePasswordMock,
    createUser: createUserMock,
  },
}));

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'system_default_user',
    username: 'system_default_user',
    password_hash: '',
    jwt_secret: null,
    created_at: 0,
    updated_at: 0,
    last_login: null,
    ...overrides,
  };
}

describe('startWebServerWithInstance default admin initialization', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps a custom system username when repairing a missing password', async () => {
    getSystemUserMock.mockResolvedValue(makeUser({ username: 'alice', password_hash: '' }));
    findByUsernameMock.mockResolvedValue(null);

    const { startWebServerWithInstance } = await import('@process/webserver/index');

    await startWebServerWithInstance(3000, false);

    expect(setSystemUserCredentialsMock).toHaveBeenCalledWith('alice', 'hashed-password');
    expect(updatePasswordMock).not.toHaveBeenCalled();
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it('repairs the placeholder system user with the default admin username', async () => {
    getSystemUserMock.mockResolvedValue(makeUser());
    findByUsernameMock.mockResolvedValue(null);

    const { startWebServerWithInstance } = await import('@process/webserver/index');

    await startWebServerWithInstance(3000, false);

    expect(setSystemUserCredentialsMock).toHaveBeenCalledWith('admin', 'hashed-password');
    expect(updatePasswordMock).not.toHaveBeenCalled();
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it('falls back to the default admin username when the system username is empty', async () => {
    getSystemUserMock.mockResolvedValue(makeUser({ username: '' }));
    findByUsernameMock.mockResolvedValue(null);

    const { startWebServerWithInstance } = await import('@process/webserver/index');

    await startWebServerWithInstance(3000, false);

    expect(setSystemUserCredentialsMock).toHaveBeenCalledWith('admin', 'hashed-password');
    expect(updatePasswordMock).not.toHaveBeenCalled();
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it('skips reinitialization when the custom system user already has credentials', async () => {
    getSystemUserMock.mockResolvedValue(makeUser({ username: 'alice', password_hash: 'existing-hash' }));
    findByUsernameMock.mockResolvedValue(null);

    const { startWebServerWithInstance } = await import('@process/webserver/index');

    await startWebServerWithInstance(3000, true);

    expect(generateRandomPasswordMock).not.toHaveBeenCalled();
    expect(hashPasswordMock).not.toHaveBeenCalled();
    expect(setSystemUserCredentialsMock).not.toHaveBeenCalled();
    expect(updatePasswordMock).not.toHaveBeenCalled();
    expect(createUserMock).not.toHaveBeenCalled();
    expect(setupCorsMock).toHaveBeenCalledWith(expect.anything(), 3000, true);
  });

  it('falls back to the legacy admin row without rewriting the placeholder user', async () => {
    getSystemUserMock.mockResolvedValue(makeUser());
    findByUsernameMock.mockResolvedValue(
      makeUser({
        id: 'user_legacy_admin',
        username: 'admin',
        password_hash: 'legacy-hash',
      })
    );

    const { startWebServerWithInstance } = await import('@process/webserver/index');

    await startWebServerWithInstance(3000, false);

    expect(generateRandomPasswordMock).not.toHaveBeenCalled();
    expect(setSystemUserCredentialsMock).not.toHaveBeenCalled();
    expect(updatePasswordMock).not.toHaveBeenCalled();
    expect(createUserMock).not.toHaveBeenCalled();
    expect(initWebAdapterMock).toHaveBeenCalled();
  });

  it('repairs a legacy admin row when no system user exists', async () => {
    getSystemUserMock.mockResolvedValue(null);
    findByUsernameMock.mockResolvedValue(
      makeUser({
        id: 'legacy-admin',
        username: 'admin',
        password_hash: '',
      })
    );

    const { startWebServerWithInstance } = await import('@process/webserver/index');

    await startWebServerWithInstance(3000, false);

    expect(setSystemUserCredentialsMock).not.toHaveBeenCalled();
    expect(updatePasswordMock).toHaveBeenCalledWith('legacy-admin', 'hashed-password');
    expect(createUserMock).not.toHaveBeenCalled();
  });
});
