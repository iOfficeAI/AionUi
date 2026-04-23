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
  base_url: string;
  token: string;
  /** X-WECHAT-UIN header value — generated once in startMonitor, passed through. */
  wechatUin: string;
  /** When fired: clear all intervals and abort in-flight TYPING fetches. */
  abortSignal?: AbortSignal;
  log: (msg: string) => void;
};

// ==================== HTTP helper ====================

async function apiPost(params: {
  base_url: string;
  token: string;
  wechatUin: string;
  endpoint: string;
  body: Record<string, unknown>;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<string> {
  const url = `${params.base_url.replace(/\/$/, '')}/${params.endpoint}`;
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
  base_url: string;
  token: string;
  wechatUin: string;
  user_id: string;
  contextToken?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const body: Record<string, unknown> = {
    ilink_user_id: params.user_id,
    base_info: {},
  };
  if (params.contextToken !== undefined) {
    body.context_token = params.contextToken;
  }

  const text = await apiPost({
    base_url: params.base_url,
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
  base_url: string;
  token: string;
  wechatUin: string;
  user_id: string;
  typingTicket: string;
  status: 1 | 2;
  signal?: AbortSignal;
}): Promise<void> {
  await apiPost({
    base_url: params.base_url,
    token: params.token,
    wechatUin: params.wechatUin,
    endpoint: 'ilink/bot/sendtyping',
    body: {
      ilink_user_id: params.user_id,
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
  /** Tracks active typing sessions per user_id. Used for concurrent-session cleanup and abort. */
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

  private async getTypingTicket(user_id: string, contextToken?: string): Promise<string> {
    const now = Date.now();
    const entry = this.configCache.get(user_id);

    if (entry && now < entry.nextFetchAt) {
      return entry.typingTicket;
    }

    try {
      const ticket = await callGetConfig({
        base_url: this.opts.base_url,
        token: this.opts.token,
        wechatUin: this.opts.wechatUin,
        user_id,
        contextToken,
        signal: this.opts.abortSignal,
      });
      this.configCache.set(user_id, {
        typingTicket: ticket,
        // Spread expiry uniformly across the 24 h window (thundering-herd prevention)
        nextFetchAt: now + Math.random() * CONFIG_CACHE_TTL_MS,
        retryDelayMs: CONFIG_INITIAL_RETRY_MS,
      });
      return ticket;
    } catch (err) {
      this.opts.log(`[weixin-typing] getConfig failed for ${user_id}: ${String(err)}`);
      const prev = this.configCache.get(user_id);
      const prevDelay = prev?.retryDelayMs ?? CONFIG_INITIAL_RETRY_MS;
      const nextDelay = Math.min(prevDelay * 2, CONFIG_MAX_RETRY_MS);
      this.configCache.set(user_id, {
        typingTicket: prev?.typingTicket ?? '',
        nextFetchAt: now + (prev !== undefined ? nextDelay : CONFIG_INITIAL_RETRY_MS),
        retryDelayMs: nextDelay,
      });
      return prev?.typingTicket ?? '';
    }
  }

  /** Send TYPING with exponential-backoff retry. Never throws. */
  private async sendTypingRetry(user_id: string, ticket: string): Promise<void> {
    let delay = TYPING_RETRY_DELAY_MS;
    for (let attempt = 0; attempt <= MAX_TYPING_RETRIES; attempt++) {
      try {
        // oxlint-disable-next-line eslint/no-await-in-loop
        await callSendTyping({
          base_url: this.opts.base_url,
          token: this.opts.token,
          wechatUin: this.opts.wechatUin,
          user_id,
          typingTicket: ticket,
          status: 1,
          signal: this.opts.abortSignal,
        });
        return;
      } catch (err) {
        if (attempt === MAX_TYPING_RETRIES) {
          this.opts.log(`[weixin-typing] sendTyping failed for ${user_id}: ${String(err)}`);
          return;
        }
        // oxlint-disable-next-line eslint/no-await-in-loop
        await new Promise<void>((r) => setTimeout(r, delay));
        delay *= 2;
      }
    }
  }

  /** Send CANCEL — single attempt, no abort signal forwarded, swallows all errors. Never throws. */
  private async sendCancel(user_id: string, ticket: string): Promise<void> {
    try {
      await callSendTyping({
        base_url: this.opts.base_url,
        token: this.opts.token,
        wechatUin: this.opts.wechatUin,
        user_id,
        typingTicket: ticket,
        status: 2,
        // No abortSignal — CANCEL should attempt even if the monitor is stopping
      });
    } catch {
      // best-effort
    }
  }

  /**
   * Start typing indicator for user_id.
   * Sends TYPING immediately, then every TYPING_INTERVAL_MS.
   * If a previous session for user_id is active, it is stopped (CANCEL sent) first.
   * If typingTicket is empty, returns a no-op stop — agent.chat still proceeds.
   * Returns a stop function that clears the interval and sends CANCEL. stop() is idempotent.
   */
  async startTyping(user_id: string, contextToken?: string): Promise<() => Promise<void>> {
    if (this.stopped || this.opts.abortSignal?.aborted) return async () => {};

    // Stop any existing session for this user (sends CANCEL for the previous session)
    const existing = this.activeSessions.get(user_id);
    if (existing !== undefined) {
      await existing.stop();
    }

    const ticket = await this.getTypingTicket(user_id, contextToken);
    if (!ticket) return async () => {};

    // Send immediately (fire-and-forget so fake-timer retry delays don't block startTyping)
    void this.sendTypingRetry(user_id, ticket);

    if (this.stopped || this.opts.abortSignal?.aborted) return async () => {};

    // Periodic re-send
    const intervalId = setInterval(() => {
      if (!this.stopped) {
        void this.sendTypingRetry(user_id, ticket);
      }
    }, TYPING_INTERVAL_MS);

    let done = false;
    const stop = async () => {
      if (done) return;
      done = true;
      clearInterval(intervalId);
      this.activeSessions.delete(user_id);
      await this.sendCancel(user_id, ticket);
    };

    this.activeSessions.set(user_id, { intervalId, stop });
    return stop;
  }
}
