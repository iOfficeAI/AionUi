import { afterEach, describe, expect, it, vi } from 'vitest';

const {
  loadOrCreateDeviceIdentity,
  buildDeviceAuthPayload,
  signDevicePayload,
  publicKeyRawBase64UrlFromPem,
  loadDeviceAuthToken,
  storeDeviceAuthToken,
  clearDeviceAuthToken,
} = vi.hoisted(() => ({
  loadOrCreateDeviceIdentity: vi.fn(() => ({
    deviceId: 'device-1',
    publicKeyPem: 'public-pem',
    privateKeyPem: 'private-pem',
  })),
  buildDeviceAuthPayload: vi.fn(() => 'payload'),
  signDevicePayload: vi.fn(() => 'signature'),
  publicKeyRawBase64UrlFromPem: vi.fn(() => 'public-key'),
  loadDeviceAuthToken: vi.fn(),
  storeDeviceAuthToken: vi.fn(),
  clearDeviceAuthToken: vi.fn(),
}));

vi.mock('@/process/agent/openclaw/deviceIdentity', () => ({
  loadOrCreateDeviceIdentity,
  buildDeviceAuthPayload,
  signDevicePayload,
  publicKeyRawBase64UrlFromPem,
}));

vi.mock('@/process/agent/openclaw/deviceAuthStore', () => ({
  loadDeviceAuthToken,
  storeDeviceAuthToken,
  clearDeviceAuthToken,
}));

import { OpenClawGatewayConnection } from '@/process/agent/openclaw/OpenClawGatewayConnection';

describe('OpenClawGatewayConnection', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('defaults to operator.write scope to avoid unnecessary re-pairing', () => {
    const connection = new OpenClawGatewayConnection({
      url: 'ws://127.0.0.1:18789',
    });

    expect((connection as unknown as { opts: { role: string; scopes: string[] } }).opts.role).toBe('operator');
    expect((connection as unknown as { opts: { role: string; scopes: string[] } }).opts.scopes).toEqual([
      'operator.write',
    ]);
  });

  it('retries with shared gateway token when stored device token requests unapproved scopes', async () => {
    loadDeviceAuthToken.mockImplementationOnce(() => ({
      token: 'device-token',
      role: 'operator',
      scopes: ['operator.write'],
      updatedAtMs: 1,
    }));
    loadDeviceAuthToken.mockImplementation(() => null);

    const onHelloOk = vi.fn();
    const onConnectError = vi.fn();
    const connection = new OpenClawGatewayConnection({
      url: 'ws://127.0.0.1:18789',
      token: 'shared-token',
      onHelloOk,
      onConnectError,
    });

    const requestCalls: Array<{ auth?: { token?: string } }> = [];
    vi.spyOn(connection as never, 'request' as never).mockImplementation(async (_method: string, params?: unknown) => {
      requestCalls.push(params as { auth?: { token?: string } });
      if (requestCalls.length === 1) {
        const error = new Error('pairing required: device is asking for more scopes than currently approved');
        (error as Error & { details?: { code?: string } }).details = { code: 'PAIRING_REQUIRED' };
        throw error;
      }
      return {
        auth: {
          deviceToken: 'fresh-device-token',
          role: 'operator',
          scopes: ['operator.write'],
        },
        policy: {
          tickIntervalMs: 30_000,
        },
      };
    });

    (connection as { sendConnect: () => void }).sendConnect();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(requestCalls).toHaveLength(2);
    expect(requestCalls[0]?.auth?.token).toBe('device-token');
    expect(requestCalls[1]?.auth?.token).toBe('shared-token');
    expect(clearDeviceAuthToken).toHaveBeenCalledWith({
      deviceId: 'device-1',
      role: 'operator',
    });
    expect(onConnectError).not.toHaveBeenCalled();
    expect(onHelloOk).toHaveBeenCalledOnce();

    connection.stop();
  });

  it('uses a tighter connect fallback delay', () => {
    expect((OpenClawGatewayConnection as unknown as { CONNECT_FALLBACK_DELAY_MS: number }).CONNECT_FALLBACK_DELAY_MS).toBe(
      150
    );
  });
});
