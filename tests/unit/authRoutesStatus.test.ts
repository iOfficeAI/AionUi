import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockHasUsers,
  mockCountUsers,
  mockValidateLoginInput,
  mockAuthenticateToken,
  mockVerifyQRTokenDirect,
  mockCreateAppError,
} = vi.hoisted(() => ({
  mockHasUsers: vi.fn(),
  mockCountUsers: vi.fn(),
  mockValidateLoginInput: vi.fn((_req: express.Request, _res: express.Response, next: express.NextFunction) => next()),
  mockAuthenticateToken: vi.fn((_req: express.Request, _res: express.Response, next: express.NextFunction) => next()),
  mockVerifyQRTokenDirect: vi.fn(),
  mockCreateAppError: vi.fn((message: string, status: number) => ({ message, status })),
}));

vi.mock('@process/webserver/auth/repository/UserRepository', () => ({
  UserRepository: {
    hasUsers: mockHasUsers,
    countUsers: mockCountUsers,
    findByUsername: vi.fn(),
    updateLastLogin: vi.fn(),
    getSystemUser: vi.fn(),
    setSystemUserCredentials: vi.fn(),
    createUser: vi.fn(),
    findById: vi.fn(),
    listUsers: vi.fn(),
    updatePassword: vi.fn(),
    updateUsername: vi.fn(),
    updateLastActiveAt: vi.fn(),
    countActiveUsers: vi.fn(),
    deleteUser: vi.fn(),
  },
}));

vi.mock('@process/webserver/auth/service/AuthService', () => ({
  AuthService: {
    constantTimeVerify: vi.fn(),
    generateToken: vi.fn(),
    blacklistToken: vi.fn(),
    hashPassword: vi.fn(),
    validatePassword: vi.fn(),
  },
}));

vi.mock('@process/webserver/auth/middleware/AuthMiddleware', () => ({
  AuthMiddleware: {
    validateLoginInput: mockValidateLoginInput,
    authenticateToken: mockAuthenticateToken,
    validateSetupInput: vi.fn((_req: express.Request, _res: express.Response, next: express.NextFunction) => next()),
    requireSetupMode: vi.fn((_req: express.Request, _res: express.Response, next: express.NextFunction) => next()),
  },
}));

vi.mock('@process/webserver/auth/middleware/TokenMiddleware', () => ({
  TokenUtils: {
    extractFromRequest: vi.fn(),
  },
}));

vi.mock('@process/bridge/webuiQR', () => ({
  verifyQRTokenDirect: mockVerifyQRTokenDirect,
}));

vi.mock('@process/webserver/middleware/errorHandler', () => ({
  createAppError: mockCreateAppError,
}));

const passThroughMiddleware = (_req: express.Request, _res: express.Response, next: express.NextFunction) => next();

vi.mock('@process/webserver/middleware/security', () => {
  return {
    authRateLimiter: passThroughMiddleware,
    authenticatedActionLimiter: passThroughMiddleware,
    apiRateLimiter: passThroughMiddleware,
  };
});

vi.mock('@process/webserver/config/constants', () => ({
  AUTH_CONFIG: {
    COOKIE: { NAME: 'auth' },
    TOKEN: { COOKIE_MAX_AGE: 3600000 },
  },
  getCookieOptions: vi.fn(() => ({})),
}));

function getAuthStatusHandler(app: express.Express): express.RequestHandler {
  const layer = app.router.stack.find(
    (entry: { route?: { path?: string; stack?: Array<{ handle: express.RequestHandler }> } }) =>
      entry.route?.path === '/api/auth/status'
  );

  return layer?.route?.stack?.[1]?.handle as express.RequestHandler;
}

async function waitForAssertion(assertion: () => void): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  throw lastError;
}

describe('registerAuthRoutes /api/auth/status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns needsSetup true when no configured users exist', async () => {
    mockHasUsers.mockResolvedValue(false);
    mockCountUsers.mockResolvedValue(0);

    const { registerAuthRoutes } = await import('@process/webserver/routes/authRoutes');
    const app = express();
    registerAuthRoutes(app);

    const handler = getAuthStatusHandler(app);
    const res = {
      json: vi.fn(),
      status: vi.fn(),
    } as unknown as express.Response;

    handler({} as express.Request, res, vi.fn());

    await waitForAssertion(() => {
      expect(mockHasUsers).toHaveBeenCalledOnce();
      expect(mockCountUsers).toHaveBeenCalledOnce();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        needsSetup: true,
        userCount: 0,
        isAuthenticated: false,
      });
    });
  });

  it('returns needsSetup false and a numeric userCount when users exist', async () => {
    mockHasUsers.mockResolvedValue(true);
    mockCountUsers.mockResolvedValue(3);

    const { registerAuthRoutes } = await import('@process/webserver/routes/authRoutes');
    const app = express();
    registerAuthRoutes(app);

    const handler = getAuthStatusHandler(app);
    const res = {
      json: vi.fn(),
      status: vi.fn(),
    } as unknown as express.Response;

    handler({} as express.Request, res, vi.fn());

    await waitForAssertion(() => {
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        needsSetup: false,
        userCount: 3,
        isAuthenticated: false,
      });
    });
  });

  it('returns a 500 response when the repository check fails', async () => {
    mockHasUsers.mockRejectedValue(new Error('db failure'));
    mockCountUsers.mockResolvedValue(0);

    const { registerAuthRoutes } = await import('@process/webserver/routes/authRoutes');
    const app = express();
    registerAuthRoutes(app);

    const handler = getAuthStatusHandler(app);
    const res = {
      json: vi.fn(),
      status: vi.fn(() => res),
    } as unknown as express.Response;

    handler({} as express.Request, res, vi.fn());

    await waitForAssertion(() => {
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Internal server error',
      });
    });
  });

  it('returns a 500 response when counting users fails', async () => {
    mockHasUsers.mockResolvedValue(true);
    mockCountUsers.mockRejectedValue(new Error('count failure'));

    const { registerAuthRoutes } = await import('@process/webserver/routes/authRoutes');
    const app = express();
    registerAuthRoutes(app);

    const handler = getAuthStatusHandler(app);
    const res = {
      json: vi.fn(),
      status: vi.fn(() => res),
    } as unknown as express.Response;

    handler({} as express.Request, res, vi.fn());

    await waitForAssertion(() => {
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Internal server error',
      });
    });
  });
});
