# Remove weixin-agent-sdk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `weixin-agent-sdk` npm dependency with a self-contained `WeixinMonitor.ts` that owns the iLink Bot long-poll loop, removing all SDK credential-file writes and env-var manipulation.

**Architecture:** A new `WeixinMonitor.ts` implements the long-poll loop and two HTTP calls (`getUpdates`, `sendMessage`) directly with `fetch`. `WeixinPlugin.ts` calls `startMonitor()` instead of the SDK's `start()`. `WeixinAdapter.ts` drops all SDK type imports and media helpers. Only text messaging is supported.

**Tech Stack:** TypeScript, Node.js built-ins (`crypto`, `fs`, `path`), `fetch` (global), Vitest 4.

---

## File Map

| Action | Path                                                   | Reason                                                    |
| ------ | ------------------------------------------------------ | --------------------------------------------------------- |
| Create | `src/process/channels/plugins/weixin/WeixinMonitor.ts` | New long-poll implementation                              |
| Create | `tests/unit/channels/weixinMonitor.test.ts`            | Tests for WeixinMonitor                                   |
| Modify | `src/process/channels/plugins/weixin/WeixinAdapter.ts` | Remove SDK types and media helpers                        |
| Modify | `tests/unit/channels/weixinAdapter.test.ts`            | Remove SDK import, media test cases, toChatResponse tests |
| Modify | `src/process/channels/plugins/weixin/WeixinPlugin.ts`  | Replace SDK with WeixinMonitor                            |
| Modify | `tests/unit/channels/weixinPlugin.test.ts`             | Update mock target and agent access                       |
| Modify | `package.json`                                         | Remove `weixin-agent-sdk` dependency                      |

---

## Task 1: Write failing tests for WeixinMonitor

**Files:**

- Create: `tests/unit/channels/weixinMonitor.test.ts`

These tests import `startMonitor` from `WeixinMonitor` (which does not exist yet) and mock `fetch` globally.

- [ ] **Step 1: Create the test file**

```typescript
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
        setTimeout(() => controller.abort(), 0);
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
```

- [ ] **Step 2: Run tests — expect module-not-found error**

```bash
bun run test -- tests/unit/channels/weixinMonitor.test.ts
```

Expected: `Cannot find module '@process/channels/plugins/weixin/WeixinMonitor'`

---

## Task 2: Create WeixinMonitor.ts

**Files:**

- Create: `src/process/channels/plugins/weixin/WeixinMonitor.ts`

Public types exported: `WeixinChatRequest`, `WeixinChatResponse`, `WeixinAgent`, `MonitorOptions`, `startMonitor`.

- [ ] **Step 1: Create the file**

```typescript
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

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

  while (!signal?.aborted) {
    try {
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
          await sleep(BACKOFF_DELAY_MS, signal);
        } else {
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

        try {
          const response = await agent.chat({ conversationId, text });
          if (response.text) {
            await callSendMessage(baseUrl, token, wechatUin, conversationId, response.text, msg.context_token);
          }
        } catch (agentErr) {
          log(`[weixin] agent or send error for ${conversationId}: ${String(agentErr)}`);
        }
      }
    } catch (err) {
      if (signal?.aborted) return;
      consecutiveFailures++;
      log(`[weixin] getUpdates error (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}): ${String(err)}`);
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        consecutiveFailures = 0;
        await sleep(BACKOFF_DELAY_MS, signal);
      } else {
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
```

- [ ] **Step 2: Run WeixinMonitor tests — expect all 6 to pass**

```bash
bun run test -- tests/unit/channels/weixinMonitor.test.ts
```

Expected: 6/6 pass

- [ ] **Step 3: Run type check**

```bash
bunx tsc --noEmit 2>&1 | grep weixin
```

Expected: no errors in the new file (other pre-existing errors in other files are acceptable)

- [ ] **Step 4: Commit**

```bash
git add src/process/channels/plugins/weixin/WeixinMonitor.ts tests/unit/channels/weixinMonitor.test.ts
git commit -m "feat(weixin): add WeixinMonitor with direct iLink Bot long-poll implementation"
```

---

## Task 3: Update weixinAdapter.test.ts and WeixinAdapter.ts

**Files:**

- Modify: `tests/unit/channels/weixinAdapter.test.ts`
- Modify: `src/process/channels/plugins/weixin/WeixinAdapter.ts`

