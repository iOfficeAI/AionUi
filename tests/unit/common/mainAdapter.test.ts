import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockIpcMainHandle = vi.fn();
const mockBroadcastToAll = vi.fn();
const mockSetBridgeEmitter = vi.fn();
const mockGetBridgeEmitter = vi.fn();

vi.mock('electron', () => ({
  ipcMain: {
    handle: mockIpcMainHandle,
  },
}));

vi.mock('@office-ai/platform', () => ({
  bridge: {
    adapter: vi.fn(({ on }) => {
      const fakeEmitter = {
        emit: vi.fn((name: string, data: unknown) => ({ name, data })),
      };
      on(fakeEmitter);
    }),
  },
}));

vi.mock('@/common/adapter/registry', () => ({
  broadcastToAll: mockBroadcastToAll,
  getBridgeEmitter: mockGetBridgeEmitter,
  registerWebSocketBroadcaster: vi.fn(),
  setBridgeEmitter: mockSetBridgeEmitter,
}));

describe('main adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockGetBridgeEmitter.mockImplementation(() => mockSetBridgeEmitter.mock.calls[0]?.[0] ?? null);
  });

  it('bridge emit also reaches same-process listeners in main mode', async () => {
    const { bridge } = await import('@office-ai/platform');
    await import('@/common/adapter/main');
    const fakeEmitter = mockSetBridgeEmitter.mock.calls[0][0] as { emit: ReturnType<typeof vi.fn> };
    const emit = (bridge.adapter as ReturnType<typeof vi.fn>).mock.calls[0][0].emit as (
      name: string,
      data: unknown
    ) => void;

    emit('conversation.turn.completed', {
      sessionId: 'session-1',
      state: 'ai_waiting_input',
    });

    expect(fakeEmitter.emit).toHaveBeenCalledWith('conversation.turn.completed', {
      sessionId: 'session-1',
      state: 'ai_waiting_input',
    });
    expect(mockBroadcastToAll).toHaveBeenCalledWith('conversation.turn.completed', {
      sessionId: 'session-1',
      state: 'ai_waiting_input',
    });
  });
});
