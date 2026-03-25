import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IChannelPluginConfig, IUnifiedOutgoingMessage } from '@process/channels/types';
import type { MonitorOptions } from '@process/channels/plugins/weixin/WeixinMonitor';
import os from 'os';
import path from 'path';
import fs from 'fs';

let mockStartFn = vi.fn();

const TEST_DATA_DIR = path.join(os.tmpdir(), 'aionui-test-weixin');

async function loadPluginClass() {
  vi.resetModules();
  vi.doMock('@process/channels/plugins/weixin/WeixinMonitor', () => ({
    startMonitor: (...args: unknown[]) => mockStartFn(...args),
  }));
  vi.doMock('@/common/platform', () => ({
    getPlatformServices: () => ({
      paths: {
        getDataDir: () => TEST_DATA_DIR,
      },
    }),
  }));
  const mod = await import('@process/channels/plugins/weixin/WeixinPlugin');
  return mod.WeixinPlugin;
}

function createConfig(overrides?: Partial<IChannelPluginConfig['credentials']>): IChannelPluginConfig {
  const now = Date.now();
  return {
    id: 'weixin-1',
    type: 'weixin' as const,
    name: 'WeChat',
    enabled: true,
    credentials: {
      accountId: 'user_test123',
      botToken: 'tok_abc',
      baseUrl: 'https://ilinkai.weixin.qq.com',
      ...overrides,
    },
    status: 'created' as const,
    createdAt: now,
    updatedAt: now,
  };
}

describe('WeixinPlugin — initialization', () => {
  it('enters error state when credentials are missing', async () => {
    const WeixinPlugin = await loadPluginClass();
    const plugin = new WeixinPlugin();
    await expect(plugin.initialize(createConfig({ accountId: '', botToken: '' }))).rejects.toThrow();
    expect(plugin.status).toBe('error');
  });

  it('enters ready state with valid credentials', async () => {
    const WeixinPlugin = await loadPluginClass();
    const plugin = new WeixinPlugin();
    await plugin.initialize(createConfig());
    expect(plugin.status).toBe('ready');
  });
});

describe('WeixinPlugin — Promise bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStartFn = vi.fn(); // void return — no promise needed
  });

  it('emits unified message and resolves via editMessage with replyMarkup', async () => {
    const WeixinPlugin = await loadPluginClass();
    const plugin = new WeixinPlugin();
    await plugin.initialize(createConfig());

    const received: unknown[] = [];
    plugin.onMessage(async (msg) => {
      received.push(msg);
      const msgId = await plugin.sendMessage(msg.chatId, { type: 'text', text: 'partial' });
      await plugin.editMessage(msg.chatId, msgId, {
        type: 'text',
        text: 'Final answer',
        replyMarkup: { done: true },
      });
    });

    await plugin.start();

    const { agent } = mockStartFn.mock.calls[0][0] as MonitorOptions;
    const chatPromise = agent.chat({ conversationId: 'user_abc', text: 'Hello' });

    await new Promise((r) => setTimeout(r, 20));

    const response = await chatPromise;
    expect(response.text).toBe('Final answer');
    expect(received).toHaveLength(1);
  });

  it('accumulates text across multiple editMessage calls', async () => {
    const WeixinPlugin = await loadPluginClass();
    const plugin = new WeixinPlugin();
    await plugin.initialize(createConfig());

    plugin.onMessage(async (msg) => {
      const msgId = await plugin.sendMessage(msg.chatId, { type: 'text' });
      await plugin.editMessage(msg.chatId, msgId, { type: 'text', text: 'chunk 1' });
      await plugin.editMessage(msg.chatId, msgId, { type: 'text', text: 'chunk 1 chunk 2' });
      await plugin.editMessage(msg.chatId, msgId, {
        type: 'text',
        text: 'final complete text',
        replyMarkup: {},
      });
    });

    await plugin.start();
    const { agent } = mockStartFn.mock.calls[0][0] as MonitorOptions;
    const response = await agent.chat({ conversationId: 'user_abc', text: 'hi' });
    expect(response.text).toBe('final complete text');
  });

  it('rejects superseded Promise when second chat arrives before first resolves', async () => {
    const WeixinPlugin = await loadPluginClass();
    const plugin = new WeixinPlugin();
    await plugin.initialize(createConfig());
    plugin.onMessage(async () => {
      await new Promise(() => {});
    });
    await plugin.start();

    const { agent } = mockStartFn.mock.calls[0][0] as MonitorOptions;
    const first = agent.chat({ conversationId: 'user_abc', text: 'first' });
    await new Promise((r) => setTimeout(r, 0));

    const second = agent.chat({ conversationId: 'user_abc', text: 'second' });
    await expect(first).rejects.toThrow('superseded');

    const msgId = await plugin.sendMessage('user_abc', { type: 'text' });
    await plugin.editMessage('user_abc', msgId, { type: 'text', text: 'ok', replyMarkup: {} });
    await expect(second).resolves.toBeDefined();
  });

  it('rejects all pending on stop', async () => {
    const WeixinPlugin = await loadPluginClass();
    const plugin = new WeixinPlugin();
    await plugin.initialize(createConfig());
    plugin.onMessage(async () => {
      await new Promise(() => {});
    });
    await plugin.start();

    const { agent } = mockStartFn.mock.calls[0][0] as MonitorOptions;
    const chatPromise = agent.chat({ conversationId: 'user_abc', text: 'hi' });
    await new Promise((r) => setTimeout(r, 0));

    await plugin.stop();
    await expect(chatPromise).rejects.toThrow('Plugin stopped');
  });

  it('times out after 5 minutes', async () => {
    vi.useFakeTimers();
    const WeixinPlugin = await loadPluginClass();
    const plugin = new WeixinPlugin();
    await plugin.initialize(createConfig());
    plugin.onMessage(async () => {
      await new Promise(() => {});
    });
    await plugin.start();

    const { agent } = mockStartFn.mock.calls[0][0] as MonitorOptions;
    const chatPromise = agent.chat({ conversationId: 'user_abc', text: 'hi' });
    await Promise.resolve();

    const assertion = expect(chatPromise).rejects.toThrow('Response timeout');
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 100);
    await assertion;
    vi.useRealTimers();
  });

  it('rejects immediately when _stopping is true', async () => {
    const WeixinPlugin = await loadPluginClass();
    const plugin = new WeixinPlugin();
    await plugin.initialize(createConfig());
    plugin.onMessage(async () => {});
    await plugin.start();
    await plugin.stop();

    const { agent } = mockStartFn.mock.calls[0][0] as MonitorOptions;
    await expect(agent.chat({ conversationId: 'u', text: 'hi' })).rejects.toThrow('Plugin stopped');
  });
});

describe('WeixinPlugin — testConnection', () => {
  it('returns false when buf file does not exist', async () => {
    const WeixinPlugin = await loadPluginClass();
    const result = await WeixinPlugin.testConnection('nonexistent_account_id_xyz');
    expect(result.success).toBe(false);
  });

  it('returns true when buf file exists at <dataDir>/weixin-monitor/<accountId>.buf', async () => {
    const WeixinPlugin = await loadPluginClass();
    const monitorDir = path.join(TEST_DATA_DIR, 'weixin-monitor');
    fs.mkdirSync(monitorDir, { recursive: true });
    const bufFile = path.join(monitorDir, 'test_acc_valid.buf');
    fs.writeFileSync(bufFile, 'some-buf-value');

    const result = await WeixinPlugin.testConnection('test_acc_valid');
    expect(result.success).toBe(true);

    fs.unlinkSync(bufFile);
  });
});