> **Note:** These two files are updated together in one commit. Updating only the test leaves it broken (it imports `WeixinChatRequest` from a not-yet-updated adapter); updating only the adapter leaves tests broken (they still import deleted `toChatResponse`). Commit both in one step.

The test changes:

- Replace `import type { ChatRequest } from 'weixin-agent-sdk'` with `import type { WeixinChatRequest } from '@process/channels/plugins/weixin/WeixinMonitor'`
- Remove the `toChatResponse` import and its entire `describe` block (4 test cases) — `toChatResponse` is deleted
- Remove all `media`-related test cases from `toUnifiedIncomingMessage` (4 cases: image, audio, video, file) — media is out of scope
- Update `baseRequest` type from `ChatRequest` to `WeixinChatRequest` (drop `media` field)

The adapter changes:

- Replace `import type { ChatRequest, ChatResponse } from 'weixin-agent-sdk'` with `import type { WeixinChatRequest } from './WeixinMonitor'`
- Update `toUnifiedIncomingMessage(request: WeixinChatRequest)` — remove `media` handling, always return `content.type = 'text'`
- Delete `toChatResponse`, `mediaTypeToContentType`, `mediaTypeToAttachmentType`
- Keep `stripHtml`

- [ ] **Step 1: Rewrite weixinAdapter.test.ts**

```typescript
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import type { WeixinChatRequest } from '@process/channels/plugins/weixin/WeixinMonitor';
import { toUnifiedIncomingMessage } from '@process/channels/plugins/weixin/WeixinAdapter';

describe('toUnifiedIncomingMessage', () => {
  const baseRequest: WeixinChatRequest = {
    conversationId: 'user_abc123',
    text: 'Hello world',
  };

  it('maps conversationId to id, chatId, and user.id', () => {
    const msg = toUnifiedIncomingMessage(baseRequest);
    expect(msg.id).toBe('user_abc123');
    expect(msg.chatId).toBe('user_abc123');
    expect(msg.user.id).toBe('user_abc123');
  });

  it('uses last 6 chars of conversationId as displayName fallback', () => {
    const msg = toUnifiedIncomingMessage(baseRequest);
    expect(msg.user.displayName).toBe('user_abc123'.slice(-6));
  });

  it('sets platform to weixin', () => {
    const msg = toUnifiedIncomingMessage(baseRequest);
    expect(msg.platform).toBe('weixin');
  });

  it('maps text to content.text with type text', () => {
    const msg = toUnifiedIncomingMessage(baseRequest);
    expect(msg.content.type).toBe('text');
    expect(msg.content.text).toBe('Hello world');
  });

  it('provides a numeric timestamp', () => {
    const before = Date.now();
    const msg = toUnifiedIncomingMessage(baseRequest);
    expect(msg.timestamp).toBeGreaterThanOrEqual(before);
  });
});
```

- [ ] **Step 2: Rewrite WeixinAdapter.ts**

```typescript
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { WeixinChatRequest } from './WeixinMonitor';
import type { IUnifiedIncomingMessage } from '../../types';

// ==================== Inbound ====================

/**
 * Convert a WeixinChatRequest to the unified incoming message format.
 * Text-only: media attachments are not supported in this iteration.
 */
export function toUnifiedIncomingMessage(request: WeixinChatRequest): IUnifiedIncomingMessage {
  const { conversationId, text } = request;
  return {
    id: conversationId,
    platform: 'weixin',
    chatId: conversationId,
    user: {
      id: conversationId,
      displayName: conversationId.slice(-6),
    },
    content: {
      type: 'text',
      text: text ?? '',
    },
    timestamp: Date.now(),
  };
}

// ==================== Text Formatting ====================

/**
 * Strip HTML tags and decode common HTML entities to plain text.
 * WeChat does not support HTML markup, so all outgoing text must be plain.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}
```

- [ ] **Step 3: Run adapter tests — expect all 5 to pass**

```bash
bun run test -- tests/unit/channels/weixinAdapter.test.ts
```

Expected: 5/5 pass (media and toChatResponse tests have been removed)

- [ ] **Step 4: Run type check — expect WeixinPlugin.ts to have errors (toChatResponse import)**

```bash
bunx tsc --noEmit 2>&1 | grep weixin
```

Expected: errors in `WeixinPlugin.ts` about `toChatResponse` not exported from `WeixinAdapter` — these will be fixed in the next task.

- [ ] **Step 5: Commit both files together**

