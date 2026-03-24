// tests/unit/standaloneAdapter.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @office-ai/platform bridge before importing standalone
vi.mock('@office-ai/platform', () => ({
  bridge: {
    adapter: vi.fn(({ emit, on }) => {
      // Simulate bridge calling on() with a fake emitter ref
      const fakeEmitter = {
        emit: vi.fn((name: string, data: unknown) => ({ name, data })),
      };
      on(fakeEmitter);
    }),
  },
}));

// Mock registry
const mockBroadcastToAll = vi.fn();
const mockSetBridgeEmitter = vi.fn();
vi.mock('@/common/adapter/registry', () => ({
  broadcastToAll: mockBroadcastToAll,
  setBridgeEmitter: mockSetBridgeEmitter,
}));

describe('standalone adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('calls setBridgeEmitter on load', async () => {
    await import('@/common/adapter/standalone');
    expect(mockSetBridgeEmitter).toHaveBeenCalledOnce();
  });

  it('dispatchMessage routes through EventEmitter to bridge emitter', async () => {
    const { dispatchMessage } = await import('@/common/adapter/standalone');
    // setBridgeEmitter was called with fakeEmitter — get it
    const fakeEmitter = mockSetBridgeEmitter.mock.calls[0][0] as { emit: ReturnType<typeof vi.fn> };
    dispatchMessage('conv.message', { text: 'hello' });
    // Allow microtask queue to flush
    await new Promise((r) => setTimeout(r, 0));
    expect(fakeEmitter.emit).toHaveBeenCalledWith('conv.message', { text: 'hello' });
  });
});
