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
      }
    }

    return {
      Bot: MockBot,
      GrammyError: MockGrammyError,
      HttpError: MockHttpError,
    };
  });

  const mod = await import('@process/channels/plugins/telegram/TelegramPlugin');
  return mod.TelegramPlugin;
}

describe('TelegramPlugin polling lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    latestBotStopSpy = null;
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
});
