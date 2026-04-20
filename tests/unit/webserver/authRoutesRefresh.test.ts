import type { RequestHandler } from 'express';
import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRefreshToken, mockExtractFromRequest } = vi.hoisted(() => ({
  mockRefreshToken: vi.fn<(...args: unknown[]) => Promise<string | null>>(),
  mockExtractFromRequest: vi.fn<(req: express.Request) => string | null>(),
}));

vi.mock('@process/webserver/auth/service/AuthService', () => ({
  AuthService: {
    refreshToken: mockRefreshToken,
    blacklistToken: vi.fn(),
    constantTimeVerify: vi.fn(),
    generateToken: vi.fn(),
  },
}));

vi.mock('@process/webserver/auth/middleware/AuthMiddleware', () => ({
  AuthMiddleware: {
    validateLoginInput: ((_req, _res, next) => next()) as RequestHandler,
    authenticateToken: ((_req, _res, next) => next()) as RequestHandler,
    requireSetupNotComplete: ((_req, _res, next) => next()) as RequestHandler,
  },
}));

vi.mock('@process/webserver/auth/repository/UserRepository', () => ({
  UserRepository: {
    findByUsername: vi.fn(),
    updateLastLogin: vi.fn(),
    hasUsers: vi.fn(() => true),
    countUsers: vi.fn(() => 1),
    createInitialUser: vi.fn(),
    changePassword: vi.fn(),
    usernameExists: vi.fn(() => false),
  },
}));

vi.mock('@process/webserver/config/constants', () => ({
  AUTH_CONFIG: {
    COOKIE: {
      NAME: 'auth-token',
    },
    TOKEN: {
      COOKIE_MAX_AGE: 0,
    },
  },
  getCookieOptions: vi.fn(() => ({ httpOnly: true })),
}));

vi.mock('@process/webserver/auth/middleware/TokenMiddleware', () => ({
  TokenUtils: {
    extractFromRequest: mockExtractFromRequest,
  },
}));

vi.mock('@process/webserver/middleware/errorHandler', () => ({
  createAppError: vi.fn(),
}));

vi.mock('@process/webserver/middleware/security', () => ({
  authRateLimiter: ((_req, _res, next) => next()) as RequestHandler,
  authenticatedActionLimiter: ((_req, _res, next) => next()) as RequestHandler,
  apiRateLimiter: ((_req, _res, next) => next()) as RequestHandler,
}));

vi.mock('@process/bridge/webuiQR', () => ({
  verifyQRTokenDirect: vi.fn(),
}));

function getRefreshHandler(app: express.Express): RequestHandler {
  const layer = app.router.stack.find(
    (entry: { route?: { path?: string; stack?: Array<{ handle: RequestHandler }> } }) =>
      entry.route?.path === '/api/auth/refresh'
  );

  return layer?.route?.stack?.at(-1)?.handle as RequestHandler;
}

function createResponseMock() {
  const response = {
    cookie: vi.fn(),
    json: vi.fn(),
    status: vi.fn(),
  };

  response.status.mockReturnValue(response);

  return response;
}

