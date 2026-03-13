import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('adapter/headless', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('registers headless bridge adapter and delegates emit/on to bridgeHub', async () => {
    const adapter = vi.fn();
    const emitToWebSocketBroadcasters = vi.fn();
    const setBridgeEmitter = vi.fn();

    vi.doMock('@office-ai/platform', () => ({
      bridge: {
        adapter,
      },
    }));

    vi.doMock('@/adapter/bridgeHub', () => ({
      emitToWebSocketBroadcasters,
      setBridgeEmitter,
    }));

    await import('@/adapter/headless');

    expect(adapter).toHaveBeenCalledTimes(1);

    const registeredAdapter = adapter.mock.calls[0][0] as {
      emit: (name: string, data: unknown) => void;
      on: (emitter: unknown) => void;
    };

    registeredAdapter.emit('runtime.event', { value: 1 });
    expect(emitToWebSocketBroadcasters).toHaveBeenCalledWith('runtime.event', { value: 1 });

    const emitter = { emit: vi.fn() };
    registeredAdapter.on(emitter);
    expect(setBridgeEmitter).toHaveBeenCalledWith(emitter);
  });
});
