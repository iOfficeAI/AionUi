import { describe, expect, it } from 'vitest';
import { SessionRegistry } from '@/webserver/remote/SessionRegistry';

describe('webserver/remote/SessionRegistry', () => {
  it('opens, updates and enforces ownership for sessions', () => {
    const registry = new SessionRegistry();

    const created = registry.openSession({
      userId: 'u1',
      sessionId: 's-1',
      title: 'Initial',
      metadata: { a: 1 },
    });

    expect(created.id).toBe('s-1');
    expect(created.title).toBe('Initial');

    const updated = registry.openSession({
      userId: 'u1',
      sessionId: 's-1',
      title: 'Renamed',
      metadata: { b: 2 },
    });

    expect(updated.title).toBe('Renamed');
    expect(updated.metadata).toEqual({ b: 2 });

    expect(() =>
      registry.openSession({
        userId: 'u2',
        sessionId: 's-1',
      })
    ).toThrow('Session access denied');
  });

  it('attaches and detaches devices with proper status transitions', () => {
    const registry = new SessionRegistry();
    registry.openSession({ userId: 'u1', sessionId: 's-2' });

    const attached = registry.attachDevice('u1', 's-2', 'dev-1');
    expect(attached.attachedDeviceIds).toEqual(['dev-1']);
    expect(attached.status).toBe('active');

    const attachedAgain = registry.attachDevice('u1', 's-2', 'dev-1');
    expect(attachedAgain.attachedDeviceIds).toEqual(['dev-1']);

    const detached = registry.detachDevice('u1', 's-2', 'dev-1');
    expect(detached.attachedDeviceIds).toEqual([]);
    expect(detached.status).toBe('idle');
  });

  it('detaches device from all sessions and closes session correctly', () => {
    const registry = new SessionRegistry();

    registry.openSession({ userId: 'u1', sessionId: 's-3' });
    registry.openSession({ userId: 'u1', sessionId: 's-4' });
    registry.openSession({ userId: 'u2', sessionId: 's-5' });

    registry.attachDevice('u1', 's-3', 'dev-x');
    registry.attachDevice('u1', 's-4', 'dev-x');
    registry.attachDevice('u2', 's-5', 'dev-x');

    const affected = registry.detachDeviceFromAll('u1', 'dev-x');
    expect(affected).toHaveLength(2);
    expect(affected.every((item) => item.status === 'idle')).toBe(true);

    const closed = registry.closeSession('u1', 's-3');
    expect(closed.status).toBe('closed');
    expect(closed.attachedDeviceIds).toEqual([]);

    expect(registry.getByUserAndId('u2', 's-3')).toBeNull();
    expect(() => registry.attachDevice('u2', 's-3', 'dev-z')).toThrow('Session access denied');
  });
});