```bash
git add src/process/channels/plugins/weixin/WeixinAdapter.ts tests/unit/channels/weixinAdapter.test.ts
git commit -m "refactor(weixin): remove SDK types and media helpers from WeixinAdapter"
```

---

## Task 4: Update weixinPlugin.test.ts (RED)

**Files:**

- Modify: `tests/unit/channels/weixinPlugin.test.ts`

Update the mock target and agent access **before** updating `WeixinPlugin.ts`. The tests will fail after this step — that is the intended RED state.

Changes:

1. Mock `WeixinMonitor.startMonitor` instead of `weixin-agent-sdk.start`
2. Access agent via `(mockStartFn.mock.calls[0][0] as MonitorOptions).agent` in 6 places
3. Update `testConnection` test to write a buf file at `<TEST_DATA_DIR>/weixin-monitor/<accountId>.buf` instead of an accounts JSON

> **Note on `void` return:** `startMonitor` returns `void` (fire-and-forget), unlike the SDK's `start()` which returned a `Promise<void>`. The mock therefore uses `vi.fn()` with no return value. This is why `beforeEach` no longer sets `vi.fn(() => new Promise<void>(() => {}))` — that was only needed because the old SDK promise never resolved and the plugin awaited it.

- [ ] **Step 1: Rewrite weixinPlugin.test.ts**

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IChannelPluginConfig, IUnifiedOutgoingMessage } from '@process/channels/types';
import type { MonitorOptions } from '@process/channels/plugins/weixin/WeixinMonitor';
import os from 'os';
import path from 'path';
import fs from 'fs';

let mockStartFn = vi.fn();

const TEST_DATA_DIR = path.join(os.tmpdir(), 'aionui-test-weixin');

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

function createConfig(overrides?: Partial<IChannelPluginConfig['credentials']>): IChannelPluginConfig {
  const now = Date.now();
  return {
    id: 'weixin-1',
    type: 'weixin' as const,
    name: 'WeChat',
    enabled: true,
    credentials: {
      accountId: 'user_test123',
      botToken: 'tok_abc',
      baseUrl: 'https://ilinkai.weixin.qq.com',
      ...overrides,
    },
    status: 'created' as const,
    createdAt: now,
    updatedAt: now,
  };
}

describe('WeixinPlugin — initialization', () => {
  it('enters error state when credentials are missing', async () => {
    const WeixinPlugin = await loadPluginClass();
    const plugin = new WeixinPlugin();
    await expect(plugin.initialize(createConfig({ accountId: '', botToken: '' }))).rejects.toThrow();
    expect(plugin.status).toBe('error');
  });

  it('enters ready state with valid credentials', async () => {
    const WeixinPlugin = await loadPluginClass();
    const plugin = new WeixinPlugin();
    await plugin.initialize(createConfig());
    expect(plugin.status).toBe('ready');
  });
});

