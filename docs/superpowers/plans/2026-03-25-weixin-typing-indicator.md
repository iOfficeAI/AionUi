# WeChat Typing Indicator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a "typing…" indicator in WeChat when the agent is processing a reply, using the `ilink/bot/sendtyping` + `ilink/bot/getconfig` protocol APIs.

**Architecture:** A new `WeixinTyping.ts` module contains a `TypingManager` class that owns typing-ticket caching, `sendTyping` retry, and periodic re-send. `WeixinMonitor.ts` is minimally changed to instantiate one `TypingManager` and call `startTyping`/`stop` around each `agent.chat` call. The catch block logs and continues (matching existing monitor behavior) rather than re-throwing.

**Tech Stack:** TypeScript (strict), Vitest 4 with `vi.useFakeTimers()`, `vi.stubGlobal('fetch', ...)`. Path alias `@process/` resolves to `src/process/`.

---

## File Map

| Action     | File                                                                   |
| ---------- | ---------------------------------------------------------------------- |
| **Create** | `src/process/channels/plugins/weixin/WeixinTyping.ts`                  |
| **Create** | `tests/unit/channels/weixinTyping.test.ts`                             |
| **Modify** | `src/process/channels/plugins/weixin/WeixinMonitor.ts` (lines 188–244) |
| **Modify** | `tests/unit/channels/weixinMonitor.test.ts` (add 3 integration tests)  |

---

## Task 1: Create `WeixinTyping.ts` — TDD

**Files:**

- Create: `tests/unit/channels/weixinTyping.test.ts`
- Create: `src/process/channels/plugins/weixin/WeixinTyping.ts`

---

- [ ] **Step 1.1 — Write the failing test file**

Create `tests/unit/channels/weixinTyping.test.ts`:

```typescript
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
```

- [ ] **Step 1.2 — Run tests to verify they all FAIL (module not found)**

```bash
cd /Users/zhangyaxiong/Workspace/src/github/iOfficeAI/AionUi
bun run test -- --reporter=verbose tests/unit/channels/weixinTyping.test.ts
```

Expected: All tests FAIL with `Cannot find module '@process/channels/plugins/weixin/WeixinTyping'`.

- [ ] **Step 1.3 — Create `WeixinTyping.ts` implementation**

Create `src/process/channels/plugins/weixin/WeixinTyping.ts`:

