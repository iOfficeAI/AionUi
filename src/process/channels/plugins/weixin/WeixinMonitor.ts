/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { TypingManager } from './WeixinTyping';

// ==================== Public types ====================

export type WeixinChatRequest = {
  conversationId: string;
  text?: string;
};

export type WeixinChatResponse = {
  text?: string;
};

export type WeixinAgent = {
  chat: (req: WeixinChatRequest) => Promise<WeixinChatResponse>;
};

export type MonitorOptions = {
  baseUrl: string;
  token: string;
  accountId: string;
  /** Directory used to persist get_updates_buf. Pass getPlatformServices().paths.getDataDir(). */
  dataDir: string;
  agent: WeixinAgent;
  abortSignal?: AbortSignal;
  log?: (msg: string) => void;
};

// ==================== Utilities ====================

function formatError(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: unknown }).cause;
    return cause !== undefined ? `${err.message}: ${String(cause)}` : err.message;
  }
  return String(err);
}

// ==================== Constants ====================

const LONG_POLL_TIMEOUT_MS = 35_000;
const API_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 2_000;
const BACKOFF_DELAY_MS = 30_000;
const MAX_CONSECUTIVE_FAILURES = 3;
const TEXT_ITEM_TYPE = 1;

// ==================== Internal API types ====================

type GetUpdatesResp = {
  ret?: number;
  errcode?: number;
  errmsg?: string;
  msgs?: WeixinRawMessage[];
  get_updates_buf?: string;
  longpolling_timeout_ms?: number;
};

type WeixinRawMessage = {
  from_user_id?: string;
  context_token?: string;
  item_list?: Array<{ type?: number; text_item?: { text?: string } }>;
};

// ==================== HTTP ====================

async function apiPost<T>(
  baseUrl: string,
  endpoint: string,
  bodyObj: unknown,
  token: string,
  wechatUin: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<T> {
  const url = `${baseUrl.replace(/\/$/, '')}/${endpoint}`;
  const body = JSON.stringify(bodyObj);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        AuthorizationType: 'ilink_bot_token',
        Authorization: `Bearer ${token}`,
        'Content-Length': String(Buffer.byteLength(body, 'utf-8')),
        'X-WECHAT-UIN': wechatUin,
      },
      body,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

// ==================== API calls ====================

async function callGetUpdates(
  baseUrl: string,
  token: string,
  wechatUin: string,
  buf: string,
  signal?: AbortSignal
): Promise<GetUpdatesResp> {
  return apiPost<GetUpdatesResp>(
    baseUrl,
    'ilink/bot/getupdates',
    { get_updates_buf: buf, base_info: {} },
    token,
    wechatUin,
    LONG_POLL_TIMEOUT_MS,
    signal
  );
}

async function callSendMessage(
  baseUrl: string,
  token: string,
  wechatUin: string,
  toUserId: string,
  text: string,
  contextToken?: string
): Promise<void> {
  const clientId = crypto.randomUUID();
  await apiPost(
    baseUrl,
    'ilink/bot/sendmessage',
    {
      msg: {
        to_user_id: toUserId,
        client_id: clientId,
        message_type: 2,
        message_state: 2,
        item_list: [{ type: TEXT_ITEM_TYPE, text_item: { text } }],
        context_token: contextToken,
      },
      base_info: {},
    },
    token,
    wechatUin,
    API_TIMEOUT_MS
    // No abort signal — send should complete even if the monitor is stopping
  );
}

// ==================== Buf persistence ====================

function getBufPath(dataDir: string, accountId: string): string {
  return path.join(dataDir, 'weixin-monitor', `${accountId}.buf`);
}

function loadBuf(dataDir: string, accountId: string): string {
  try {
    return fs.readFileSync(getBufPath(dataDir, accountId), 'utf-8');
  } catch {
    return '';
  }
}

function saveBuf(dataDir: string, accountId: string, buf: string): void {
  const dir = path.join(dataDir, 'weixin-monitor');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getBufPath(dataDir, accountId), buf, 'utf-8');
}