describe('WeixinPlugin — Promise bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStartFn = vi.fn(); // void return — no promise needed
  });

  it('emits unified message and resolves via editMessage with replyMarkup', async () => {
    const WeixinPlugin = await loadPluginClass();
    const plugin = new WeixinPlugin();
    await plugin.initialize(createConfig());

    const received: unknown[] = [];
    plugin.onMessage(async (msg) => {
      received.push(msg);
      const msgId = await plugin.sendMessage(msg.chatId, { type: 'text', text: 'partial' });
      await plugin.editMessage(msg.chatId, msgId, {
        type: 'text',
        text: 'Final answer',
        replyMarkup: { done: true },
      });
    });

    await plugin.start();

    const { agent } = mockStartFn.mock.calls[0][0] as MonitorOptions;
    const chatPromise = agent.chat({ conversationId: 'user_abc', text: 'Hello' });

    await new Promise((r) => setTimeout(r, 20));

    const response = await chatPromise;
    expect(response.text).toBe('Final answer');
    expect(received).toHaveLength(1);
  });

  it('accumulates text across multiple editMessage calls', async () => {
    const WeixinPlugin = await loadPluginClass();
    const plugin = new WeixinPlugin();
    await plugin.initialize(createConfig());

    plugin.onMessage(async (msg) => {
      const msgId = await plugin.sendMessage(msg.chatId, { type: 'text' });
      await plugin.editMessage(msg.chatId, msgId, { type: 'text', text: 'chunk 1' });
      await plugin.editMessage(msg.chatId, msgId, { type: 'text', text: 'chunk 1 chunk 2' });
      await plugin.editMessage(msg.chatId, msgId, {
        type: 'text',
        text: 'final complete text',
        replyMarkup: {},
      });
    });

    await plugin.start();
    const { agent } = mockStartFn.mock.calls[0][0] as MonitorOptions;
    const response = await agent.chat({ conversationId: 'user_abc', text: 'hi' });
    expect(response.text).toBe('final complete text');
  });

  it('rejects superseded Promise when second chat arrives before first resolves', async () => {
    const WeixinPlugin = await loadPluginClass();
    const plugin = new WeixinPlugin();
    await plugin.initialize(createConfig());
    plugin.onMessage(async () => {
      await new Promise(() => {});
    });
    await plugin.start();

    const { agent } = mockStartFn.mock.calls[0][0] as MonitorOptions;
    const first = agent.chat({ conversationId: 'user_abc', text: 'first' });
    await new Promise((r) => setTimeout(r, 0));

    const second = agent.chat({ conversationId: 'user_abc', text: 'second' });
    await expect(first).rejects.toThrow('superseded');

    const msgId = await plugin.sendMessage('user_abc', { type: 'text' });
    await plugin.editMessage('user_abc', msgId, { type: 'text', text: 'ok', replyMarkup: {} });
    await expect(second).resolves.toBeDefined();
  });

  it('rejects all pending on stop', async () => {
    const WeixinPlugin = await loadPluginClass();
    const plugin = new WeixinPlugin();
    await plugin.initialize(createConfig());
    plugin.onMessage(async () => {
      await new Promise(() => {});
    });
    await plugin.start();

    const { agent } = mockStartFn.mock.calls[0][0] as MonitorOptions;
    const chatPromise = agent.chat({ conversationId: 'user_abc', text: 'hi' });
    await new Promise((r) => setTimeout(r, 0));

    await plugin.stop();
    await expect(chatPromise).rejects.toThrow('Plugin stopped');
  });

  it('times out after 5 minutes', async () => {
    vi.useFakeTimers();
    const WeixinPlugin = await loadPluginClass();
    const plugin = new WeixinPlugin();
    await plugin.initialize(createConfig());
    plugin.onMessage(async () => {
      await new Promise(() => {});
    });
    await plugin.start();

    const { agent } = mockStartFn.mock.calls[0][0] as MonitorOptions;
    const chatPromise = agent.chat({ conversationId: 'user_abc', text: 'hi' });
    await Promise.resolve();

    const assertion = expect(chatPromise).rejects.toThrow('Response timeout');
    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 100);
    await assertion;
    vi.useRealTimers();
  });

  it('rejects immediately when _stopping is true', async () => {
    const WeixinPlugin = await loadPluginClass();
    const plugin = new WeixinPlugin();
    await plugin.initialize(createConfig());
    plugin.onMessage(async () => {});
    await plugin.start();
    await plugin.stop();

    const { agent } = mockStartFn.mock.calls[0][0] as MonitorOptions;
    await expect(agent.chat({ conversationId: 'u', text: 'hi' })).rejects.toThrow('Plugin stopped');
  });
});