```typescript
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// ==================== Constants ====================

const TYPING_INTERVAL_MS = 10_000;
const TYPING_RETRY_DELAY_MS = 500;
const MAX_TYPING_RETRIES = 2;
const CONFIG_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CONFIG_INITIAL_RETRY_MS = 2_000;
const CONFIG_MAX_RETRY_MS = 60 * 60 * 1000;
const API_TIMEOUT_MS = 10_000;

// ==================== Internal types ====================

type ConfigCacheEntry = {
  typingTicket: string;
  nextFetchAt: number;
  retryDelayMs: number;
};

type ActiveSession = {
  intervalId: ReturnType<typeof setInterval>;
  stop: () => Promise<void>;
};

export type TypingManagerOpts = {
  baseUrl: string;
  token: string;
  /** X-WECHAT-UIN header value — generated once in startMonitor, passed through. */
  wechatUin: string;
  /** When fired: clear all intervals and abort in-flight TYPING fetches. */
  abortSignal?: AbortSignal;
  log: (msg: string) => void;
};

// ==================== HTTP helper ====================

async function apiPost(params: {
  baseUrl: string;
  token: string;
  wechatUin: string;
  endpoint: string;
  body: Record<string, unknown>;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<string> {
  const url = `${params.baseUrl.replace(/\/$/, '')}/${params.endpoint}`;
  const bodyStr = JSON.stringify(params.body);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs);
  const onAbort = () => controller.abort();
  params.signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        AuthorizationType: 'ilink_bot_token',
        Authorization: `Bearer ${params.token}`,
        'Content-Length': String(Buffer.byteLength(bodyStr, 'utf-8')),
        'X-WECHAT-UIN': params.wechatUin,
      },
      body: bodyStr,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`${params.endpoint} HTTP ${res.status}: ${text}`);
    }
    return text;
  } finally {
    clearTimeout(timer);
    params.signal?.removeEventListener('abort', onAbort);
  }
}

// ==================== API calls ====================

async function callGetConfig(params: {
  baseUrl: string;
  token: string;
  wechatUin: string;
  userId: string;
  contextToken?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const body: Record<string, unknown> = {
    ilink_user_id: params.userId,
    base_info: {},
  };
  if (params.contextToken !== undefined) {
    body.context_token = params.contextToken;
  }

  const text = await apiPost({
    baseUrl: params.baseUrl,
    token: params.token,
    wechatUin: params.wechatUin,
    endpoint: 'ilink/bot/getconfig',
    body,
    timeoutMs: API_TIMEOUT_MS,
    signal: params.signal,
  });

  const resp = JSON.parse(text) as { ret?: number; errcode?: number; typing_ticket?: string };
  if ((resp.ret !== undefined && resp.ret !== 0) || (resp.errcode !== undefined && resp.errcode !== 0)) {
    throw new Error(`getconfig API error: ret=${resp.ret} errcode=${resp.errcode}`);
  }
  return resp.typing_ticket ?? '';
}

async function callSendTyping(params: {
  baseUrl: string;
  token: string;
  wechatUin: string;
  userId: string;
  typingTicket: string;
  status: 1 | 2;
  signal?: AbortSignal;
}): Promise<void> {
  await apiPost({
    baseUrl: params.baseUrl,
    token: params.token,
    wechatUin: params.wechatUin,
    endpoint: 'ilink/bot/sendtyping',
    body: {
      ilink_user_id: params.userId,
      typing_ticket: params.typingTicket,
      status: params.status,
      base_info: {},
    },
    timeoutMs: API_TIMEOUT_MS,
    signal: params.signal,
  });
}

// ==================== TypingManager ====================

/**
 * Manages the WeChat "typing…" indicator lifecycle for all active conversations.
 * One instance per monitor loop; shared across all concurrent messages.
 */
export class TypingManager {
  private configCache = new Map<string, ConfigCacheEntry>();
  /** Tracks active typing sessions per userId. Used for concurrent-session cleanup and abort. */
  private activeSessions = new Map<string, ActiveSession>();
  private stopped = false;

  constructor(private opts: TypingManagerOpts) {
    opts.abortSignal?.addEventListener(
      'abort',
      () => {
        this.stopped = true;
        // Clear all intervals synchronously. No CANCEL sent on monitor shutdown.
        for (const { intervalId } of this.activeSessions.values()) {
          clearInterval(intervalId);
        }
        this.activeSessions.clear();
      },
      { once: true }
    );
  }

  private async getTypingTicket(userId: string, contextToken?: string): Promise<string> {
    const now = Date.now();
    const entry = this.configCache.get(userId);

    if (entry && now < entry.nextFetchAt) {
      return entry.typingTicket;
    }

    try {
      const ticket = await callGetConfig({
        baseUrl: this.opts.baseUrl,
        token: this.opts.token,
        wechatUin: this.opts.wechatUin,
        userId,
        contextToken,
        signal: this.opts.abortSignal,
      });
      this.configCache.set(userId, {
        typingTicket: ticket,
        // Spread expiry uniformly across the 24 h window (thundering-herd prevention)
        nextFetchAt: now + Math.random() * CONFIG_CACHE_TTL_MS,
        retryDelayMs: CONFIG_INITIAL_RETRY_MS,
      });
      return ticket;
    } catch (err) {
      this.opts.log(`[weixin-typing] getConfig failed for ${userId}: ${String(err)}`);
      const prev = this.configCache.get(userId);
      const prevDelay = prev?.retryDelayMs ?? CONFIG_INITIAL_RETRY_MS;
      const nextDelay = Math.min(prevDelay * 2, CONFIG_MAX_RETRY_MS);
      this.configCache.set(userId, {
        typingTicket: prev?.typingTicket ?? '',
        nextFetchAt: now + (prev !== undefined ? nextDelay : CONFIG_INITIAL_RETRY_MS),
        retryDelayMs: nextDelay,
      });
      return prev?.typingTicket ?? '';
    }
  }

  /** Send TYPING with exponential-backoff retry. Never throws. */
  private async sendTypingRetry(userId: string, ticket: string): Promise<void> {
    let delay = TYPING_RETRY_DELAY_MS;
    for (let attempt = 0; attempt <= MAX_TYPING_RETRIES; attempt++) {
      try {
        await callSendTyping({
          baseUrl: this.opts.baseUrl,
          token: this.opts.token,
          wechatUin: this.opts.wechatUin,
          userId,
          typingTicket: ticket,
          status: 1,
          signal: this.opts.abortSignal,
        });
        return;
      } catch (err) {
        if (attempt === MAX_TYPING_RETRIES) {
          this.opts.log(`[weixin-typing] sendTyping failed for ${userId}: ${String(err)}`);
          return;
        }
        await new Promise<void>((r) => setTimeout(r, delay));
        delay *= 2;
      }
    }
  }

  /** Send CANCEL — single attempt, no abort signal forwarded, swallows all errors. Never throws. */
  private async sendCancel(userId: string, ticket: string): Promise<void> {
    try {
      await callSendTyping({
        baseUrl: this.opts.baseUrl,
        token: this.opts.token,
        wechatUin: this.opts.wechatUin,
        userId,
        typingTicket: ticket,
        status: 2,
        // No abortSignal — CANCEL should attempt even if the monitor is stopping
      });
    } catch {
      // best-effort
    }
  }

  /**
   * Start typing indicator for userId.
   * Sends TYPING immediately, then every TYPING_INTERVAL_MS.
   * If a previous session for userId is active, it is stopped (CANCEL sent) first.
   * If typingTicket is empty, returns a no-op stop — agent.chat still proceeds.
   * Returns a stop function that clears the interval and sends CANCEL. stop() is idempotent.
   */
  async startTyping(userId: string, contextToken?: string): Promise<() => Promise<void>> {
    if (this.stopped) return async () => {};

    // Stop any existing session for this user (sends CANCEL for the previous session)
    const existing = this.activeSessions.get(userId);
    if (existing !== undefined) {
      await existing.stop();
    }

    const ticket = await this.getTypingTicket(userId, contextToken);
    if (!ticket) return async () => {};

    // Send immediately
    await this.sendTypingRetry(userId, ticket);

    if (this.stopped) return async () => {};

    // Periodic re-send
    const intervalId = setInterval(() => {
      if (!this.stopped) {
        void this.sendTypingRetry(userId, ticket);
      }
    }, TYPING_INTERVAL_MS);

    let done = false;
    const stop = async () => {
      if (done) return;
      done = true;
      clearInterval(intervalId);
      this.activeSessions.delete(userId);
      await this.sendCancel(userId, ticket);
    };

    this.activeSessions.set(userId, { intervalId, stop });
    return stop;
  }
}
```

