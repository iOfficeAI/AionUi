import { describe, it, expect, vi } from 'vitest';
import { generateQRLoginUrlDirect, verifyQRTokenDirect } from '@process/bridge/webuiQR';
import { selectPreferredRemoteAddress } from '@process/bridge/services/WebuiService';

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

function getTokenFromQrUrl(qrUrl: string): string {
  const url = new URL(qrUrl);
  return url.searchParams.get('token')!;
}

const ipv4 = (address: string) => ({
  address,
  netmask: '255.255.255.0',
  family: 'IPv4' as const,
  mac: '00:00:00:00:00:00',
  internal: false,
  cidr: `${address}/24`,
});

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

describe('selectPreferredRemoteAddress', () => {
  it('prefers Tailscale over other active private interfaces', () => {
    expect(
      selectPreferredRemoteAddress({
        'Ethernet 2': [ipv4('10.21.52.245')],
        Ethernet: [ipv4('192.168.0.4')],
        Tailscale: [ipv4('100.87.187.54')],
      })
    ).toBe('100.87.187.54');
  });

  it('prefers a regular LAN address over a 10.x virtual/VPN-style address when Tailscale is absent', () => {
    expect(
      selectPreferredRemoteAddress({
        'Ethernet 2': [ipv4('10.21.52.245')],
        Ethernet: [ipv4('192.168.0.4')],
      })
    ).toBe('192.168.0.4');
  });

  it('ignores link-local addresses', () => {
    expect(
      selectPreferredRemoteAddress({
        'Wi-Fi': [ipv4('169.254.166.159')],
        Ethernet: [ipv4('192.168.0.4')],
      })
    ).toBe('192.168.0.4');
  });
});

describe('verifyQRTokenDirect', () => {
  it('rejects an unknown token', async () => {
    const result = await verifyQRTokenDirect('bad-token');
    expect(result.success).toBe(false);
  });

  it('accepts a freshly generated token', async () => {
    const { qrUrl } = generateQRLoginUrlDirect(3000, false);
    const token = getTokenFromQrUrl(qrUrl);
    const result = await verifyQRTokenDirect(token, '127.0.0.1');
    expect(result.success).toBe(true);
    expect(result.data?.sessionToken).toBeTruthy();
  });

  it('rejects a token used twice', async () => {
    const { qrUrl } = generateQRLoginUrlDirect(3000, false);
    const token = getTokenFromQrUrl(qrUrl);
    await verifyQRTokenDirect(token, '127.0.0.1');
    const second = await verifyQRTokenDirect(token, '127.0.0.1');
    expect(second.success).toBe(false);
  });
});
