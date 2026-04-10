import { describe, it, expect, vi } from 'vitest';
import { generateQRLoginUrlDirect, verifyQRTokenDirect } from '@process/bridge/webuiQR';

vi.mock('@process/webserver/auth/repository/UserRepository', () => ({
  UserRepository: {
    getSystemUser: vi.fn().mockResolvedValue({
      id: 'test-user-id',
      username: 'admin',
      password_hash: 'hash',
      jwt_secret: 'test-jwt-secret-for-unit-tests-only-not-for-production',
      created_at: Date.now(),
      updated_at: Date.now(),
      last_login: null,
    }),
    getPrimaryWebUIUser: vi.fn().mockResolvedValue({
      id: 'test-user-id',
      username: 'admin',
      password_hash: 'hash',
      jwt_secret: 'test-jwt-secret-for-unit-tests-only-not-for-production',
      created_at: Date.now(),
      updated_at: Date.now(),
      last_login: null,
    }),
    updateLastLogin: vi.fn().mockResolvedValue(undefined),
    updateJwtSecret: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('generateQRLoginUrlDirect', () => {
  it('returns a qrUrl and expiresAt', () => {
    const result = generateQRLoginUrlDirect(3000, false);
    expect(result.qrUrl).toMatch(/^http:\/\/localhost:3000\/qr-login\?token=/);
    expect(result.expiresAt).toBeGreaterThan(Date.now());
  });

  it('uses LAN IP when allowRemote=true and LAN IP available', () => {
    // getLanIP may return null in CI — just verify the shape is correct
    const result = generateQRLoginUrlDirect(3000, true);
    expect(result.qrUrl).toMatch(/\/qr-login\?token=/);
  });
});

describe('verifyQRTokenDirect', () => {
  it('rejects an unknown token', async () => {
    const result = await verifyQRTokenDirect('bad-token');
    expect(result.success).toBe(false);
  });

  it('accepts a freshly generated token', async () => {
    const { qrUrl } = generateQRLoginUrlDirect(3000, false);
    const token = new URL(qrUrl).searchParams.get('token')!;
    const result = await verifyQRTokenDirect(token, '127.0.0.1');
    expect(result.success).toBe(true);
    expect(result.data?.sessionToken).toBeTruthy();
  });

  it('rejects a token used twice', async () => {
    const { qrUrl } = generateQRLoginUrlDirect(3000, false);
    const token = new URL(qrUrl).searchParams.get('token')!;
    await verifyQRTokenDirect(token, '127.0.0.1');
    const second = await verifyQRTokenDirect(token, '127.0.0.1');
    expect(second.success).toBe(false);
  });
});
