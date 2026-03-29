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

function asArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
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

  it('downloads media attachments, saves them locally, and passes them to agent.chat', async () => {
    const agentChat = vi.fn().mockResolvedValue({ text: 'Received attachments' });
    let sentBody: unknown;
    const controller = new AbortController();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string, init: { body?: string }) => {
        if ((url as string).includes('getupdates')) {
          controller.abort();
          return {
            ok: true,
            json: async () => ({
              ret: 0,
              msgs: [
                {
                  from_user_id: 'user_media',
                  context_token: 'ctx_media',
                  msg_id: 'msg_media',
                  item_list: [
                    { type: 1, text_item: { text: 'Please inspect' } },
                    {
                      type: 2,
                      image_item: {
                        media: { encrypt_query_param: 'img-token' },
                        file_name: 'photo',
                      },
                    },
                    {
                      type: 4,
                      file_item: {
                        media: { encrypt_query_param: 'pdf-token' },
                        file_name: 'report.pdf',
                      },
                    },
                  ],
                },
              ],
              get_updates_buf: '',
            }),
          } as Response;
        }
        if ((url as string).includes('encrypted_query_param=img-token')) {
          return {
            ok: true,
            arrayBuffer: async () => asArrayBuffer(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d])),
          } as Response;
        }
        if ((url as string).includes('encrypted_query_param=pdf-token')) {
          return {
            ok: true,
            arrayBuffer: async () => asArrayBuffer(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d])),
          } as Response;
        }
        if ((url as string).includes('sendmessage')) {
          if (init?.body) sentBody = JSON.parse(init.body);
          return { ok: true, json: async () => ({}) } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      })
    );

    startMonitor(makeOpts({ agent: { chat: agentChat }, abortSignal: controller.signal }));
    await new Promise((r) => setTimeout(r, 80));

    expect(agentChat).toHaveBeenCalledOnce();
    const call = agentChat.mock.calls[0]?.[0] as {
      conversationId: string;
      text: string;
      attachments?: Array<{ path: string; kind: string; name: string }>;
    };
    expect(call.conversationId).toBe('user_media');
    expect(call.text).toBe('Please inspect');
    expect(call.attachments).toHaveLength(2);
    expect(call.attachments?.map((att) => ({ kind: att.kind, name: att.name }))).toEqual([
      { kind: 'image', name: 'photo' },
      { kind: 'file', name: 'report.pdf' },
    ]);
    for (const attachment of call.attachments ?? []) {
      expect(fs.existsSync(attachment.path)).toBe(true);
    }
    expect(call.attachments?.[0]?.path).toMatch(/msg_media-0-photo\.png$/);
    expect(call.attachments?.[1]?.path).toMatch(/msg_media-1-report\.pdf\.pdf$/);

    expect(sentBody).toBeDefined();
  });

  it('skips agent.chat when all attachment downloads fail and there is no text', async () => {
    const agentChat = vi.fn();
    const controller = new AbortController();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        if ((url as string).includes('getupdates')) {
          controller.abort();
          return {
            ok: true,
            json: async () => ({
              ret: 0,
              msgs: [
                {
                  from_user_id: 'user_media',
                  msg_id: 'msg_media',
                  item_list: [
                    {
                      type: 2,
                      image_item: {
                        media: { encrypt_query_param: 'img-token' },
                        file_name: 'photo',
                      },
                    },
                  ],
                },
              ],
              get_updates_buf: '',
            }),
          } as Response;
        }
        if ((url as string).includes('encrypted_query_param=img-token')) {
          return { ok: false, status: 502, arrayBuffer: async () => asArrayBuffer(Buffer.alloc(0)) } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      })
    );

    startMonitor(makeOpts({ agent: { chat: agentChat }, abortSignal: controller.signal }));
    await new Promise((r) => setTimeout(r, 80));

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

