/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { RequestHandler } from 'express';
import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFindByUsername, mockCreateUser, mockHashPassword } = vi.hoisted(() => ({
  mockFindByUsername: vi.fn(),
  mockCreateUser: vi.fn(),
  mockHashPassword: vi.fn(),
}));

vi.mock('@process/webserver/auth/repository/UserRepository', () => ({
  UserRepository: {
    findByUsername: mockFindByUsername,
    createUser: mockCreateUser,
    hasUsers: vi.fn(() => true),
    countUsers: vi.fn(() => 1),
    updateLastLogin: vi.fn(),
    findById: vi.fn(),
  },
}));

vi.mock('@process/webserver/auth/service/AuthService', () => ({
  AuthService: {
    hashPassword: mockHashPassword,
    generateToken: vi.fn(),
    blacklistToken: vi.fn(),
    constantTimeVerify: vi.fn(),
    constantTimeVerifyMissingUser: vi.fn(),
    validatePasswordStrength: vi.fn(() => ({ isValid: true, errors: [] })),
    validateUsername: vi.fn(() => ({ isValid: true, errors: [] })),
    invalidateAllTokens: vi.fn(),
  },
}));

vi.mock('@process/webserver/auth/middleware/AuthMiddleware', () => ({
  AuthMiddleware: {
    validateLoginInput: ((_req, _res, next) => next()) as RequestHandler,
    validateRegisterInput: ((_req, _res, next) => next()) as RequestHandler,
    authenticateToken: ((_req, _res, next) => next()) as RequestHandler,
    requireAdmin: ((_req, _res, next) => next()) as RequestHandler,
    validateSetupInput: ((_req, _res, next) => next()) as RequestHandler,
    requireSetupMode: ((_req, _res, next) => next()) as RequestHandler,
  },
}));

vi.mock('@process/webserver/auth/middleware/TokenMiddleware', () => ({
  TokenUtils: { extractFromRequest: vi.fn() },
}));

vi.mock('@process/webserver/middleware/errorHandler', () => ({
  createAppError: vi.fn(),
}));

vi.mock('@process/webserver/middleware/security', () => ({
  authRateLimiter: ((_req, _res, next) => next()) as RequestHandler,
  authenticatedActionLimiter: ((_req, _res, next) => next()) as RequestHandler,
  apiRateLimiter: ((_req, _res, next) => next()) as RequestHandler,
}));

vi.mock('@process/webserver/config/constants', () => ({
  AUTH_CONFIG: { COOKIE: { NAME: 'auth-token' }, TOKEN: { COOKIE_MAX_AGE: 0 } },
  getCookieOptions: vi.fn(() => ({ httpOnly: true })),
}));

vi.mock('@process/bridge/webuiQR', () => ({
  verifyQRTokenDirect: vi.fn(),
}));

type MockResponse = {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
};

function createResponseMock(): MockResponse {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

function getRegisterHandler(app: express.Express): RequestHandler {
  const layer = app.router.stack.find(
    (entry: { route?: { path?: string; stack?: Array<{ handle: RequestHandler }> } }) =>
      entry.route?.path === '/api/auth/register'
  );
  return layer?.route?.stack?.at(-1)?.handle as RequestHandler;
}

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 201 and user info when admin creates a new user', async () => {
    mockFindByUsername.mockResolvedValue(null);
    mockHashPassword.mockResolvedValue('hashed');
    mockCreateUser.mockResolvedValue({ id: 'user_1', username: 'bob', role: 'user' });

    const { registerAuthRoutes } = await import('@process/webserver/routes/authRoutes');
    const app = express();
    registerAuthRoutes(app);

    const handler = getRegisterHandler(app);
    const req = { body: { username: 'bob', password: 'securepass' } } as express.Request;
    const res = createResponseMock() as unknown as express.Response;

    await handler(req, res, vi.fn());

    expect(mockFindByUsername).toHaveBeenCalledWith('bob');
    expect(mockCreateUser).toHaveBeenCalledWith('bob', 'hashed', 'user');
    expect((res as unknown as MockResponse).status).toHaveBeenCalledWith(201);
    expect((res as unknown as MockResponse).json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, user: expect.objectContaining({ username: 'bob', role: 'user' }) })
    );
  });

  it('returns 409 when username is already taken', async () => {
    mockFindByUsername.mockResolvedValue({ id: 'user_existing', username: 'bob', role: 'user' });

    const { registerAuthRoutes } = await import('@process/webserver/routes/authRoutes');
    const app = express();
    registerAuthRoutes(app);

    const handler = getRegisterHandler(app);
    const req = { body: { username: 'bob', password: 'securepass' } } as express.Request;
    const res = createResponseMock() as unknown as express.Response;

    await handler(req, res, vi.fn());

    expect((res as unknown as MockResponse).status).toHaveBeenCalledWith(409);
    expect((res as unknown as MockResponse).json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('returns 500 when createUser throws', async () => {
    mockFindByUsername.mockResolvedValue(null);
    mockHashPassword.mockResolvedValue('hashed');
    mockCreateUser.mockRejectedValue(new Error('DB error'));

    const { registerAuthRoutes } = await import('@process/webserver/routes/authRoutes');
    const app = express();
    registerAuthRoutes(app);

    const handler = getRegisterHandler(app);
    const req = { body: { username: 'bob', password: 'securepass' } } as express.Request;
    const res = createResponseMock() as unknown as express.Response;

    await handler(req, res, vi.fn());

    expect((res as unknown as MockResponse).status).toHaveBeenCalledWith(500);
    expect((res as unknown as MockResponse).json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });
});