- [ ] **Step 1.4 — Run tests to verify they all PASS**

```bash
bun run test -- --reporter=verbose tests/unit/channels/weixinTyping.test.ts
```

Expected: All tests PASS. If any fail, read the error message and fix the implementation (not the tests).

- [ ] **Step 1.5 — Lint and type-check**

```bash
bun run lint:fix && bunx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 1.6 — Commit**

```bash
git add src/process/channels/plugins/weixin/WeixinTyping.ts tests/unit/channels/weixinTyping.test.ts
git commit -m "feat(weixin): add TypingManager for WeChat typing indicator"
```

---

## Task 2: Wire TypingManager into WeixinMonitor — TDD

**Files:**

- Modify: `tests/unit/channels/weixinMonitor.test.ts` (add new describe block)
- Modify: `src/process/channels/plugins/weixin/WeixinMonitor.ts`

---

- [ ] **Step 2.1 — Add failing integration tests to `weixinMonitor.test.ts`**

Append this new `describe` block at the end of the file (after the last existing `describe`):

```typescript
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
```

- [ ] **Step 2.2 — Run the new tests to confirm they FAIL**

```bash
bun run test -- --reporter=verbose tests/unit/channels/weixinMonitor.test.ts
```

Expected: The 3 new tests fail (no TYPING/CANCEL sent). Existing 4 tests still PASS.

- [ ] **Step 2.3 — Modify `WeixinMonitor.ts` to use TypingManager**

**Change A — Add import** at the top of the file (after the existing `import crypto` / `import fs` / `import path` lines):

```typescript
import { TypingManager } from './WeixinTyping';
```

**Change B — In `runMonitor`, add one line before the `while` loop and update the message-handler block.**

Locate the function body (around line 198). The only lines that change are inside the `for (const msg of resp.msgs ?? [])` block:

```typescript
// BEFORE — inside the for loop (lines ~229–244):
const conversationId = msg.from_user_id ?? '';
const text = textItem.text_item?.text ?? '';