describe('WeixinMonitor — typing indicator integration', () => {
  /**
   * Stubs fetch for all four endpoints and returns a shared `callOrder` array.
   * Both fetch events and agent.chat invocations can be pushed into callOrder
   * to verify cross-boundary ordering.
   *
   * Two-round approach: round 1 returns the test messages WITHOUT aborting so
   * TypingManager.startTyping runs before stopped=true; round 2 aborts to stop
   * the monitor loop. This avoids the race where a synchronous abort inside the
   * fetch mock fires the TypingManager abort-listener before startTyping is called.
   */
  function makeTypingFetch(opts: { msgs?: unknown[]; callOrder: string[] }): AbortController {
    const controller = new AbortController();
    let getupdatesRound = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string, init: { body?: string }) => {
        if ((url as string).includes('getupdates')) {
          getupdatesRound++;
          if (getupdatesRound === 1) {
            // First round: return test messages, do NOT abort yet.
            // The monitor processes the messages (typing + agent.chat + sendmessage)
            // before looping back for a second getupdates call.
            return {
              ok: true,
              json: async () => ({ ret: 0, msgs: opts.msgs ?? [], get_updates_buf: '' }),
            } as Response;
          }
          // Second round: abort to stop the monitor loop.
          controller.abort();
          return {
            ok: true,
            json: async () => ({ ret: 0, msgs: [], get_updates_buf: '' }),
          } as Response;
        }
        if ((url as string).includes('getconfig')) {
          opts.callOrder.push('getconfig');
          return {
            ok: true,
            text: async () => JSON.stringify({ ret: 0, typing_ticket: 'tk_monitor' }),
          } as Response;
        }
        if ((url as string).includes('sendtyping')) {
          const body = init?.body ? (JSON.parse(init.body) as { status?: number }) : {};
          opts.callOrder.push(body.status === 2 ? 'sendtyping:CANCEL' : 'sendtyping:TYPING');
          return { ok: true, text: async () => '{}' } as Response;
        }
        if ((url as string).includes('sendmessage')) {
          opts.callOrder.push('sendmessage');
          return { ok: true, json: async () => ({}) } as Response;
        }
        return { ok: true, json: async () => ({}) } as Response;
      })
    );

    return controller;
  }

  const TEST_MSG = {
    from_user_id: 'user_t1',
    context_token: 'ctx_t1',
    item_list: [{ type: 1, text_item: { text: 'hello' } }],
  };

  it('sends TYPING before agent.chat is called', async () => {
    const callOrder: string[] = [];
    const agentChat = vi.fn().mockImplementation(async () => {
      callOrder.push('agent.chat');
      return { text: 'reply' };
    });

    const controller = makeTypingFetch({ msgs: [TEST_MSG], callOrder });
    startMonitor(makeOpts({ agent: { chat: agentChat }, abortSignal: controller.signal }));
    await new Promise((r) => setTimeout(r, 80));

    const typingIdx = callOrder.indexOf('sendtyping:TYPING');
    const agentIdx = callOrder.indexOf('agent.chat');
    expect(typingIdx).toBeGreaterThanOrEqual(0);
    expect(agentIdx).toBeGreaterThan(typingIdx);
  });

  it('sends CANCEL after agent.chat resolves, before sendmessage', async () => {
    const callOrder: string[] = [];
    const controller = makeTypingFetch({ msgs: [TEST_MSG], callOrder });

    startMonitor(makeOpts({ abortSignal: controller.signal }));
    await new Promise((r) => setTimeout(r, 80));

    const cancelIdx = callOrder.indexOf('sendtyping:CANCEL');
    const sendIdx = callOrder.indexOf('sendmessage');
    expect(cancelIdx).toBeGreaterThanOrEqual(0);
    expect(sendIdx).toBeGreaterThan(cancelIdx);
  });

  it('sends CANCEL when agent.chat throws', async () => {
    const callOrder: string[] = [];
    const agentChat = vi.fn().mockRejectedValue(new Error('agent exploded'));
    const controller = makeTypingFetch({ msgs: [TEST_MSG], callOrder });

    startMonitor(makeOpts({ agent: { chat: agentChat }, abortSignal: controller.signal }));
    await new Promise((r) => setTimeout(r, 80));

    expect(callOrder).toContain('sendtyping:CANCEL');
    expect(callOrder).not.toContain('sendmessage');
  });
});
