/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const providerMap = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());

const mockDb = vi.hoisted(() => ({
  getRemoteAgents: vi.fn(() => [
    { id: 'a1', name: 'Agent1', protocol: 'openclaw', url: 'wss://a1', authType: 'bearer', createdAt: 0, updatedAt: 0 },
  ]),
  getRemoteAgent: vi.fn((id: string) =>
    id === 'a1'
      ? {
          id: 'a1',
          name: 'Agent1',
          protocol: 'openclaw',
          url: 'wss://a1',
          authType: 'bearer',
          createdAt: 0,
          updatedAt: 0,
        }
      : null
  ),
  createRemoteAgent: vi.fn((config: Record<string, unknown>) => ({ success: true, data: config })),
  updateRemoteAgent: vi.fn(() => ({ success: true })),
  deleteRemoteAgent: vi.fn(() => ({ success: true })),
}));

vi.mock('../../src/common', () => {
  const makeChannel = (name: string) => ({
    provider: (fn: (...args: unknown[]) => unknown) => {
      providerMap.set(name, fn);
    },
  });

  return {
    ipcBridge: {
      remoteAgent: {
        list: makeChannel('list'),
        get: makeChannel('get'),
        create: makeChannel('create'),
        update: makeChannel('update'),
        delete: makeChannel('delete'),
        testConnection: makeChannel('testConnection'),
        handshake: makeChannel('handshake'),
      },
    },
  };
});

vi.mock('../../src/process/services/database', () => ({
  getDatabase: vi.fn().mockResolvedValue(mockDb),
}));

vi.mock('../../src/common/utils', () => {
  let counter = 0;
  return { uuid: () => `test-uuid-${++counter}` };
});

vi.mock('../../src/process/agent/openclaw/deviceIdentity', () => ({
  generateIdentity: vi.fn(() => ({
    deviceId: 'dev-id',
    publicKeyPem: 'pub-pem',
    privateKeyPem: 'priv-pem',
  })),
}));

const capturedConnCallbacks = vi.hoisted(
  () =>
    ({
      onHelloOk: null as ((hello: unknown) => void) | null,
      onConnectError: null as ((err: Error) => void) | null,
      onClose: null as ((code: number, reason: string) => void) | null,
      onDeviceTokenIssued: null as ((token: string) => void) | null,
    }) as Record<string, ((...args: unknown[]) => void) | null>
);

vi.mock('../../src/process/agent/openclaw/OpenClawGatewayConnection', () => ({
  OpenClawGatewayConnection: class {
    start = vi.fn();
    stop = vi.fn();
    constructor(opts: Record<string, unknown>) {
      capturedConnCallbacks.onHelloOk = (opts.onHelloOk as typeof capturedConnCallbacks.onHelloOk) ?? null;
      capturedConnCallbacks.onConnectError =
        (opts.onConnectError as typeof capturedConnCallbacks.onConnectError) ?? null;
      capturedConnCallbacks.onClose = (opts.onClose as typeof capturedConnCallbacks.onClose) ?? null;
      capturedConnCallbacks.onDeviceTokenIssued =
        (opts.onDeviceTokenIssued as typeof capturedConnCallbacks.onDeviceTokenIssued) ?? null;
    }
  },
}));

vi.mock('ws', () => ({
  default: class MockWebSocket {
    private handlers = new Map<string, (arg: unknown) => void>();
    constructor() {
      // Simulate successful connection after a tick
      setTimeout(() => this.handlers.get('open')?.(undefined), 0);
    }
    on(event: string, handler: (arg: unknown) => void) {
      this.handlers.set(event, handler);
    }
    close() {}
  },
}));

