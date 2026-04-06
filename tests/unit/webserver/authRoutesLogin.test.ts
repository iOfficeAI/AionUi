import type { RequestHandler } from 'express';
import express from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockFindByUsername, mockConstantTimeVerify, mockConstantTimeVerifyMissingUser } = vi.hoisted(() => ({
  mockFindByUsername: vi.fn(),
  mockConstantTimeVerify: vi.fn(),
  mockConstantTimeVerifyMissingUser: vi.fn(),
}));

vi.mock('@process/webserver/auth/repository/UserRepository', () => ({
  UserRepository: {
    findByUsername: mockFindByUsername,
    updateLastLogin: vi.fn(),
    hasUsers: vi.fn(),
    countUsers: vi.fn(),
    createInitialUser: vi.fn(),
    changePassword: vi.fn(),
    usernameExists: vi.fn(),
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
    constantTimeVerify: mockConstantTimeVerify,
    constantTimeVerifyMissingUser: mockConstantTimeVerifyMissingUser,
    generateToken: vi.fn(),
    blacklistToken: vi.fn(),
    hashPassword: vi.fn(),
    validatePassword: vi.fn(),
    validatePasswordStrength: vi.fn(() => ({ isValid: true, errors: [] })),
    verifyPassword: vi.fn(),
    invalidateAllTokens: vi.fn(),
    refreshToken: vi.fn(),
    verifyToken: vi.fn(),
  },
}));

vi.mock('@process/webserver/auth/middleware/AuthMiddleware', () => ({
  AuthMiddleware: {
    validateLoginInput: ((_req, _res, next) => next()) as RequestHandler,
    authenticateToken: ((_req, _res, next) => next()) as RequestHandler,
    validateSetupInput: ((_req, _res, next) => next()) as RequestHandler,
    requireSetupMode: ((_req, _res, next) => next()) as RequestHandler,
  },
}));

vi.mock('@process/webserver/auth/middleware/TokenMiddleware', () => ({
  TokenUtils: {
    extractFromRequest: vi.fn(),
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

vi.mock('@process/webserver/config/constants', () => ({
  AUTH_CONFIG: {
    COOKIE: {
      NAME: 'auth-token',
    },
    TOKEN: {
      COOKIE_MAX_AGE: 0,
      SESSION_EXPIRY: 3600,
    },
  },
  getCookieOptions: vi.fn(() => ({})),
}));

vi.mock('@process/bridge/webuiQR', () => ({
  verifyQRTokenDirect: vi.fn(),
}));

function getLoginHandler(app: express.Express): RequestHandler {
  const layer = app.router.stack.find(
    (entry: { route?: { path?: string; stack?: Array<{ handle: RequestHandler }> } }) => entry.route?.path === '/login'
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

describe('registerAuthRoutes login endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 after running the dedicated missing-user verification when the username does not exist', async () => {
    mockFindByUsername.mockResolvedValue(null);
    mockConstantTimeVerifyMissingUser.mockResolvedValue(false);

    const { registerAuthRoutes } = await import('@process/webserver/routes/authRoutes');
    const app = express();
    registerAuthRoutes(app);

    const handler = getLoginHandler(app);
    const req = {
      body: {
        username: 'missing-user',
        password: 'wrong-password',
      },
    } as express.Request;
    const res = createResponseMock() as unknown as express.Response;

    await handler(req, res, vi.fn());

    expect(mockFindByUsername).toHaveBeenCalledWith('missing-user');
    expect(mockConstantTimeVerifyMissingUser).toHaveBeenCalledOnce();
    expect(mockConstantTimeVerify).not.toHaveBeenCalled();
    expect((res as unknown as { status: ReturnType<typeof vi.fn> }).status).toHaveBeenCalledWith(401);
    expect((res as unknown as { json: ReturnType<typeof vi.fn> }).json).toHaveBeenCalledWith({
      success: false,
      message: 'Invalid username or password',
    });
  });

  it('verifies the provided password against the stored hash when the user exists', async () => {
    mockFindByUsername.mockResolvedValue({
      id: 'user-1',
      username: 'alice',
      password_hash: '$2a$12$storedhashstoredhashstoredhashstoredhashstoredhashsto',
    });
    mockConstantTimeVerify.mockResolvedValue(false);

    const { registerAuthRoutes } = await import('@process/webserver/routes/authRoutes');
    const app = express();
    registerAuthRoutes(app);

    const handler = getLoginHandler(app);
    const req = {
      body: {
        username: 'alice',
        password: 'wrong-password',
      },
    } as express.Request;
    const res = createResponseMock() as unknown as express.Response;

    await handler(req, res, vi.fn());

    expect(mockConstantTimeVerifyMissingUser).not.toHaveBeenCalled();
    expect(mockConstantTimeVerify).toHaveBeenCalledWith(
      'wrong-password',
      '$2a$12$storedhashstoredhashstoredhashstoredhashstoredhashsto',
      true
    );
    expect((res as unknown as { status: ReturnType<typeof vi.fn> }).status).toHaveBeenCalledWith(401);
  });
});
