/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type StartOptions = {
  onStart?: (botInfo: { username: string }) => void;
};

type MockControl = {
  startPromiseFactory: () => Promise<void>;
  stopPromiseFactory: () => Promise<void>;
  autoTriggerOnStart: boolean;
};

const mockControl: MockControl = {
  startPromiseFactory: () => Promise.resolve(),
  stopPromiseFactory: () => Promise.resolve(),
  autoTriggerOnStart: true,
};

let latestBotStopSpy: ReturnType<typeof vi.fn> | null = null;
let latestBotApi: Record<string, ReturnType<typeof vi.fn>> | null = null;

function createConfig() {
  const now = Date.now();
  return {
    id: 'telegram-1',
    type: 'telegram' as const,
    name: 'Telegram',
    enabled: true,
    credentials: { token: 'test-token' },
    status: 'created' as const,
    createdAt: now,
    updatedAt: now,
  };
}

async function loadPluginClass() {
  vi.resetModules();

  vi.doMock('grammy', () => {
    class MockGrammyError extends Error {
      description?: string;
      error_code?: number;
    }

    class MockHttpError extends Error {}

    class MockBot {
      public api = {
        getMe: vi.fn(async () => ({
          id: 123,
          username: 'mock_bot',
          first_name: 'Mock Bot',
        })),
        setMyCommands: vi.fn(async () => true),
        sendMessage: vi.fn(),
        editMessageText: vi.fn(),
      };

      public command = vi.fn();
      public on = vi.fn();
      public catch = vi.fn();

      public start = vi.fn((options: StartOptions) => {
        if (mockControl.autoTriggerOnStart) {
          options?.onStart?.({ username: 'mock_bot' });
        }
        return mockControl.startPromiseFactory();
      });

      public stop = vi.fn(() => mockControl.stopPromiseFactory());

      constructor(_token: string) {
        latestBotStopSpy = this.stop;
        latestBotApi = this.api;
      }
    }

    return {
      Bot: MockBot,
      GrammyError: MockGrammyError,
      HttpError: MockHttpError,
    };
  });

  const mod = await import('@/channels/plugins/telegram/TelegramPlugin');
  return mod.TelegramPlugin;
}

