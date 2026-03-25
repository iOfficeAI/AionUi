/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TypingManager } from '@process/channels/plugins/weixin/WeixinTyping';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_OPTS = {
  baseUrl: 'https://test.example.com',
  token: 'tok_test',
  wechatUin: 'test-uin',
  log: vi.fn(),
};

type FetchCall = { url: string; body: Record<string, unknown>; headers: Record<string, string> };

/**
 * Stubs global fetch. Each call is logged into `calls`.
 * `responses` maps a URL substring → JSON body to return.
 * Unmatched URLs return `{}`.
 */
function makeFetch(responses: Record<string, unknown> = {}): { calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url, body, headers });
      const key = Object.keys(responses).find((k) => url.includes(k));
      const resp = key ? responses[key] : {};
      return { ok: true, text: async () => JSON.stringify(resp) } as Response;
    })
  );
  return { calls };
}

/**
 * Stubs fetch where `failUrls` always throw. Other URLs succeed with getconfig defaults.
 */
function makeFailFetch(failUrls: string[]): { calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};
      const headers = (init?.headers ?? {}) as Record<string, string>;
      calls.push({ url, body, headers });
      if (failUrls.some((f) => url.includes(f))) throw new Error('Network error');
      if (url.includes('getconfig')) {
        return { ok: true, text: async () => JSON.stringify({ ret: 0, typing_ticket: 'ticket123' }) } as Response;
      }
      return { ok: true, text: async () => '{}' } as Response;
    })
  );
  return { calls };
}

// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TypingManager — immediate TYPING on startTyping', () => {
  it('calls getconfig then sendtyping(status=1) immediately', async () => {
    vi.useFakeTimers();
    const { calls } = makeFetch({
      getconfig: { ret: 0, typing_ticket: 'ticket_abc' },
    });

    const mgr = new TypingManager(BASE_OPTS);
    const stop = await mgr.startTyping('user_123', 'ctx_tok');

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain('getconfig');
    expect(calls[0].body).toMatchObject({ ilink_user_id: 'user_123', context_token: 'ctx_tok' });
    expect(calls[1].url).toContain('sendtyping');
    expect(calls[1].body).toMatchObject({
      ilink_user_id: 'user_123',
      typing_ticket: 'ticket_abc',
      status: 1,
    });

    await stop();
  });

  it('includes Authorization, AuthorizationType, X-WECHAT-UIN on all requests', async () => {
    vi.useFakeTimers();
    const { calls } = makeFetch({ getconfig: { ret: 0, typing_ticket: 'tk' } });

    const mgr = new TypingManager(BASE_OPTS);
    const stop = await mgr.startTyping('user_x');
    await stop();

    for (const c of calls) {
      expect(c.headers['Authorization']).toBe('Bearer tok_test');
      expect(c.headers['AuthorizationType']).toBe('ilink_bot_token');
      expect(c.headers['X-WECHAT-UIN']).toBe('test-uin');
    }
  });

  it('omits context_token field when contextToken is undefined', async () => {
    vi.useFakeTimers();
    const { calls } = makeFetch({ getconfig: { ret: 0, typing_ticket: 'tk' } });

    const mgr = new TypingManager(BASE_OPTS);
    const stop = await mgr.startTyping('user_y');
    await stop();

    expect(calls[0].url).toContain('getconfig');
    expect(calls[0].body).not.toHaveProperty('context_token');
  });
});

describe('TypingManager — interval re-send', () => {
  it('re-sends TYPING every 10 s', async () => {
    vi.useFakeTimers();
    const { calls } = makeFetch({ getconfig: { ret: 0, typing_ticket: 'tk' } });

    const mgr = new TypingManager(BASE_OPTS);
    const stop = await mgr.startTyping('user_123');

    const typingCallsAfterStart = calls.filter((c) => c.url.includes('sendtyping') && c.body['status'] === 1).length;
    expect(typingCallsAfterStart).toBe(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls.filter((c) => c.url.includes('sendtyping') && c.body['status'] === 1)).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls.filter((c) => c.url.includes('sendtyping') && c.body['status'] === 1)).toHaveLength(3);

    await stop();
  });
});

describe('TypingManager — stop()', () => {
  it('stop() clears interval and sends CANCEL (status=2)', async () => {
    vi.useFakeTimers();
    const { calls } = makeFetch({ getconfig: { ret: 0, typing_ticket: 'tk' } });

    const mgr = new TypingManager(BASE_OPTS);
    const stop = await mgr.startTyping('user_123');
    await stop();

    const cancelCalls = calls.filter((c) => c.url.includes('sendtyping') && c.body['status'] === 2);
    expect(cancelCalls).toHaveLength(1);
    expect(cancelCalls[0].body).toMatchObject({ ilink_user_id: 'user_123', status: 2 });

    // Interval should be cleared — no more TYPING after stop
    await vi.advanceTimersByTimeAsync(20_000);
    expect(calls.filter((c) => c.url.includes('sendtyping') && c.body['status'] === 1)).toHaveLength(1);
  });

  it('stop() is idempotent — CANCEL sent only once on double call', async () => {
    vi.useFakeTimers();
    const { calls } = makeFetch({ getconfig: { ret: 0, typing_ticket: 'tk' } });

    const mgr = new TypingManager(BASE_OPTS);
    const stop = await mgr.startTyping('user_123');
    await stop();
    await stop();

    expect(calls.filter((c) => c.url.includes('sendtyping') && c.body['status'] === 2)).toHaveLength(1);
  });
});

