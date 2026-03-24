import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('registry', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('registerWebSocketBroadcaster adds and removes broadcasters', async () => {
    const { registerWebSocketBroadcaster, broadcastToAll } = await import('@/common/adapter/registry');
    const received: Array<{ name: string; data: unknown }> = [];
    const unregister = registerWebSocketBroadcaster((name, data) => received.push({ name, data }));
    broadcastToAll('test.event', { msg: 'hello' });
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ name: 'test.event', data: { msg: 'hello' } });
    unregister();
    broadcastToAll('test.event', { msg: 'world' });
    expect(received).toHaveLength(1); // no new calls after unregister
  });

  it('getBridgeEmitter returns null initially', async () => {
    const { getBridgeEmitter } = await import('@/common/adapter/registry');
    expect(getBridgeEmitter()).toBeNull();
  });

  it('setBridgeEmitter + getBridgeEmitter round-trip', async () => {
    const { setBridgeEmitter, getBridgeEmitter } = await import('@/common/adapter/registry');
    const fakeEmitter = { emit: (_name: string, _data: unknown) => undefined };
    setBridgeEmitter(fakeEmitter);
    expect(getBridgeEmitter()).toBe(fakeEmitter);
  });
});
