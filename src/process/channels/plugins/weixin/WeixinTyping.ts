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
        // oxlint-disable-next-line eslint/no-await-in-loop
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
        // oxlint-disable-next-line eslint/no-await-in-loop
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
    if (this.stopped || this.opts.abortSignal?.aborted) return async () => {};

    // Stop any existing session for this user (sends CANCEL for the previous session)
    const existing = this.activeSessions.get(userId);
    if (existing !== undefined) {
      await existing.stop();
    }

    const ticket = await this.getTypingTicket(userId, contextToken);
    if (!ticket) return async () => {};

    // Send immediately (fire-and-forget so fake-timer retry delays don't block startTyping)
    void this.sendTypingRetry(userId, ticket);

    if (this.stopped || this.opts.abortSignal?.aborted) return async () => {};

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
