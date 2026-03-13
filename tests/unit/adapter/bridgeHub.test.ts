import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('adapter/bridgeHub', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('registers broadcaster and forwards bridge events', async () => {
    const { registerWebSocketBroadcaster, emitToWebSocketBroadcasters } = await import('@/adapter/bridgeHub');

    const broadcast = vi.fn();
    registerWebSocketBroadcaster(broadcast);

    const payload = { id: 'evt-1' };
    emitToWebSocketBroadcasters('channel.message', payload);

    expect(broadcast).toHaveBeenCalledTimes(1);
    expect(broadcast).toHaveBeenCalledWith('channel.message', payload);
  });

  it('unregisters broadcaster correctly', async () => {
    const { registerWebSocketBroadcaster, emitToWebSocketBroadcasters } = await import('@/adapter/bridgeHub');

    const broadcast = vi.fn();
    const unregister = registerWebSocketBroadcaster(broadcast);
    unregister();

    emitToWebSocketBroadcasters('channel.message', { removed: true });

    expect(broadcast).not.toHaveBeenCalled();
  });

  it('continues broadcasting when one broadcaster throws', async () => {
    const { registerWebSocketBroadcaster, emitToWebSocketBroadcasters } = await import('@/adapter/bridgeHub');

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken = vi.fn(() => {
      throw new Error('broadcast failed');
    });
    const healthy = vi.fn();

    registerWebSocketBroadcaster(broken);
    registerWebSocketBroadcaster(healthy);

    emitToWebSocketBroadcasters('channel.message', { ok: true });

    expect(broken).toHaveBeenCalledTimes(1);
    expect(healthy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('stores and returns bridge emitter', async () => {
    const { setBridgeEmitter, getBridgeEmitter } = await import('@/adapter/bridgeHub');

    const emitter = { emit: vi.fn() };

    setBridgeEmitter(emitter);
    expect(getBridgeEmitter()).toBe(emitter);

    setBridgeEmitter(null);
    expect(getBridgeEmitter()).toBeNull();
  });
});
