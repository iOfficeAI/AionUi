import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeviceRegistry } from '@/webserver/remote/DeviceRegistry';

describe('webserver/remote/DeviceRegistry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates device with inferred client type and truncated label', () => {
    const registry = new DeviceRegistry();
    const longUa = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) '.repeat(3);

    const device = registry.upsertConnected({
      id: 'dev-1',
      userId: 'u1',
      username: 'alice',
      userAgent: longUa,
      ip: '127.0.0.1',
      capabilities: ['ws'],
    });

    expect(device.clientType).toBe('mobile');
    expect(device.label.length).toBeLessThanOrEqual(80);
    expect(device.label.endsWith('...')).toBe(true);
    expect(device.connectionCount).toBe(1);
    expect(device.connected).toBe(true);
  });

  it('increments connection count on reconnect and marks offline after final disconnect', () => {
    const registry = new DeviceRegistry();

    registry.upsertConnected({
      id: 'dev-2',
      userId: 'u1',
      username: 'alice',
      userAgent: 'Mozilla/5.0',
    });

    const reconnect = registry.upsertConnected({
      id: 'dev-2',
      userId: 'u1',
      username: 'alice',
      userAgent: 'Mozilla/5.0',
    });

    expect(reconnect.connectionCount).toBe(2);
    expect(reconnect.connected).toBe(true);

    const firstDisconnect = registry.disconnect('dev-2');
    expect(firstDisconnect?.connectionCount).toBe(1);
    expect(firstDisconnect?.connected).toBe(true);

    const secondDisconnect = registry.disconnect('dev-2');
    expect(secondDisconnect?.connectionCount).toBe(0);
    expect(secondDisconnect?.connected).toBe(false);
  });

  it('marks heartbeat and filters offline devices when requested', () => {
    const registry = new DeviceRegistry();

    registry.upsertConnected({
      id: 'dev-online',
      userId: 'u1',
      username: 'alice',
      userAgent: 'Mozilla/5.0',
    });

    registry.upsertConnected({
      id: 'dev-offline',
      userId: 'u1',
      username: 'alice',
      userAgent: 'Electron/37',
    });
    registry.disconnect('dev-offline');

    vi.setSystemTime(Date.now() + 1_000);
    const heartbeat = registry.markHeartbeat('dev-online');

    expect(heartbeat).not.toBeNull();
    expect(heartbeat?.lastSeenAt).toBe(Date.now());

    const all = registry.listByUser('u1', true);
    const onlineOnly = registry.listByUser('u1', false);

    expect(all).toHaveLength(2);
    expect(onlineOnly).toHaveLength(1);
    expect(onlineOnly[0].id).toBe('dev-online');
    expect(registry.markHeartbeat('not-exists')).toBeNull();
  });
});
