import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AuthService refreshToken', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('refreshes an expired but otherwise valid token', async () => {
    vi.doMock('@process/webserver/auth/repository/UserRepository', () => ({
      UserRepository: {
        getPrimaryWebUIUser: vi.fn(async () => ({
          id: 'system-user',
          username: 'admin',
          password_hash: 'hash',
          jwt_secret: 'db-secret',
          created_at: 0,
          updated_at: 0,
          last_login: null,
        })),
        updateJwtSecret: vi.fn(),
      },
    }));

    const { AuthService } = await import('@process/webserver/auth/service/AuthService');
    const expiredToken = jwt.sign(
      {
        userId: 'user-1',
        username: 'alice',
      },
      'db-secret',
      {
        audience: 'aionui-webui',
        expiresIn: -10,
        issuer: 'aionui',
      }
    );

    const refreshedToken = await AuthService.refreshToken(expiredToken);

    expect(refreshedToken).toEqual(expect.any(String));
    expect(refreshedToken).not.toBe(expiredToken);
    await expect(AuthService.verifyToken(refreshedToken!)).resolves.toMatchObject({
      userId: 'user-1',
      username: 'alice',
    });
  });

  it('rotates to a distinct token before blacklisting the previous session', async () => {
    vi.doMock('@process/webserver/auth/repository/UserRepository', () => ({
      UserRepository: {
        getPrimaryWebUIUser: vi.fn(async () => ({
          id: 'system-user',
          username: 'admin',
          password_hash: 'hash',
          jwt_secret: 'db-secret',
          created_at: 0,
          updated_at: 0,
          last_login: null,
        })),
        updateJwtSecret: vi.fn(),
      },
    }));

    const { AuthService } = await import('@process/webserver/auth/service/AuthService');

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-18T19:10:00.000Z'));

    const originalToken = await AuthService.generateToken({
      id: 'user-1',
      username: 'alice',
    });

    const refreshedToken = await AuthService.refreshToken(originalToken);

    expect(refreshedToken).toEqual(expect.any(String));
    expect(refreshedToken).not.toBe(originalToken);
    await expect(AuthService.verifyToken(originalToken)).resolves.toBeNull();
    await expect(AuthService.verifyToken(refreshedToken!)).resolves.toMatchObject({
      userId: 'user-1',
      username: 'alice',
    });

    vi.useRealTimers();
  });
});