import { initRemoteAgentBridge } from '../../src/process/bridge/remoteAgentBridge';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('remoteAgentBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    providerMap.clear();
    initRemoteAgentBridge();
  });

  describe('list provider', () => {
    it('returns all remote agents from database', async () => {
      const handler = providerMap.get('list')!;
      const result = await handler();
      expect(mockDb.getRemoteAgents).toHaveBeenCalled();
      expect(result).toEqual([expect.objectContaining({ id: 'a1', name: 'Agent1' })]);
    });
  });

  describe('get provider', () => {
    it('returns remote agent by id', async () => {
      const handler = providerMap.get('get')!;
      const result = await handler({ id: 'a1' });
      expect(mockDb.getRemoteAgent).toHaveBeenCalledWith('a1');
      expect(result).toEqual(expect.objectContaining({ id: 'a1' }));
    });

    it('returns null for non-existent agent', async () => {
      const handler = providerMap.get('get')!;
      const result = await handler({ id: 'missing' });
      expect(result).toBeNull();
    });
  });

  describe('create provider', () => {
    it('creates agent with generated device identity for openclaw protocol', async () => {
      const handler = providerMap.get('create')!;
      const result = await handler({
        name: 'NewAgent',
        protocol: 'openclaw',
        url: 'wss://new',
        authType: 'bearer',
        authToken: 'tok',
      });

      expect(mockDb.createRemoteAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'NewAgent',
          protocol: 'openclaw',
          deviceId: 'dev-id',
          devicePublicKey: 'pub-pem',
          devicePrivateKey: 'priv-pem',
        })
      );
      expect(result).toBeDefined();
    });

    it('creates agent without device identity for non-openclaw protocol', async () => {
      const handler = providerMap.get('create')!;
      await handler({
        name: 'AcpAgent',
        protocol: 'acp',
        url: 'wss://acp',
        authType: 'none',
      });

      expect(mockDb.createRemoteAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          deviceId: undefined,
          devicePublicKey: undefined,
          devicePrivateKey: undefined,
        })
      );
    });

    it('throws when database create fails', async () => {
      mockDb.createRemoteAgent.mockReturnValueOnce({ success: false, error: 'duplicate' });
      const handler = providerMap.get('create')!;
      await expect(handler({ name: 'X', protocol: 'openclaw', url: 'wss://x', authType: 'none' })).rejects.toThrow(
        'duplicate'
      );
    });
  });

  describe('update provider', () => {
    it('maps camelCase fields to snake_case for database', async () => {
      const handler = providerMap.get('update')!;
      await handler({
        id: 'a1',
        updates: {
          name: 'Renamed',
          authType: 'password',
          authToken: 'secret',
          url: 'wss://new-url',
        },
      });

      expect(mockDb.updateRemoteAgent).toHaveBeenCalledWith(
        'a1',
        expect.objectContaining({
          name: 'Renamed',
          auth_type: 'password',
          auth_token: 'secret',
          url: 'wss://new-url',
        })
      );
    });

    it('returns true on success', async () => {
      const handler = providerMap.get('update')!;
      const result = await handler({ id: 'a1', updates: { name: 'X' } });
      expect(result).toBe(true);
    });
  });

  describe('delete provider', () => {
    it('deletes agent by id and returns success', async () => {
      const handler = providerMap.get('delete')!;
      const result = await handler({ id: 'a1' });
      expect(mockDb.deleteRemoteAgent).toHaveBeenCalledWith('a1');
      expect(result).toBe(true);
    });
  });

  describe('testConnection provider', () => {
    it('returns success on WebSocket open', async () => {
      const handler = providerMap.get('testConnection')!;
      const result = await handler({ url: 'wss://test', authType: 'none' });
      expect(result).toEqual({ success: true });
    });
  });

  describe('update provider – additional fields', () => {
    it('maps avatar and description fields', async () => {
      const handler = providerMap.get('update')!;
      await handler({
        id: 'a1',
        updates: { avatar: '🤖', description: 'My agent', protocol: 'openclaw' },
      });

      expect(mockDb.updateRemoteAgent).toHaveBeenCalledWith(
        'a1',
        expect.objectContaining({ avatar: '🤖', description: 'My agent', protocol: 'openclaw' })
      );
    });
  });

  describe('handshake provider', () => {
    beforeEach(() => {
      capturedConnCallbacks.onHelloOk = null;
      capturedConnCallbacks.onConnectError = null;
      capturedConnCallbacks.onClose = null;
      capturedConnCallbacks.onDeviceTokenIssued = null;
    });

    it('returns error when agent not found', async () => {
      const handler = providerMap.get('handshake')!;
      const result = await handler({ id: 'missing' });
      expect(result).toEqual({ status: 'error', error: 'Remote agent not found' });
    });

    it('returns ok immediately for non-openclaw protocol', async () => {
      mockDb.getRemoteAgent.mockReturnValueOnce({
        id: 'a2',
        name: 'AcpAgent',
        protocol: 'acp',
        url: 'wss://acp',
        authType: 'none',
        createdAt: 0,
        updatedAt: 0,
      });

      const handler = providerMap.get('handshake')!;
      const result = await handler({ id: 'a2' });
      expect(result).toEqual({ status: 'ok' });
    });

    it('returns ok on successful hello handshake', async () => {
      const handler = providerMap.get('handshake')!;
      const resultPromise = handler({ id: 'a1' });

      // Trigger onHelloOk callback
      await new Promise((r) => setTimeout(r, 0));
      capturedConnCallbacks.onHelloOk!({});

      const result = await resultPromise;
      expect(result).toEqual({ status: 'ok' });
      expect(mockDb.updateRemoteAgent).toHaveBeenCalledWith('a1', expect.objectContaining({ status: 'connected' }));
    });

    it('returns pending_approval when pairing required', async () => {
      const handler = providerMap.get('handshake')!;
      const resultPromise = handler({ id: 'a1' });

      // Trigger onConnectError with pairing required
      await new Promise((r) => setTimeout(r, 0));
      const pairingError = Object.assign(new Error('pairing.required'), {
        details: { recommendedNextStep: 'wait_then_retry' },
      });
      capturedConnCallbacks.onConnectError!(pairingError);

      const result = await resultPromise;
      expect(result).toEqual({ status: 'pending_approval' });
      expect(mockDb.updateRemoteAgent).toHaveBeenCalledWith('a1', expect.objectContaining({ status: 'pending' }));
    });

    it('returns error on generic connect error', async () => {
      const handler = providerMap.get('handshake')!;
      const resultPromise = handler({ id: 'a1' });

      await new Promise((r) => setTimeout(r, 0));
      capturedConnCallbacks.onConnectError!(new Error('auth failed'));

      const result = await resultPromise;
      expect(result).toEqual({ status: 'error', error: 'auth failed' });
      expect(mockDb.updateRemoteAgent).toHaveBeenCalledWith('a1', expect.objectContaining({ status: 'error' }));
    });

    it('returns error on connection close', async () => {
      const handler = providerMap.get('handshake')!;
      const resultPromise = handler({ id: 'a1' });

      await new Promise((r) => setTimeout(r, 0));
      capturedConnCallbacks.onClose!(1006, 'abnormal');

      const result = await resultPromise;
      expect(result).toEqual({ status: 'error', error: 'Connection closed (1006): abnormal' });
    });

    it('returns error on timeout', async () => {
      vi.useFakeTimers();
      const handler = providerMap.get('handshake')!;
      const resultPromise = handler({ id: 'a1' });

      // Advance past the 15s handshake timeout
      await vi.advanceTimersByTimeAsync(16_000);

      const result = await resultPromise;
      expect(result).toEqual({ status: 'error', error: 'Handshake timed out (15s)' });
      vi.useRealTimers();
    });

    it('detects pairing required via regex fallback', async () => {
      const handler = providerMap.get('handshake')!;
      const resultPromise = handler({ id: 'a1' });

      await new Promise((r) => setTimeout(r, 0));
      // Error message matches regex but no details object
      capturedConnCallbacks.onConnectError!(new Error('Pairing.Required for this device'));

      const result = await resultPromise;
      expect(result).toEqual({ status: 'pending_approval' });
    });
  });
});