try {
  const response = await agent.chat({ conversationId, text });
  if (response.text) {
    await callSendMessage(baseUrl, token, wechatUin, conversationId, response.text, msg.context_token);
  }
} catch (agentErr) {
  log(`[weixin] agent or send error for ${conversationId}: ${String(agentErr)}`);
}
```

```typescript
// AFTER — same block with typing wired in:
const conversationId = msg.from_user_id ?? '';
const text = textItem.text_item?.text ?? '';

const stopTyping = await typingMgr.startTyping(conversationId, msg.context_token);
try {
  const response = await agent.chat({ conversationId, text });
  await stopTyping();
  if (response.text) {
    await callSendMessage(baseUrl, token, wechatUin, conversationId, response.text, msg.context_token);
  }
} catch (agentErr) {
  await stopTyping();
  log(`[weixin] agent or send error for ${conversationId}: ${String(agentErr)}`);
}
```

Also add one line **before the `while` loop** (right after `let consecutiveFailures = 0;`):

```typescript
const typingMgr = new TypingManager({ baseUrl, token, wechatUin, abortSignal: signal, log });
```

Everything else in `runMonitor` — the `while` condition, `getUpdates` call, `loadBuf`/`saveBuf`, error backoff logic — is **untouched**.

> **Note on catch behavior:** The catch block logs and continues (matching the existing WeixinMonitor pattern). This keeps the monitor loop running even when a single message fails. The spec pseudocode used `throw err` but the plan intentionally follows the existing codebase convention.

- [ ] **Step 2.4 — Run all weixin tests to verify everything PASSES**

```bash
bun run test -- --reporter=verbose tests/unit/channels/weixinMonitor.test.ts tests/unit/channels/weixinTyping.test.ts
```

Expected: All tests PASS.

- [ ] **Step 2.5 — Run full test suite to check for regressions**

```bash
bun run test
```

Expected: All tests PASS. Do not fix any failures that existed before this change.

- [ ] **Step 2.6 — Lint and type-check**

```bash
bun run lint:fix && bunx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 2.7 — Commit**

```bash
git add src/process/channels/plugins/weixin/WeixinMonitor.ts tests/unit/channels/weixinMonitor.test.ts
git commit -m "feat(weixin): wire TypingManager into WeixinMonitor for typing indicator"
```

---

## Verification Checklist

After both tasks complete:

- [ ] `bun run test` passes with no regressions
- [ ] `bunx tsc --noEmit` reports no type errors
- [ ] `bun run lint:fix` reports no lint issues
- [ ] Two new commits on `feat/weixin-plugin` branch
- [ ] `WeixinPlugin.ts`, `WeixinAdapter.ts`, `WeixinLogin.ts` are **unmodified**
- [ ] No SSE or streaming code anywhere in the diff