describe('TypingManager — empty typing_ticket (getConfig returns empty or fails)', () => {
  it('returns no-op stop when getconfig returns empty ticket', async () => {
    vi.useFakeTimers();
    const { calls } = makeFetch({ getconfig: { ret: 0, typing_ticket: '' } });

    const mgr = new TypingManager(BASE_OPTS);
    const stop = await mgr.startTyping('user_123');

    expect(calls.filter((c) => c.url.includes('sendtyping'))).toHaveLength(0);
    await stop(); // no-op, no throw
    expect(calls.filter((c) => c.url.includes('sendtyping'))).toHaveLength(0);
  });

  it('returns no-op stop when getconfig throws, does not propagate error', async () => {
    vi.useFakeTimers();
    const { calls } = makeFailFetch(['getconfig']);

    const mgr = new TypingManager({ ...BASE_OPTS, log: vi.fn() });
    const stop = await mgr.startTyping('user_123'); // must not throw

    expect(calls.filter((c) => c.url.includes('sendtyping'))).toHaveLength(0);
    await stop();
  });
});

describe('TypingManager — concurrent startTyping for same userId', () => {
  it('stops the previous session (sends CANCEL) before starting a new one', async () => {
    vi.useFakeTimers();
    const { calls } = makeFetch({ getconfig: { ret: 0, typing_ticket: 'tk' } });

    const mgr = new TypingManager(BASE_OPTS);
    const stop1 = await mgr.startTyping('user_123');
    // Second startTyping for the same user must auto-stop the first
    const stop2 = await mgr.startTyping('user_123');

    // stop1's CANCEL must have been sent before stop2's TYPING
    const cancelIdx = calls.findIndex((c) => c.url.includes('sendtyping') && c.body['status'] === 2);
    expect(cancelIdx).toBeGreaterThanOrEqual(0);

    await stop2();
    await stop1(); // idempotent — no extra CANCEL
    // Exactly 2 CANCELs total: one from auto-stop, one from stop2()
    expect(calls.filter((c) => c.url.includes('sendtyping') && c.body['status'] === 2)).toHaveLength(2);
  });
});

describe('TypingManager — AbortSignal', () => {
  it('clears interval when abortSignal fires during active session', async () => {
    vi.useFakeTimers();
    const { calls } = makeFetch({ getconfig: { ret: 0, typing_ticket: 'tk' } });
    const controller = new AbortController();

    const mgr = new TypingManager({ ...BASE_OPTS, abortSignal: controller.signal });
    await mgr.startTyping('user_123');

    const typingBefore = calls.filter((c) => c.url.includes('sendtyping') && c.body['status'] === 1).length;

    controller.abort();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(calls.filter((c) => c.url.includes('sendtyping') && c.body['status'] === 1)).toHaveLength(typingBefore);
  });

  it('returns no-op immediately when abortSignal is already fired before startTyping', async () => {
    vi.useFakeTimers();
    const { calls } = makeFetch({ getconfig: { ret: 0, typing_ticket: 'tk' } });
    const controller = new AbortController();
    controller.abort();

    const mgr = new TypingManager({ ...BASE_OPTS, abortSignal: controller.signal });
    const stop = await mgr.startTyping('user_123');

    expect(calls).toHaveLength(0);
    await stop(); // no throw
  });
});

describe('TypingManager — sendTyping retry', () => {
  it('retries TYPING up to MAX_TYPING_RETRIES times then logs and resolves (no throw)', async () => {
    vi.useFakeTimers();
    const logFn = vi.fn();
    makeFailFetch(['sendtyping']);

    const mgr = new TypingManager({ ...BASE_OPTS, log: logFn });
    const stop = await mgr.startTyping('user_123');
    // Advance timers to allow retry delays (500 ms + 1000 ms = 1500 ms total)
    await vi.advanceTimersByTimeAsync(2_000);

    expect(logFn).toHaveBeenCalledWith(expect.stringContaining('sendTyping failed'));
    await stop();
  });

  it('swallows CANCEL failure — stop() resolves without throwing', async () => {
    vi.useFakeTimers();
    makeFailFetch(['sendtyping']);

    const mgr = new TypingManager(BASE_OPTS);
    const stop = await mgr.startTyping('user_123');
    await vi.advanceTimersByTimeAsync(2_000); // allow retry delays for TYPING
    await expect(stop()).resolves.toBeUndefined(); // CANCEL also fails but must not throw
  });
});