describe('WeixinPlugin — testConnection', () => {
  it('returns false when buf file does not exist', async () => {
    const WeixinPlugin = await loadPluginClass();
    const result = await WeixinPlugin.testConnection('nonexistent_account_id_xyz');
    expect(result.success).toBe(false);
  });

  it('returns true when buf file exists at <dataDir>/weixin-monitor/<accountId>.buf', async () => {
    const WeixinPlugin = await loadPluginClass();
    const monitorDir = path.join(TEST_DATA_DIR, 'weixin-monitor');
    fs.mkdirSync(monitorDir, { recursive: true });
    const bufFile = path.join(monitorDir, 'test_acc_valid.buf');
    fs.writeFileSync(bufFile, 'some-buf-value');

    const result = await WeixinPlugin.testConnection('test_acc_valid');
    expect(result.success).toBe(true);

    fs.unlinkSync(bufFile);
  });
});
```

- [ ] **Step 2: Run tests — expect Promise bridge tests to fail (mock never called)**

```bash
bun run test -- tests/unit/channels/weixinPlugin.test.ts
```

Expected: Promise bridge tests fail because `WeixinPlugin.ts` still calls `start()` from `weixin-agent-sdk` — `mockStartFn` is never invoked so `mockStartFn.mock.calls[0][0]` is undefined.

- [ ] **Step 3: Commit the failing test update**

> **Note:** After this commit, `WeixinPlugin.ts` still imports `toChatResponse` from `WeixinAdapter`, which was deleted in Task 3. The type check will continue to report errors in `WeixinPlugin.ts`. That is expected and is resolved in Task 5.

```bash
git add tests/unit/channels/weixinPlugin.test.ts
git commit -m "test(weixin): migrate weixinPlugin tests to WeixinMonitor mock (RED)"
```

---

## Task 5: Update WeixinPlugin.ts (GREEN)

**Files:**

- Modify: `src/process/channels/plugins/weixin/WeixinPlugin.ts`

Key changes:

- Remove SDK imports (`start`, `Agent`, `ChatRequest`, `ChatResponse`)
- Add `startMonitor` import from `./WeixinMonitor` and types `WeixinChatRequest`, `WeixinChatResponse`
- Remove `toChatResponse` from `WeixinAdapter` import (deleted in Task 3)
- Add `baseUrl` instance field (stored in `onInitialize`, passed to `startMonitor`)
- Remove `_weixinStateDir` getter and all `openclaw-weixin/` file writes
- Remove `OPENCLAW_STATE_DIR` env manipulation
- Update `PendingResponse`: remove `mediaResponse` field, change `resolve` type to `(response: WeixinChatResponse) => void`
- Rewrite `onInitialize` — no FS writes, stores `accountId`, `botToken`, `baseUrl`
- Rewrite `onStart` — calls `startMonitor()`
- Update `editMessage` — remove `if (message.type === 'image' || message.type === 'file')` branch and `media` field in `pending.resolve()` call
- Update `handleChat` signature: `(request: WeixinChatRequest): Promise<WeixinChatResponse>`
- Rewrite `testConnection` — check for `<dataDir>/weixin-monitor/<accountId>.buf`

- [ ] **Step 1: Rewrite WeixinPlugin.ts**

```typescript
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';

import { getPlatformServices } from '@/common/platform';
import type { IChannelPluginConfig, IUnifiedOutgoingMessage, PluginType } from '../../types';
import { BasePlugin } from '../BasePlugin';
import { toUnifiedIncomingMessage, stripHtml } from './WeixinAdapter';
import { startMonitor } from './WeixinMonitor';
import type { WeixinChatRequest, WeixinChatResponse } from './WeixinMonitor';

const RESPONSE_TIMEOUT_MS = 5 * 60 * 1000;

interface PendingResponse {
  resolve: (response: WeixinChatResponse) => void;
  reject: (error: Error) => void;
  accumulatedText: string;
  timer: ReturnType<typeof setTimeout>;
}

export class WeixinPlugin extends BasePlugin {
  readonly type: PluginType = 'weixin';

  private accountId = '';
  private botToken = '';
  private baseUrl = 'https://ilinkai.weixin.qq.com';
  private abortController: AbortController | null = null;
  private _stopping = false;
  private pendingResponses = new Map<string, PendingResponse>();
  private activeUsers = new Set<string>();

  // ==================== Lifecycle ====================

  protected async onInitialize(config: IChannelPluginConfig): Promise<void> {
    const { accountId, botToken, baseUrl } = config.credentials ?? {};
    if (!accountId || !botToken) {
      throw new Error('WeChat accountId and botToken are required');
    }
    this.accountId = accountId as string;
    this.botToken = botToken as string;
    this.baseUrl = (baseUrl as string | undefined) ?? 'https://ilinkai.weixin.qq.com';
  }

  protected async onStart(): Promise<void> {
    this._stopping = false;
    this.abortController = new AbortController();
    startMonitor({
      baseUrl: this.baseUrl,
      token: this.botToken,
      accountId: this.accountId,
      dataDir: getPlatformServices().paths.getDataDir(),
      agent: { chat: (req) => this.handleChat(req) },
      abortSignal: this.abortController.signal,
      log: (msg) => console.log(msg),
    });
  }

  protected async onStop(): Promise<void> {
    this._stopping = true;

    for (const [chatId, pending] of this.pendingResponses.entries()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Plugin stopped'));
      this.pendingResponses.delete(chatId);
    }

    this.abortController?.abort();
    this.abortController = null;
    this.activeUsers.clear();
  }

  // ==================== BasePlugin interface ====================

