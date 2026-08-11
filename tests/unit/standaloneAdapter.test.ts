// tests/unit/standaloneAdapter.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @office-ai/platform bridge before importing standalone
vi.mock('@office-ai/platform', () => ({
  bridge: {
    adapter: vi.fn(({ on }) => {
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
const mockGetBridgeEmitter = vi.fn();
vi.mock('@/common/adapter/registry', () => ({
  broadcastToAll: mockBroadcastToAll,
  getBridgeEmitter: mockGetBridgeEmitter,
  setBridgeEmitter: mockSetBridgeEmitter,
}));

describe('standalone adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockGetBridgeEmitter.mockImplementation(() => mockSetBridgeEmitter.mock.calls[0]?.[0] ?? null);
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

  it('bridge emit also reaches same-process listeners in standalone mode', async () => {
    const { bridge } = await import('@office-ai/platform');
    await import('@/common/adapter/standalone');
    const fakeEmitter = mockSetBridgeEmitter.mock.calls[0][0] as { emit: ReturnType<typeof vi.fn> };
    const emit = (bridge.adapter as ReturnType<typeof vi.fn>).mock.calls[0][0].emit as (
      name: string,
      data: unknown
    ) => void;

    emit('chat.response.stream', {
      conversation_id: 'session-1',
      type: 'content',
    });

    expect(fakeEmitter.emit).toHaveBeenCalledWith('chat.response.stream', {
      conversation_id: 'session-1',
      type: 'content',
    });
    expect(mockBroadcastToAll).toHaveBeenCalledWith('chat.response.stream', {
      conversation_id: 'session-1',
      type: 'content',
    });
  });
});