describe('TelegramPlugin polling lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    latestBotStopSpy = null;
    latestBotApi = null;
    mockControl.autoTriggerOnStart = true;

    mockControl.startPromiseFactory = () => Promise.resolve();
    mockControl.stopPromiseFactory = () => Promise.resolve();
  });

  it('在 stop 时应等待 pollingPromise 完成后再结束', async () => {
    let resolvePolling!: () => void;
    const pollingPromise = new Promise<void>((resolve) => {
      resolvePolling = resolve;
    });

    mockControl.startPromiseFactory = () => pollingPromise;

    const TelegramPlugin = await loadPluginClass();
    const plugin = new TelegramPlugin();
    await plugin.initialize(createConfig());
    await plugin.start();

    const stopPromise = plugin.stop();

    let isStopped = false;
    void stopPromise.then(() => {
      isStopped = true;
    });

    await Promise.resolve();
    expect(isStopped).toBe(false);
    expect(latestBotStopSpy).toHaveBeenCalledTimes(1);

    resolvePolling();

    await stopPromise;

    expect(plugin.status).toBe('stopped');
  });

  it('当 stop 卡住超时时应回收轮询状态，避免残留 active 标记', async () => {
    vi.useFakeTimers();

    mockControl.startPromiseFactory = () => new Promise<void>(() => {});
    mockControl.stopPromiseFactory = () => new Promise<void>(() => {});

    const TelegramPlugin = await loadPluginClass();
    const plugin = new TelegramPlugin();
    await plugin.initialize(createConfig());
    await plugin.start();

    const stopPromise = plugin.stop();

    await vi.advanceTimersByTimeAsync(5000);
    await stopPromise;

    expect(plugin.status).toBe('stopped');
    expect((plugin as any).isPollingActive).toBe(false);
    expect((plugin as any).pollingPromise).toBeNull();
  });

  it('启动时应向 Telegram 注册 slash commands', async () => {
    const TelegramPlugin = await loadPluginClass();
    const plugin = new TelegramPlugin();
    await plugin.initialize(createConfig());
    await plugin.start();

    expect(latestBotApi?.setMyCommands).toHaveBeenCalledTimes(1);
    expect(latestBotApi?.setMyCommands).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ command: 'tool' }), expect.objectContaining({ command: 'model' }), expect.objectContaining({ command: 'think' }), expect.objectContaining({ command: 'approvals' }), expect.objectContaining({ command: 'history' })]));
  });

  it('slash 命令无参数时应路由到设置子面板', async () => {
    const TelegramPlugin = await loadPluginClass();
    const plugin = new TelegramPlugin();
    const messageHandler = vi.fn(async () => undefined);
    plugin.onMessage(messageHandler);

    const handled = await (plugin as any).handleSlashCommand(
      {
        message: {
          message_id: 1,
          text: '/tool',
          date: Math.floor(Date.now() / 1000),
          chat: { id: 456 },
          from: { id: 123, first_name: 'Tester', is_bot: false },
        },
      },
      '/tool'
    );

    expect(handled).toBe(true);
    expect(messageHandler).toHaveBeenCalledTimes(1);
    expect(messageHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({ type: 'action', text: 'settings.show' }),
        action: expect.objectContaining({
          type: 'system',
          name: 'settings.show',
          params: { view: 'tool' },
        }),
      })
    );
  });

  it('slash 命令应支持 think xhigh 参数透传', async () => {
    const TelegramPlugin = await loadPluginClass();
    const plugin = new TelegramPlugin();
    const messageHandler = vi.fn(async () => undefined);
    plugin.onMessage(messageHandler);

    const handled = await (plugin as any).handleSlashCommand(
      {
        message: {
          message_id: 2,
          text: '/think xhigh',
          date: Math.floor(Date.now() / 1000),
          chat: { id: 456 },
          from: { id: 123, first_name: 'Tester', is_bot: false },
        },
      },
      '/think xhigh'
    );

    expect(handled).toBe(true);
    expect(messageHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({ type: 'action', text: 'think.set' }),
        action: expect.objectContaining({
          type: 'system',
          name: 'think.set',
          params: { level: 'xhigh' },
        }),
      })
    );
  });

  it('slash 命令应支持 approvals yolo 参数透传', async () => {
    const TelegramPlugin = await loadPluginClass();
    const plugin = new TelegramPlugin();
    const messageHandler = vi.fn(async () => undefined);
    plugin.onMessage(messageHandler);

    const handled = await (plugin as any).handleSlashCommand(
      {
        message: {
          message_id: 3,
          text: '/approvals yolo',
          date: Math.floor(Date.now() / 1000),
          chat: { id: 456 },
          from: { id: 123, first_name: 'Tester', is_bot: false },
        },
      },
      '/approvals yolo'
    );

    expect(handled).toBe(true);
    expect(messageHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({ type: 'action', text: 'approvals.set' }),
        action: expect.objectContaining({
          type: 'system',
          name: 'approvals.set',
          params: { mode: 'yolo' },
        }),
      })
    );
  });

  it('权限确认回调应携带 chatId 调用 confirmHandler', async () => {
    const TelegramPlugin = await loadPluginClass();
    const plugin = new TelegramPlugin();
    const confirmHandler = vi.fn(async () => undefined);
    plugin.onConfirm(confirmHandler);

    const editMessageReplyMarkup = vi.fn(async () => undefined);
    const answerCallbackQuery = vi.fn(async () => undefined);

    await (plugin as any).handleCallbackQuery({
      from: { id: 123, first_name: 'Tester', is_bot: false },
      callbackQuery: {
        id: 'callback-1',
        data: 'confirm:tool-call-1:allow_once',
        message: {
          message_id: 42,
          chat: { id: 456 },
        },
      },
      answerCallbackQuery,
      editMessageReplyMarkup,
    });

    await Promise.resolve();

    expect(confirmHandler).toHaveBeenCalledWith('123', 'telegram', 'tool-call-1', 'allow_once', '456');
    expect(editMessageReplyMarkup).toHaveBeenCalledWith({ reply_markup: undefined });
  });
});