  async sendMessage(chatId: string, message: IUnifiedOutgoingMessage): Promise<string> {
    const pending = this.pendingResponses.get(chatId);
    if (pending && message.text) {
      pending.accumulatedText = stripHtml(message.text);
    }
    return `weixin_pending_${chatId}`;
  }

  async editMessage(chatId: string, _messageId: string, message: IUnifiedOutgoingMessage): Promise<void> {
    const pending = this.pendingResponses.get(chatId);
    if (!pending) return;

    if (message.text) {
      pending.accumulatedText = message.text;
    }

    if (message.replyMarkup !== undefined) {
      clearTimeout(pending.timer);
      this.pendingResponses.delete(chatId);
      pending.resolve({ text: pending.accumulatedText || undefined });
    }
  }

  getActiveUserCount(): number {
    return this.activeUsers.size;
  }

  getBotInfo(): { username?: string; displayName?: string } | null {
    return { displayName: 'Aion Assistant' };
  }

  // ==================== Promise bridge ====================

  private handleChat(request: WeixinChatRequest): Promise<WeixinChatResponse> {
    if (this._stopping) {
      return Promise.reject(new Error('Plugin stopped'));
    }

    const { conversationId } = request;
    this.activeUsers.add(conversationId);

    const existing = this.pendingResponses.get(conversationId);
    if (existing) {
      clearTimeout(existing.timer);
      existing.reject(new Error('superseded'));
      this.pendingResponses.delete(conversationId);
    }

    return new Promise<WeixinChatResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingResponses.delete(conversationId);
        reject(new Error('Response timeout'));
      }, RESPONSE_TIMEOUT_MS);

      this.pendingResponses.set(conversationId, {
        resolve,
        reject,
        accumulatedText: '',
        timer,
      });

      const unified = toUnifiedIncomingMessage(request);
      this.emitMessage(unified)
        .then(() => {
          const pending = this.pendingResponses.get(conversationId);
          if (pending) {
            clearTimeout(pending.timer);
            this.pendingResponses.delete(conversationId);
            pending.resolve({ text: pending.accumulatedText || undefined });
          }
        })
        .catch((error: unknown) => {
          clearTimeout(timer);
          this.pendingResponses.delete(conversationId);
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  }

  // ==================== Static ====================

  static async testConnection(accountId: string, _botToken?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const stateDir = getPlatformServices().paths.getDataDir();
      const bufFile = path.join(stateDir, 'weixin-monitor', `${accountId}.buf`);
      fs.accessSync(bufFile);
      return { success: true };
    } catch {
      return { success: false, error: `No sync buf found for accountId: ${accountId}` };
    }
  }
}
```

- [ ] **Step 2: Run weixinPlugin tests — expect all 10 to pass**

```bash
bun run test -- tests/unit/channels/weixinPlugin.test.ts
```

Expected: 10/10 pass

- [ ] **Step 3: Run type check**

```bash
bunx tsc --noEmit 2>&1 | grep weixin
```

Expected: no output

- [ ] **Step 4: Commit**

```bash
git add src/process/channels/plugins/weixin/WeixinPlugin.ts
git commit -m "refactor(weixin): replace weixin-agent-sdk with WeixinMonitor in WeixinPlugin"
```

---

## Task 6: Remove SDK dependency and final verification

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Remove weixin-agent-sdk from package.json**

Open `package.json` and delete the line containing `"weixin-agent-sdk"` from the `dependencies` section.

- [ ] **Step 2: Update lockfile**

```bash
bun install
```

Expected: `bun.lock` updated, `node_modules/weixin-agent-sdk` removed

- [ ] **Step 3: Verify no remaining SDK imports**

```bash
grep -r "weixin-agent-sdk" src/ tests/
```

Expected: no output

- [ ] **Step 4: Run full test suite**

```bash
bun run test
```

Expected: all weixin tests pass, no regressions

- [ ] **Step 5: Run type check**

```bash
bunx tsc --noEmit
```

Expected: zero errors

- [ ] **Step 6: Run linter**

```bash
bun run lint:fix
```

Expected: no new lint errors

- [ ] **Step 7: Commit**

```bash
git add package.json bun.lock
git commit -m "chore(weixin): remove weixin-agent-sdk dependency"
```

---

## Done

All weixin channel functionality now lives entirely within `src/process/channels/plugins/weixin/`. The SDK is gone. Run `bun run test` to confirm the final state.