// ==================== Monitor loop ====================

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new Error('aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function runMonitor(
  baseUrl: string,
  token: string,
  accountId: string,
  dataDir: string,
  agent: WeixinAgent,
  wechatUin: string,
  signal: AbortSignal | undefined,
  log: (msg: string) => void
): Promise<void> {
  let buf = loadBuf(dataDir, accountId);
  let consecutiveFailures = 0;
  const typingMgr = new TypingManager({ baseUrl, token, wechatUin, abortSignal: signal, log });

  // oxlint-disable-next-line eslint/no-unmodified-loop-condition
  while (!signal?.aborted) {
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop
      const resp = await callGetUpdates(baseUrl, token, wechatUin, buf, signal);

      const isApiError =
        (resp.ret !== undefined && resp.ret !== 0) || (resp.errcode !== undefined && resp.errcode !== 0);

      if (isApiError) {
        consecutiveFailures++;
        log(
          `[weixin] getUpdates failed: ret=${resp.ret} errcode=${resp.errcode} (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`
        );
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          consecutiveFailures = 0;
          // oxlint-disable-next-line eslint/no-await-in-loop
          await sleep(BACKOFF_DELAY_MS, signal);
        } else {
          // oxlint-disable-next-line eslint/no-await-in-loop
          await sleep(RETRY_DELAY_MS, signal);
        }
        continue;
      }

      consecutiveFailures = 0;

      if (resp.get_updates_buf) {
        buf = resp.get_updates_buf;
        saveBuf(dataDir, accountId, buf);
      }

      for (const msg of resp.msgs ?? []) {
        const textItem = msg.item_list?.find((i) => i.type === TEXT_ITEM_TYPE);
        if (!textItem) continue;

        const conversationId = msg.from_user_id ?? '';
        const text = textItem.text_item?.text ?? '';

        // oxlint-disable-next-line eslint/no-await-in-loop
        const stopTyping = await typingMgr.startTyping(conversationId, msg.context_token);
        let response: WeixinChatResponse | undefined;
        try {
          // oxlint-disable-next-line eslint/no-await-in-loop
          response = await agent.chat({ conversationId, text });
        } catch (agentErr) {
          // oxlint-disable-next-line eslint/no-await-in-loop
          await stopTyping();
          log(`[weixin] agent error for ${conversationId}: ${formatError(agentErr)}`);
          continue;
        }
        // oxlint-disable-next-line eslint/no-await-in-loop
        await stopTyping();
        if (response.text) {
          try {
            // oxlint-disable-next-line eslint/no-await-in-loop
            await callSendMessage(baseUrl, token, wechatUin, conversationId, response.text, msg.context_token);
          } catch (sendErr) {
            log(`[weixin] send error for ${conversationId}: ${formatError(sendErr)}`);
          }
        }
      }
    } catch (err) {
      if (signal?.aborted) return;
      consecutiveFailures++;
      log(`[weixin] getUpdates error (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}): ${String(err)}`);
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        consecutiveFailures = 0;
        // oxlint-disable-next-line eslint/no-await-in-loop
        await sleep(BACKOFF_DELAY_MS, signal);
      } else {
        // oxlint-disable-next-line eslint/no-await-in-loop
        await sleep(RETRY_DELAY_MS, signal);
      }
    }
  }
}

/**
 * Start the long-poll monitor in the background (non-blocking).
 * Errors are logged via opts.log. Loop stops when abortSignal fires.
 */
export function startMonitor(opts: MonitorOptions): void {
  const { baseUrl, token, accountId, dataDir, agent, abortSignal, log } = opts;
  const logFn = log ?? ((_msg: string) => {});
  const wechatUin = crypto.randomBytes(4).toString('base64');

  void runMonitor(baseUrl, token, accountId, dataDir, agent, wechatUin, abortSignal, logFn).catch((err: unknown) => {
    if (!abortSignal?.aborted) {
      logFn(`[weixin] monitor terminated unexpectedly: ${String(err)}`);
    }
  });
}
