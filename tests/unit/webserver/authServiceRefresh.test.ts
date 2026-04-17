import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AuthService.refreshToken', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.JWT_SECRET = 'refresh-secret';
  });

  it('refreshes an expired token when signature and claims are still valid', async () => {
    vi.doMock('@process/webserver/auth/repository/UserRepository', () => ({
      UserRepository: {},
    }));

    const { AuthService } = await import('@process/webserver/auth/service/AuthService');
    const manuallyExpiredToken = jwt.sign(
      {
        userId: 'user-1',
        username: 'alice',
      },
      process.env.JWT_SECRET as string,
      {
        expiresIn: -10,
        issuer: 'aionui',
        audience: 'aionui-webui',
      }
    );

    const refreshedToken = await AuthService.refreshToken(manuallyExpiredToken);

    expect(refreshedToken).toEqual(expect.any(String));
    expect(refreshedToken).not.toBe(manuallyExpiredToken);

    const refreshedPayload = await AuthService.verifyToken(refreshedToken as string);
    expect(refreshedPayload).toMatchObject({
      userId: 'user-1',
      username: 'alice',
    });
  });

  it('blacklists the original token after refreshing a still-active session token', async () => {
    vi.doMock('@process/webserver/auth/repository/UserRepository', () => ({
      UserRepository: {},
    }));

    const { AuthService } = await import('@process/webserver/auth/service/AuthService');
    const currentToken = await AuthService.generateToken({
      id: 'user-3',
      username: 'carol',
    });

    const refreshedToken = await AuthService.refreshToken(currentToken);

    expect(refreshedToken).toEqual(expect.any(String));
    expect(refreshedToken).not.toBe(currentToken);
    expect(AuthService.isTokenBlacklisted(currentToken)).toBe(true);
  });

  it('rejects refresh for a token already blacklisted', async () => {
    vi.doMock('@process/webserver/auth/repository/UserRepository', () => ({
      UserRepository: {},
    }));

    const { AuthService } = await import('@process/webserver/auth/service/AuthService');
    const currentToken = await AuthService.generateToken({
      id: 'user-2',
      username: 'bob',
    });

    AuthService.blacklistToken(currentToken);

    await expect(AuthService.refreshToken(currentToken)).resolves.toBeNull();
  });
});
