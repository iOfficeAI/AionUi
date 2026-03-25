/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { startMonitor } from '@process/channels/plugins/weixin/WeixinMonitor';
import type { MonitorOptions } from '@process/channels/plugins/weixin/WeixinMonitor';

const TEST_DIR = path.join(os.tmpdir(), `aionui-weixin-monitor-${process.pid}`);

function makeOpts(overrides: Partial<MonitorOptions> = {}): MonitorOptions {
  const controller = new AbortController();
  return {
    baseUrl: 'https://test.example.com',
    token: 'tok_test',
    accountId: 'acc_test',
    dataDir: TEST_DIR,
    agent: { chat: vi.fn().mockResolvedValue({ text: 'reply' }) },
    abortSignal: controller.signal,
    log: () => {},
    ...overrides,
  };
}

function mockFetchOnce(getUpdatesBody: unknown, onSend?: (body: unknown) => void): AbortController {
  const controller = new AbortController();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string, init: { body?: string }) => {
      if ((url as string).includes('getupdates')) {
        // Abort synchronously to avoid microtask starvation (setTimeout(0) never fires
        // because the async loop keeps generating microtasks before the event loop yields).
        controller.abort();
        return { ok: true, json: async () => getUpdatesBody } as Response;
      }
      if ((url as string).includes('sendmessage')) {
        if (onSend && init?.body) onSend(JSON.parse(init.body));
        return { ok: true, json: async () => ({}) } as Response;
      }
      return { ok: true, json: async () => ({}) } as Response;
    })
  );
  return controller;
}

beforeEach(() => {
  fs.mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('WeixinMonitor — text message delivery', () => {
  it('calls agent.chat with conversationId and text, then sends reply', async () => {
    const agentChat = vi.fn().mockResolvedValue({ text: 'Hello back!' });
    let sentBody: unknown;
    const controller = mockFetchOnce(
      {
        ret: 0,
        msgs: [
          {
            from_user_id: 'user_123',
            context_token: 'ctx_abc',
            item_list: [{ type: 1, text_item: { text: 'Hi there' } }],
          },
        ],
        get_updates_buf: 'buf_v2',
      },
      (body) => {
        sentBody = body;
      }
    );

    startMonitor(makeOpts({ agent: { chat: agentChat }, abortSignal: controller.signal }));
    await new Promise((r) => setTimeout(r, 60));

    expect(agentChat).toHaveBeenCalledOnce();
    expect(agentChat).toHaveBeenCalledWith({ conversationId: 'user_123', text: 'Hi there' });

    expect(sentBody).toBeDefined();
    const body = sentBody as {
      msg: { to_user_id: string; item_list: Array<{ type: number; text_item: { text: string } }> };
    };
    expect(body.msg.to_user_id).toBe('user_123');
    expect(body.msg.item_list[0].text_item.text).toBe('Hello back!');
  });

  it('does not call agent.chat for non-text items (image type=2)', async () => {
    const agentChat = vi.fn();
    const controller = mockFetchOnce({
      ret: 0,
      msgs: [{ from_user_id: 'user_123', item_list: [{ type: 2 }] }],
      get_updates_buf: '',
    });

    startMonitor(makeOpts({ agent: { chat: agentChat }, abortSignal: controller.signal }));
    await new Promise((r) => setTimeout(r, 60));

    expect(agentChat).not.toHaveBeenCalled();
  });
});

describe('WeixinMonitor — buf persistence', () => {
  it('writes get_updates_buf to disk after a successful response', async () => {
    const controller = mockFetchOnce({ ret: 0, msgs: [], get_updates_buf: 'saved_buf_xyz' });

    startMonitor(makeOpts({ abortSignal: controller.signal }));
    await new Promise((r) => setTimeout(r, 60));

    const bufFile = path.join(TEST_DIR, 'weixin-monitor', 'acc_test.buf');
    expect(fs.existsSync(bufFile)).toBe(true);
    expect(fs.readFileSync(bufFile, 'utf-8')).toBe('saved_buf_xyz');
  });

  it('does not write buf when get_updates_buf is empty string', async () => {
    const controller = mockFetchOnce({ ret: 0, msgs: [], get_updates_buf: '' });

    startMonitor(makeOpts({ abortSignal: controller.signal }));
    await new Promise((r) => setTimeout(r, 60));

    const bufFile = path.join(TEST_DIR, 'weixin-monitor', 'acc_test.buf');
    expect(fs.existsSync(bufFile)).toBe(false);
  });
});

describe('WeixinMonitor — retry / backoff', () => {
  it('retries after 2s on fetch error, backs off 30s after 3 consecutive failures', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let callCount = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount > 10) controller.abort();
        throw new Error('Network error');
      })
    );

    startMonitor(makeOpts({ abortSignal: controller.signal }));

    await vi.advanceTimersByTimeAsync(100);
    expect(callCount).toBe(1);

    await vi.advanceTimersByTimeAsync(2000);
    expect(callCount).toBe(2);

    await vi.advanceTimersByTimeAsync(2000);
    expect(callCount).toBe(3);

    // Still in 30s backoff — no 4th call yet
    await vi.advanceTimersByTimeAsync(10_000);
    expect(callCount).toBe(3);

    // After full 30s backoff → 4th call
    await vi.advanceTimersByTimeAsync(20_000);
    expect(callCount).toBe(4);

    controller.abort();
    vi.useRealTimers();
  });
});

describe('WeixinMonitor — abort', () => {
  it('stops cleanly when abortSignal fires before fetch resolves', async () => {
    const controller = new AbortController();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        () =>
          new Promise<Response>((_, reject) => {
            controller.signal.addEventListener('abort', () => reject(new Error('aborted')), {
              once: true,
            });
          })
      )
    );

    startMonitor(makeOpts({ abortSignal: controller.signal }));

    controller.abort();
    await new Promise((r) => setTimeout(r, 30));

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