describe('registerAuthRoutes refresh endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExtractFromRequest.mockReturnValue(null);
  });

  it('returns 401 when async refresh resolves to null', async () => {
    mockRefreshToken.mockResolvedValue(null);

    const { registerAuthRoutes } = await import('@process/webserver/routes/authRoutes');
    const app = express();
    registerAuthRoutes(app);

    const handler = getRefreshHandler(app);
    const req = {
      body: {
        token: 'expired-token',
      },
    } as express.Request;
    const res = createResponseMock() as unknown as express.Response;

    await handler(req, res, vi.fn());

    expect(mockRefreshToken).toHaveBeenCalledWith('expired-token');
    expect((res as unknown as { status: ReturnType<typeof vi.fn> }).status).toHaveBeenCalledWith(401);
    expect((res as unknown as { json: ReturnType<typeof vi.fn> }).json).toHaveBeenCalledWith({
      success: false,
      error: 'Invalid or expired token',
    });
  });

  it('returns the refreshed token string when async refresh succeeds', async () => {
    mockRefreshToken.mockResolvedValue('new-token');

    const { registerAuthRoutes } = await import('@process/webserver/routes/authRoutes');
    const app = express();
    registerAuthRoutes(app);

    const handler = getRefreshHandler(app);
    const req = {
      body: {
        token: 'current-token',
      },
    } as express.Request;
    const res = createResponseMock() as unknown as express.Response;

    await handler(req, res, vi.fn());

    expect(mockRefreshToken).toHaveBeenCalledWith('current-token');
    expect((res as unknown as { status: ReturnType<typeof vi.fn> }).status).not.toHaveBeenCalled();
    expect((res as unknown as { json: ReturnType<typeof vi.fn> }).json).toHaveBeenCalledWith({
      success: true,
      token: 'new-token',
    });
    expect((res as unknown as { cookie: ReturnType<typeof vi.fn> }).cookie).not.toHaveBeenCalled();
  });

  it('falls back to request credentials when body token is missing', async () => {
    mockExtractFromRequest.mockReturnValue('cookie-token');
    mockRefreshToken.mockResolvedValue('new-token');

    const { registerAuthRoutes } = await import('@process/webserver/routes/authRoutes');
    const app = express();
    registerAuthRoutes(app);

    const handler = getRefreshHandler(app);
    const req = { body: {} } as express.Request;
    const res = createResponseMock() as unknown as express.Response;

    await handler(req, res, vi.fn());

    expect(mockExtractFromRequest).toHaveBeenCalledWith(req);
    expect(mockRefreshToken).toHaveBeenCalledWith('cookie-token');
    expect((res as unknown as { json: ReturnType<typeof vi.fn> }).json).toHaveBeenCalledWith({
      success: true,
      token: 'new-token',
    });
  });

  it('rotates the session cookie when a cookie-backed session refresh succeeds', async () => {
    mockExtractFromRequest.mockReturnValue('current-token');
    mockRefreshToken.mockResolvedValue('new-token');

    const { registerAuthRoutes } = await import('@process/webserver/routes/authRoutes');
    const app = express();
    registerAuthRoutes(app);

    const handler = getRefreshHandler(app);
    const req = {
      body: {},
      cookies: {
        'auth-token': 'current-token',
      },
    } as express.Request;
    const res = createResponseMock() as unknown as express.Response;

    await handler(req, res, vi.fn());

    expect((res as unknown as { cookie: ReturnType<typeof vi.fn> }).cookie).toHaveBeenCalledWith(
      'auth-token',
      'new-token',
      {
        httpOnly: true,
        maxAge: 0,
      }
    );
  });

  it('returns 400 when token is missing from both body and request credentials', async () => {
    const { registerAuthRoutes } = await import('@process/webserver/routes/authRoutes');
    const app = express();
    registerAuthRoutes(app);

    const handler = getRefreshHandler(app);
    const req = { body: {} } as express.Request;
    const res = createResponseMock() as unknown as express.Response;

    await handler(req, res, vi.fn());

    expect(mockRefreshToken).not.toHaveBeenCalled();
    expect((res as unknown as { status: ReturnType<typeof vi.fn> }).status).toHaveBeenCalledWith(400);
    expect((res as unknown as { json: ReturnType<typeof vi.fn> }).json).toHaveBeenCalledWith({
      success: false,
      error: 'Token is required',
    });
  });

  it('returns 500 when refreshToken throws an error', async () => {
    mockRefreshToken.mockRejectedValue(new Error('db error'));

    const { registerAuthRoutes } = await import('@process/webserver/routes/authRoutes');
    const app = express();
    registerAuthRoutes(app);

    const handler = getRefreshHandler(app);
    const req = { body: { token: 'some-token' } } as express.Request;
    const res = createResponseMock() as unknown as express.Response;

    await handler(req, res, vi.fn());

    expect(mockRefreshToken).toHaveBeenCalledWith('some-token');
    expect((res as unknown as { status: ReturnType<typeof vi.fn> }).status).toHaveBeenCalledWith(500);
    expect((res as unknown as { json: ReturnType<typeof vi.fn> }).json).toHaveBeenCalledWith({
      success: false,
      error: 'Internal server error',
    });
  });
});
