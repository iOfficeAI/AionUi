import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IChannelPluginConfig } from '@process/channels/types';
import type { MonitorOptions } from '@process/channels/plugins/weixin/WeixinMonitor';
import os from 'os';
import path from 'path';

let mockStartFn = vi.fn();
const TEST_DATA_DIR = path.join(os.tmpdir(), 'aionui-test-weixin-actions');

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

function createConfig(): IChannelPluginConfig {
  const now = Date.now();
  return {
    id: 'weixin-test',
    type: 'weixin' as const,
    name: 'WeChat',
    enabled: true,
    credentials: {
      accountId: 'test_user',
      botToken: 'test_token',
      baseUrl: 'https://example.com',
    },
    status: 'created' as const,
    createdAt: now,
    updatedAt: now,
  };
}

describe('WeixinPlugin — Action Mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStartFn = vi.fn();
  });

  it('maps "session.new" text to session.new action', async () => {
    const WeixinPlugin = await loadPluginClass();
    const plugin = new WeixinPlugin();
    await plugin.initialize(createConfig());

    const received: any[] = [];
    plugin.onMessage(async (msg) => {
      received.push(msg);
      // Simulate successful action execution response
      const msgId = await plugin.sendMessage(msg.chatId, { type: 'text', text: 'New session started' });
      await plugin.editMessage(msg.chatId, msgId, { type: 'text', text: 'Done', replyMarkup: {} });
    });

    await plugin.start();
    const { agent } = mockStartFn.mock.calls[0][0] as MonitorOptions;

    // Trigger chat with session.new
    await agent.chat({ conversationId: 'user123', text: 'session.new' });

    expect(received).toHaveLength(1);
    expect(received[0].content.type).toBe('action');
    expect(received[0].content.text).toBe('session.new');
    expect(received[0].action).toEqual({
      type: 'system',
      name: 'session.new',
    });
  });

  it('maps "session.status" text to session.status action', async () => {
    const WeixinPlugin = await loadPluginClass();
    const plugin = new WeixinPlugin();
    await plugin.initialize(createConfig());

    const received: any[] = [];
    plugin.onMessage(async (msg) => {
      received.push(msg);
      const msgId = await plugin.sendMessage(msg.chatId, { type: 'text', text: 'Status info' });
      await plugin.editMessage(msg.chatId, msgId, { type: 'text', text: 'Status: OK', replyMarkup: {} });
    });

    await plugin.start();
    const { agent } = mockStartFn.mock.calls[0][0] as MonitorOptions;

    await agent.chat({ conversationId: 'user123', text: 'session.status' });

    expect(received).toHaveLength(1);
    expect(received[0].content.type).toBe('action');
    expect(received[0].action.name).toBe('session.status');
  });

  it('treats normal text as plain text', async () => {
    const WeixinPlugin = await loadPluginClass();
    const plugin = new WeixinPlugin();
    await plugin.initialize(createConfig());

    const received: any[] = [];
    plugin.onMessage(async (msg) => {
      received.push(msg);
      const msgId = await plugin.sendMessage(msg.chatId, { type: 'text', text: 'AI Response' });
      await plugin.editMessage(msg.chatId, msgId, { type: 'text', text: 'Hello human', replyMarkup: {} });
    });

    await plugin.start();
    const { agent } = mockStartFn.mock.calls[0][0] as MonitorOptions;

    await agent.chat({ conversationId: 'user123', text: 'Hello AI' });

    expect(received).toHaveLength(1);
    expect(received[0].content.type).toBe('text');
    expect(received[0].content.text).toBe('Hello AI');
    expect(received[0].action).toBeUndefined();
  });

  it('handles empty text message correctly', async () => {
    const WeixinPlugin = await loadPluginClass();
    const plugin = new WeixinPlugin();
    await plugin.initialize(createConfig());

    const received: any[] = [];
    plugin.onMessage(async (msg) => {
      received.push(msg);
      await plugin.sendMessage(msg.chatId, { type: 'text', text: 'Empty response' });
    });

    await plugin.start();
    const { agent } = mockStartFn.mock.calls[0][0] as MonitorOptions;

    // Trigger chat with empty text
    await agent.chat({ conversationId: 'user123', text: '' });

    expect(received).toHaveLength(1);
    expect(received[0].content.text).toBe('');
    expect(received[0].action).toBeUndefined();
  });

  it('ignores non-text message content types', async () => {
    const WeixinPlugin = await loadPluginClass();
    const plugin = new WeixinPlugin();
    await plugin.initialize(createConfig());

    const received: any[] = [];
    plugin.onMessage(async (msg) => {
      received.push(msg);
      // Resolve the pending response to avoid timeout
      const msgId = await plugin.sendMessage(msg.chatId, { type: 'text', text: 'ok' });
      await plugin.editMessage(msg.chatId, msgId, { type: 'text', text: 'done', replyMarkup: {} });
    });

    await plugin.start();

    // We want to test the branch where unified.content.type !== 'text'
    // To do this, we need to mock the toUnifiedIncomingMessage internal call or
    // simulate the behavior. Since it's imported, we can mock the module.

    vi.doMock('@process/channels/plugins/weixin/WeixinAdapter', () => ({
      toUnifiedIncomingMessage: () => ({
        id: '123',
        platform: 'weixin',
        chatId: 'user123',
        user: { id: 'user123', displayName: 'User' },
        content: { type: 'image', text: 'session.new' }, // Non-text type
        timestamp: Date.now(),
      }),
      stripHtml: (s: string) => s,
    }));

    // Reload plugin to pick up the new mock
    const WeixinPluginWithMock = await loadPluginClass();
    const pluginWithMock = new WeixinPluginWithMock();
    await pluginWithMock.initialize(createConfig());
    pluginWithMock.onMessage(async (msg) => {
      received.push(msg);
    });
    await pluginWithMock.start();

    const { agent } = mockStartFn.mock.calls[1][0] as MonitorOptions;
    await agent.chat({ conversationId: 'user123', text: 'session.new' });

    expect(received).toHaveLength(1);
    expect(received[0].content.type).toBe('image');
    expect(received[0].action).toBeUndefined(); // Should NOT be mapped
  });
});
