import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoteRuntimeHub } from '@/webserver/remote/RemoteRuntimeHub';

describe('webserver/remote/RemoteRuntimeHub', () => {
  const originalPublicUrl = process.env.AIONUI_REMOTE_PUBLIC_URL;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalPublicUrl === undefined) {
      delete process.env.AIONUI_REMOTE_PUBLIC_URL;
    } else {
      process.env.AIONUI_REMOTE_PUBLIC_URL = originalPublicUrl;
    }
  });

  it('emits device/session events and detaches sessions on device unregister', () => {
    const hub = new RemoteRuntimeHub();
    const devicesUpdated = vi.fn();
    const sessionsUpdated = vi.fn();

    hub.on('remote.devices.updated', devicesUpdated);
    hub.on('remote.sessions.updated', sessionsUpdated);

    hub.registerDevice({
      deviceId: 'dev-1',
      userId: 'u1',
      username: 'alice',
      userAgent: 'Mozilla/5.0',
    });
    const session = hub.openSession('u1', 'My session', { x: 1 }, 's-1');
    hub.attachSession('u1', session.id, 'dev-1');

    const detached = hub.unregisterDevice('u1', 'dev-1');
    expect(detached?.connected).toBe(false);

    const sessions = hub.listSessions('u1');
    expect(sessions[0].attachedDeviceIds).toEqual([]);
    expect(sessions[0].status).toBe('idle');

    expect(devicesUpdated).toHaveBeenCalled();
    expect(sessionsUpdated).toHaveBeenCalled();
  });

  it('creates and resolves approvals with pending snapshot updates', () => {
    const hub = new RemoteRuntimeHub();

    hub.registerDevice({
      deviceId: 'dev-2',
      userId: 'u2',
      username: 'bob',
      userAgent: 'Electron/37',
    });

    const created = hub.createApproval({
      userId: 'u2',
      title: 'Need permission',
      summary: 'Please approve',
    });

    expect(hub.listPendingApprovals('u2')).toHaveLength(1);

    const resolved = hub.resolveApproval('u2', created.id, 'approved', 'dev-2', 'bob', 'go');
    expect(resolved.status).toBe('approved');

    const snapshot = hub.getSnapshot('u2');
    expect(snapshot.pendingApprovals).toHaveLength(0);
  });

  it('supports tunnel lifecycle and emits tunnel updates', async () => {
    const hub = new RemoteRuntimeHub();
    hub.configure(3000);

    const tunnelUpdated = vi.fn();
    hub.on('remote.tunnel.updated', tunnelUpdated);

    delete process.env.AIONUI_REMOTE_PUBLIC_URL;
    const started = await hub.startTunnel('custom');
    expect(started.enabled).toBe(true);
    expect(started.provider).toBe('custom');

    process.env.AIONUI_REMOTE_PUBLIC_URL = 'https://my-remote.example.com';
    const restarted = await hub.startTunnel('custom');
    expect(restarted.publicUrl).toBe('https://my-remote.example.com');

    const stopped = await hub.stopTunnel();
    expect(stopped.provider).toBe('none');
    expect(stopped.enabled).toBe(false);
    expect(tunnelUpdated).toHaveBeenCalled();
  });
});
