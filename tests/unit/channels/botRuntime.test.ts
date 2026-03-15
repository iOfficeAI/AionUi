import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('channels/BotRuntime', () => {
  const getMessageHandler = vi.fn(() => 'message-handler');
  const getConfirmHandler = vi.fn(() => 'confirm-handler');

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    vi.doMock('../../../src/channels/gateway/ActionExecutor', () => ({
      ActionExecutor: class {
        getMessageHandler = getMessageHandler;
        getConfirmHandler = getConfirmHandler;
      },
    }));
  });

  it('wires plugin handlers and delegates start/stop to the scoped plugin instance', async () => {
    const plugin = {
      pluginId: 'telegram_bot_1',
      type: 'telegram',
      initialize: vi.fn(async () => undefined),
      onConfirm: vi.fn(),
      onMessage: vi.fn(),
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
    };

    const { BotRuntime } = await import('../../../src/channels/core/BotRuntime');
    const runtime = new BotRuntime(plugin as any, {} as any, {} as any);

    expect(plugin.onMessage).toHaveBeenCalledWith('message-handler');
    expect(plugin.onConfirm).toHaveBeenCalledWith('confirm-handler');

    const config = {
      id: 'telegram_bot_1',
      type: 'telegram',
      name: 'Telegram Bot 1',
      enabled: true,
      status: 'created',
      createdAt: 1,
      updatedAt: 1,
      credentials: { token: 'token-1' },
    };

    await runtime.start(config as any);
    await runtime.stop();

    expect(plugin.initialize).toHaveBeenCalledWith(config);
    expect(plugin.start).toHaveBeenCalledTimes(1);
    expect(plugin.stop).toHaveBeenCalledTimes(1);
    expect(runtime.pluginId).toBe('telegram_bot_1');
    expect(runtime.type).toBe('telegram');
  });
});
