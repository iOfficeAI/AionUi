import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type LoadOptions = {
  lanIp?: string | null;
  adminUser?: { id: string; username: string } | null;
  tokenHex?: string;
};

async function loadQrService(options: LoadOptions = {}) {
  const { lanIp = null, adminUser = { id: 'admin-id', username: 'admin' }, tokenHex = 'a'.repeat(64) } = options;

  const generateToken = vi.fn(() => 'session-token');
  const findByUsername = vi.fn(() => adminUser);
  const updateLastLogin = vi.fn();

  vi.doMock('crypto', () => ({
    default: {
      randomBytes: vi.fn(() => Buffer.from(tokenHex, 'hex')),
    },
  }));

  vi.doMock('os', () => ({
    networkInterfaces: vi.fn(() => {
      if (!lanIp) return {};
      return {
        eth0: [
          {
            family: 'IPv4',
            internal: false,
            address: lanIp,
          },
        ],
      };
    }),
  }));

  vi.doMock('@/webserver/auth/service/AuthService', () => ({
    AuthService: {
      generateToken,
    },
  }));

  vi.doMock('@/webserver/auth/repository/UserRepository', () => ({
    UserRepository: {
      findByUsername,
      updateLastLogin,
    },
  }));

  vi.doMock('@/webserver/config/constants', () => ({
    AUTH_CONFIG: {
      DEFAULT_USER: {
        USERNAME: 'admin',
      },
    },
  }));

  const service = await import('@/webserver/auth/qrTokenService');
  return { service, generateToken, findByUsername, updateLastLogin };
}

describe('webserver/auth/qrTokenService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('creates local QR token and verifies successfully for local IP', async () => {
    const { service, generateToken, findByUsername, updateLastLogin } = await loadQrService();

    const created = service.createQRToken(3000, false);
    expect(created.token).toHaveLength(64);
    expect(created.qrUrl).toBe(`http://localhost:3000/qr-login?token=${created.token}`);

    const verified = await service.verifyQRTokenDirect(created.token, '127.0.0.1');
    expect(verified.success).toBe(true);
    expect(verified.data).toEqual({
      sessionToken: 'session-token',
      username: 'admin',
    });

    expect(findByUsername).toHaveBeenCalledWith('admin');
    expect(generateToken).toHaveBeenCalled();
    expect(updateLastLogin).toHaveBeenCalledWith('admin-id');

    const reused = await service.verifyQRTokenDirect(created.token, '127.0.0.1');
    expect(reused.success).toBe(false);
    expect(reused.msg).toBe('Invalid or expired QR token');
  });

  it('rejects non-local IP for local-only token', async () => {
    const { service } = await loadQrService();

    const created = service.createQRToken(3000, false);
    const result = await service.verifyQRTokenDirect(created.token, '8.8.8.8');

    expect(result.success).toBe(false);
    expect(result.msg).toBe('QR login is only allowed from local network');
  });

  it('uses LAN address in QR URL when remote mode is enabled', async () => {
    const { service } = await loadQrService({ lanIp: '192.168.1.50', tokenHex: 'b'.repeat(64) });

    const created = service.createQRToken(3456, true);
    expect(created.qrUrl).toBe(`http://192.168.1.50:3456/qr-login?token=${created.token}`);

    const direct = service.generateQRLoginUrlDirect(3456, true);
    expect(direct.qrUrl.startsWith('http://192.168.1.50:3456/qr-login?token=')).toBe(true);
    expect(direct.expiresAt).toBeGreaterThan(Date.now());
  });

  it('marks token expired after timeout and returns expired message', async () => {
    const { service } = await loadQrService({ tokenHex: 'c'.repeat(64) });

    const created = service.createQRToken(3000, true);

    vi.setSystemTime(Date.now() + 5 * 60 * 1000 + 1);
    const expired = await service.verifyQRTokenDirect(created.token, '127.0.0.1');
    expect(expired.success).toBe(false);
    expect(expired.msg).toBe('QR token has expired');

    const secondTry = await service.verifyQRTokenDirect(created.token, '127.0.0.1');
    expect(secondTry.success).toBe(false);
    expect(secondTry.msg).toBe('Invalid or expired QR token');
  });

  it('returns error when admin user is missing', async () => {
    const { service, generateToken } = await loadQrService({ adminUser: null, tokenHex: 'd'.repeat(64) });

    const created = service.createQRToken(3000, true);
    const result = await service.verifyQRTokenDirect(created.token);

    expect(result.success).toBe(false);
    expect(result.msg).toBe('Admin user not found');
    expect(generateToken).not.toHaveBeenCalled();
  });
});
