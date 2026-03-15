import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('channels/BotRegistry', () => {
  const createPluginInstance = vi.fn();
  const emitStatusChanged = vi.fn();
  const runtimeInstances: Array<{ plugin: any; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; getPlugin: () => any }> = [];
  const db = {
    getChannelPlugin: vi.fn(),
    getChannelPlugins: vi.fn(),
    updateChannelPluginStatus: vi.fn(),
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    runtimeInstances.length = 0;

    db.getChannelPlugins.mockReturnValue({ success: true, data: [] });
    db.getChannelPlugin.mockImplementation((pluginId: string) => ({
      success: true,
      data: {
        id: pluginId,
        type: 'telegram',
        name: pluginId,
        enabled: true,
        status: 'running',
        createdAt: 1,
        updatedAt: 1,
        credentials: { token: 'token' },
      },
    }));

    vi.doMock('../../../src/process/database', () => ({
      getDatabase: () => db,
    }));

    vi.doMock('../../../src/common/ipcBridge', () => ({
      channel: {
        pluginStatusChanged: {
          emit: emitStatusChanged,
        },
      },
    }));

    vi.doMock('../../../src/channels/gateway/PluginManager', () => ({
      createPluginInstance,
    }));

    vi.doMock('../../../src/channels/core/BotRuntime', () => ({
      BotRuntime: class {
        plugin: any;
        start: ReturnType<typeof vi.fn>;
        stop: ReturnType<typeof vi.fn>;

        constructor(plugin: any) {
          this.plugin = plugin;
          this.start = vi.fn(async () => undefined);
          this.stop = vi.fn(async () => undefined);
          runtimeInstances.push(this);
        }

        getPlugin() {
          return this.plugin;
        }
      },
    }));
  });

  it('starts and stops runtimes independently by plugin id', async () => {
    const pluginA = {
      pluginId: 'telegram_bot_a',
      type: 'telegram',
      status: 'running',
      error: null,
      getActiveUserCount: () => 0,
      getBotInfo: () => ({ username: 'bot_a' }),
      isConnected: () => true,
    };
    const pluginB = {
      pluginId: 'telegram_bot_b',
      type: 'telegram',
      status: 'running',
      error: null,
      getActiveUserCount: () => 0,
      getBotInfo: () => ({ username: 'bot_b' }),
      isConnected: () => true,
    };

    createPluginInstance.mockReturnValueOnce(pluginA).mockReturnValueOnce(pluginB);

    const { BotRegistry } = await import('../../../src/channels/core/BotRegistry');
    const registry = new BotRegistry({} as any, {} as any);

    const configA = {
      id: 'telegram_bot_a',
      type: 'telegram',
      name: 'Bot A',
      enabled: true,
      status: 'created',
      createdAt: 1,
      updatedAt: 1,
      credentials: { token: 'token-a' },
    };
    const configB = {
      id: 'telegram_bot_b',
      type: 'telegram',
      name: 'Bot B',
      enabled: true,
      status: 'created',
      createdAt: 1,
      updatedAt: 1,
      credentials: { token: 'token-b' },
    };

    await registry.startBot(configA as any);
    await registry.startBot(configB as any);

    expect(registry.getRuntime('telegram_bot_a')).toBe(runtimeInstances[0] as any);
    expect(registry.getRuntime('telegram_bot_b')).toBe(runtimeInstances[1] as any);

    await registry.stopBot('telegram_bot_a');

    expect(runtimeInstances[0]?.stop).toHaveBeenCalledTimes(1);
    expect(runtimeInstances[1]?.stop).not.toHaveBeenCalled();
    expect(registry.getRuntime('telegram_bot_a')).toBeUndefined();
    expect(registry.getRuntime('telegram_bot_b')).toBe(runtimeInstances[1] as any);
  });
});
