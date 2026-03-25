# WeChat Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate `weixin-agent-sdk` into AionUi's channel plugin system so WeChat users can chat with the Aion AI assistant.

**Architecture:** `WeixinPlugin` extends `BasePlugin` and acts as a Promise bridge between the SDK's synchronous `agent.chat()` model and AionUi's event-driven plugin system. `WeixinAdapter` handles stateless message format conversion. `WeixinLogin` implements the QR-code login HTTP flow independently (the SDK's built-in `login()` only prints to terminal). `WeixinLoginHandler` wires the login flow into Electron's IPC system.

**Tech Stack:** `weixin-agent-sdk` (npm), Vitest (tests), Electron `ipcMain`/`ipcRenderer`, TypeScript strict mode.

**Spec:** `docs/superpowers/specs/2026-03-23-weixin-plugin-design.md`

---

## File Map

| File                                                        | Action | Responsibility                                                                   |
| ----------------------------------------------------------- | ------ | -------------------------------------------------------------------------------- |
| `src/process/channels/plugins/weixin/WeixinAdapter.ts`      | Create | Stateless conversion: `ChatRequest` ↔ `IUnified*`                                |
| `src/process/channels/plugins/weixin/WeixinLogin.ts`        | Create | HTTP QR-code login flow (two endpoints)                                          |
| `src/process/channels/plugins/weixin/WeixinPlugin.ts`       | Create | `BasePlugin` subclass + Promise bridge                                           |
| `src/process/channels/plugins/weixin/WeixinLoginHandler.ts` | Create | Electron IPC handler for login events                                            |
| `src/process/channels/plugins/weixin/index.ts`              | Create | Re-exports for the weixin module                                                 |
| `src/process/channels/types.ts`                             | Modify | Add `'weixin'` to `BuiltinPluginType`, `hasPluginCredentials`, `shortPlatform`   |
| `src/process/channels/plugins/index.ts`                     | Modify | Export `WeixinPlugin` and adapter                                                |
| `src/process/channels/index.ts`                             | Modify | Export `WeixinPlugin`                                                            |
| `src/process/channels/core/ChannelManager.ts`               | Modify | `registerPlugin('weixin', WeixinPlugin)`                                         |
| `src/process/bridge/weixinLoginBridge.ts`                   | Create | `initWeixinLoginBridge()` — registers `ipcMain` handlers                         |
| `src/process/bridge/index.ts`                               | Modify | Import, call, and re-export `initWeixinLoginBridge`                              |
| `src/preload.ts`                                            | Modify | Expose `weixin:login:*` IPC to renderer (insert before closing `});` at line 47) |
| `tests/unit/channels/weixinAdapter.test.ts`                 | Create | Unit tests for adapter functions                                                 |
| `tests/unit/channels/weixinLogin.test.ts`                   | Create | Unit tests for QR login state machine                                            |
| `tests/unit/channels/weixinPlugin.test.ts`                  | Create | Unit tests for plugin lifecycle + Promise bridge                                 |
| `tests/unit/channels/weixinLoginHandler.test.ts`            | Create | Unit tests for IPC handler                                                       |

---

## Task 1: Install SDK Dependency

**Files:**

- Modify: `package.json` (via bun)

- [ ] **Step 1: Install weixin-agent-sdk**

```bash
bun add weixin-agent-sdk
```

Expected: `weixin-agent-sdk` appears in `package.json` `dependencies`.

- [ ] **Step 2: Verify types are available**

```bash
bunx tsc --noEmit 2>&1 | grep weixin | head -5
```

Expected: no errors about missing types.

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lockb
git commit -m "chore: add weixin-agent-sdk dependency"
```

---

## Task 2: Update Channel Types

**Files:**

- Modify: `src/process/channels/types.ts`

- [ ] **Step 1: Add `'weixin'` to `BuiltinPluginType`**

In `src/process/channels/types.ts`, find:

```typescript
export type BuiltinPluginType = 'telegram' | 'slack' | 'discord' | 'lark' | 'dingtalk';
```

Replace with:

```typescript
export type BuiltinPluginType = 'telegram' | 'slack' | 'discord' | 'lark' | 'dingtalk' | 'weixin';
```

- [ ] **Step 2: Add weixin case to `hasPluginCredentials`**

In `src/process/channels/types.ts`, inside `hasPluginCredentials`, after:

```typescript
if (type === 'telegram') return !!credentials.token;
```

and **before** the fallback `return Object.values(...)` line, insert:

```typescript
if (type === 'weixin') return !!(credentials.accountId && credentials.botToken);
```

- [ ] **Step 3: Add `'wx'` to `shortPlatform` local variable**

Inside the `getChannelConversationName` function body (around line 564), find the local variable:

```typescript
const shortPlatform: Record<string, string> = { telegram: 'tg', dingtalk: 'ding' };
```

Replace with:

```typescript
const shortPlatform: Record<string, string> = { telegram: 'tg', dingtalk: 'ding', weixin: 'wx' };
```

- [ ] **Step 4: Verify no type errors**

```bash
bunx tsc --noEmit 2>&1 | head -20
```

Expected: no output (no errors).

- [ ] **Step 5: Commit**

```bash
git add src/process/channels/types.ts
git commit -m "feat(weixin): add weixin to BuiltinPluginType and hasPluginCredentials"
```

---

## Task 3: WeixinAdapter (TDD)

**Files:**

- Create: `src/process/channels/plugins/weixin/WeixinAdapter.ts`
- Create: `tests/unit/channels/weixinAdapter.test.ts`

- [ ] **Step 1: Write all failing tests (both `toUnifiedIncomingMessage` and `toChatResponse`)**

Create `tests/unit/channels/weixinAdapter.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import type { ChatRequest } from 'weixin-agent-sdk';
import { toUnifiedIncomingMessage, toChatResponse } from '@process/channels/plugins/weixin/WeixinAdapter';
import type { IUnifiedOutgoingMessage } from '@process/channels/types';

// ==================== toUnifiedIncomingMessage ====================

describe('toUnifiedIncomingMessage', () => {
  const baseRequest: ChatRequest = {
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

  it('maps image media to photo attachment', () => {
    const req: ChatRequest = {
      conversationId: 'user_abc123',
      text: '',
      media: { type: 'image', filePath: '/tmp/photo.jpg', mimeType: 'image/jpeg' },
    };
    const msg = toUnifiedIncomingMessage(req);
    expect(msg.content.type).toBe('photo');
    expect(msg.content.attachments?.[0].type).toBe('photo');
    expect(msg.content.attachments?.[0].fileId).toBe('/tmp/photo.jpg');
    expect(msg.content.attachments?.[0].mimeType).toBe('image/jpeg');
  });

  it('maps audio media to audio attachment', () => {
    const req: ChatRequest = {
      conversationId: 'user_abc123',
      text: '',
      media: { type: 'audio', filePath: '/tmp/voice.wav', mimeType: 'audio/wav' },
    };
    const msg = toUnifiedIncomingMessage(req);
    expect(msg.content.type).toBe('audio');
    expect(msg.content.attachments?.[0].type).toBe('audio');
  });

  it('maps video media to video attachment', () => {
    const req: ChatRequest = {
      conversationId: 'user_abc123',
      text: '',
      media: { type: 'video', filePath: '/tmp/video.mp4', mimeType: 'video/mp4' },
    };
    const msg = toUnifiedIncomingMessage(req);
    expect(msg.content.type).toBe('video');
    expect(msg.content.attachments?.[0].type).toBe('video');
  });

  it('maps file media to document attachment with fileName', () => {
    const req: ChatRequest = {
      conversationId: 'user_abc123',
      text: '',
      media: { type: 'file', filePath: '/tmp/doc.pdf', mimeType: 'application/pdf', fileName: 'doc.pdf' },
    };
    const msg = toUnifiedIncomingMessage(req);
    expect(msg.content.type).toBe('document');
    expect(msg.content.attachments?.[0].type).toBe('document');
    expect(msg.content.attachments?.[0].fileName).toBe('doc.pdf');
  });
});

// ==================== toChatResponse ====================

describe('toChatResponse', () => {
  it('maps text message', () => {
    const msg: IUnifiedOutgoingMessage = { type: 'text', text: 'Hello' };
    const resp = toChatResponse(msg);
    expect(resp.text).toBe('Hello');
    expect(resp.media).toBeUndefined();
  });

  it('maps image message', () => {
    const msg: IUnifiedOutgoingMessage = { type: 'image', imageUrl: 'https://example.com/pic.jpg' };
    const resp = toChatResponse(msg);
    expect(resp.media?.type).toBe('image');
    expect(resp.media?.url).toBe('https://example.com/pic.jpg');
  });

  it('maps file message with fileName', () => {
    const msg: IUnifiedOutgoingMessage = { type: 'file', fileUrl: '/tmp/doc.pdf', fileName: 'doc.pdf' };
    const resp = toChatResponse(msg);
    expect(resp.media?.type).toBe('file');
    expect(resp.media?.url).toBe('/tmp/doc.pdf');
    expect(resp.media?.fileName).toBe('doc.pdf');
  });

  it('ignores buttons and replyMarkup', () => {
    const msg: IUnifiedOutgoingMessage = {
      type: 'buttons',
      text: 'Choose',
      buttons: [[{ label: 'Yes', action: 'yes' }]],
    };
    const resp = toChatResponse(msg);
    expect(resp.text).toBe('Choose');
    expect(resp.media).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
bun run test tests/unit/channels/weixinAdapter.test.ts 2>&1 | tail -10
```

Expected: `FAIL` — `Cannot find module '@process/channels/plugins/weixin/WeixinAdapter'`.

- [ ] **Step 3: Implement `WeixinAdapter`**

Create `src/process/channels/plugins/weixin/WeixinAdapter.ts`:

```typescript
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ChatRequest, ChatResponse } from 'weixin-agent-sdk';
import type { AttachmentType, IUnifiedIncomingMessage, IUnifiedOutgoingMessage, MessageContentType } from '../../types';

// ==================== Inbound ====================

/**
 * Convert SDK ChatRequest to unified incoming message format
 */
export function toUnifiedIncomingMessage(request: ChatRequest): IUnifiedIncomingMessage {
  const { conversationId, text, media } = request;

  const contentType = mediaTypeToContentType(media?.type);
  const attachments = media
    ? [
        {
          type: mediaTypeToAttachmentType(media.type),
          fileId: media.filePath,
          mimeType: media.mimeType,
          fileName: media.fileName,
        },
      ]
    : undefined;

  return {
    id: conversationId,
    platform: 'weixin',
    chatId: conversationId,
    user: {
      id: conversationId,
      displayName: conversationId.slice(-6),
    },
    content: {
      type: contentType,
      text: text || '',
      attachments,
    },
    timestamp: Date.now(),
  };
}

function mediaTypeToContentType(type?: string): MessageContentType {
  switch (type) {
    case 'image':
      return 'photo';
    case 'audio':
      return 'audio';
    case 'video':
      return 'video';
    case 'file':
      return 'document';
    default:
      return 'text';
  }
}

function mediaTypeToAttachmentType(type: string): AttachmentType {
  switch (type) {
    case 'image':
      return 'photo';
    case 'audio':
      return 'audio';
    case 'video':
      return 'video';
    default:
      return 'document';
  }
}

// ==================== Outbound ====================

/**
 * Convert unified outgoing message to SDK ChatResponse format.
 * Buttons and replyMarkup are ignored (iLink Bot does not support interactive cards).
 */
export function toChatResponse(message: IUnifiedOutgoingMessage): ChatResponse {
  const response: ChatResponse = {};

  if (message.text) {
    response.text = message.text;
  }

  if (message.type === 'image' && message.imageUrl) {
    response.media = { type: 'image', url: message.imageUrl };
  } else if (message.type === 'file' && message.fileUrl) {
    response.media = { type: 'file', url: message.fileUrl, fileName: message.fileName };
  }

  return response;
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
bun run test tests/unit/channels/weixinAdapter.test.ts 2>&1 | tail -15
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/process/channels/plugins/weixin/WeixinAdapter.ts tests/unit/channels/weixinAdapter.test.ts
git commit -m "feat(weixin): add WeixinAdapter with message format conversion"
```

---

## Task 4: WeixinLogin (TDD — QR Login State Machine)

**Files:**

- Create: `src/process/channels/plugins/weixin/WeixinLogin.ts`
- Create: `tests/unit/channels/weixinLogin.test.ts`

- [ ] **Step 1: Write failing tests for login state machine**

Create `tests/unit/channels/weixinLogin.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock https before importing WeixinLogin
vi.mock('https', () => ({
  default: {
    request: vi.fn(),
  },
}));

import https from 'https';
import { startLogin } from '@process/channels/plugins/weixin/WeixinLogin';

type MockRequestCallback = (res: {
  on: (event: string, cb: (data?: unknown) => void) => void;
  statusCode?: number;
}) => void;

function mockHttpsPost(responses: Array<Record<string, unknown>>) {
  let callIndex = 0;
  vi.mocked(https.request).mockImplementation((_options, callback) => {
    const responseData = responses[callIndex++] ?? {};
    const mockReq = {
      write: vi.fn(),
      end: vi.fn(() => {
        // Simulate async response
        setTimeout(() => {
          const cb = callback as MockRequestCallback;
          const mockRes = {
            on: (event: string, handler: (data?: unknown) => void) => {
              if (event === 'data') handler(JSON.stringify(responseData));
              if (event === 'end') handler();
            },
          };
          cb(mockRes);
        }, 0);
      }),
      on: vi.fn(),
      setTimeout: vi.fn(),
    };
    return mockReq as unknown as ReturnType<typeof https.request>;
  });
}

describe('startLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls onQR with qrcode_url from first API response', async () => {
    mockHttpsPost([
      { qrcode_url: 'https://qr.weixin.qq.com/abc', ticket: 'ticket_1' },
      { status: 'confirmed', botToken: 'tok_test', baseUrl: 'https://base.url', userId: 'user_123' },
    ]);

    const onQR = vi.fn();
    const onScanned = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    const handle = startLogin({ onQR, onScanned, onDone, onError });
    await new Promise((r) => setTimeout(r, 50));

    expect(onQR).toHaveBeenCalledWith('https://qr.weixin.qq.com/abc');
    expect(onDone).toHaveBeenCalledWith({
      accountId: 'user_123',
      botToken: 'tok_test',
      baseUrl: 'https://base.url',
    });
    handle.abort();
  });

  it('calls onScanned when status is scaned', async () => {
    mockHttpsPost([
      { qrcode_url: 'https://qr.example.com/x', ticket: 't1' },
      { status: 'scaned' },
      { status: 'confirmed', botToken: 'tok', baseUrl: 'https://b.url', userId: 'u1' },
    ]);

    const onScanned = vi.fn();
    const onDone = vi.fn();
    const handle = startLogin({ onQR: vi.fn(), onScanned, onDone, onError: vi.fn() });
    await new Promise((r) => setTimeout(r, 100));

    expect(onScanned).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    handle.abort();
  });

  it('re-fetches QR code when status is expired', async () => {
    const onQR = vi.fn();
    mockHttpsPost([
      { qrcode_url: 'https://qr1.example.com', ticket: 't1' },
      { status: 'expired' },
      { qrcode_url: 'https://qr2.example.com', ticket: 't2' },
      { status: 'confirmed', botToken: 'tok', baseUrl: 'https://b.url', userId: 'u1' },
    ]);

    const onDone = vi.fn();
    const handle = startLogin({ onQR, onScanned: vi.fn(), onDone, onError: vi.fn() });
    await new Promise((r) => setTimeout(r, 100));

    expect(onQR).toHaveBeenCalledTimes(2);
    expect(onQR).toHaveBeenNthCalledWith(2, 'https://qr2.example.com');
    expect(onDone).toHaveBeenCalledTimes(1);
    handle.abort();
  });

  it('calls onError after 3 expired responses', async () => {
    mockHttpsPost([
      { qrcode_url: 'https://qr1', ticket: 't1' },
      { status: 'expired' },
      { qrcode_url: 'https://qr2', ticket: 't2' },
      { status: 'expired' },
      { qrcode_url: 'https://qr3', ticket: 't3' },
      { status: 'expired' },
    ]);

    const onError = vi.fn();
    const handle = startLogin({ onQR: vi.fn(), onScanned: vi.fn(), onDone: vi.fn(), onError });
    await new Promise((r) => setTimeout(r, 200));

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    handle.abort();
  });

  it('abort() stops the flow without calling onError', async () => {
    // never-resolving poll
    vi.mocked(https.request).mockImplementation((_options, _callback) => {
      return {
        write: vi.fn(),
        end: vi.fn(),
        on: vi.fn(),
        setTimeout: vi.fn(),
      } as unknown as ReturnType<typeof https.request>;
    });

    const onError = vi.fn();
    const handle = startLogin({ onQR: vi.fn(), onScanned: vi.fn(), onDone: vi.fn(), onError });
    handle.abort();
    await new Promise((r) => setTimeout(r, 50));

    expect(onError).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
bun run test tests/unit/channels/weixinLogin.test.ts 2>&1 | tail -10
```

Expected: `FAIL` — `Cannot find module '@process/channels/plugins/weixin/WeixinLogin'`.

- [ ] **Step 3: Implement `WeixinLogin`**

Create `src/process/channels/plugins/weixin/WeixinLogin.ts`:

```typescript
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import https from 'https';

const DEFAULT_BASE_URL = 'https://ilinkai.weixin.qq.com';
const POLL_TIMEOUT_MS = 35_000;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_QR_RETRIES = 3;

export interface LoginCallbacks {
  onQR: (qrcodeUrl: string) => void;
  onScanned: () => void;
  onDone: (result: { accountId: string; botToken: string; baseUrl: string }) => void;
  onError: (error: Error) => void;
}

export interface LoginHandle {
  abort: () => void;
}

/**
 * Start the WeChat QR-code login flow.
 * Calls two WeChat iLink Bot API endpoints directly (SDK login() is terminal-only).
 */
export function startLogin(callbacks: LoginCallbacks): LoginHandle {
  const abortController = new AbortController();

  void runLoginFlow(callbacks, abortController.signal).catch((error) => {
    if (!abortController.signal.aborted) {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
  });

  return { abort: () => abortController.abort() };
}

async function runLoginFlow(callbacks: LoginCallbacks, signal: AbortSignal): Promise<void> {
  let qrRetries = 0;

  while (qrRetries < MAX_QR_RETRIES) {
    if (signal.aborted) return;

    const qrResult = await post<{ qrcode_url: string; ticket: string }>(
      DEFAULT_BASE_URL,
      'ilink/bot/get_bot_qrcode',
      {},
      signal
    );
    callbacks.onQR(qrResult.qrcode_url);

    const pollResult = await pollQRStatus(qrResult.ticket, callbacks, signal);

    if (pollResult === 'expired') {
      qrRetries++;
      continue;
    }
    if (pollResult === 'aborted') return;

    callbacks.onDone(pollResult as { accountId: string; botToken: string; baseUrl: string });
    return;
  }

  callbacks.onError(new Error('QR code expired too many times'));
}

type PollResult = 'expired' | 'aborted' | { accountId: string; botToken: string; baseUrl: string };

async function pollQRStatus(ticket: string, callbacks: LoginCallbacks, signal: AbortSignal): Promise<PollResult> {
  while (!signal.aborted) {
    const result = await post<{
      status: 'wait' | 'scaned' | 'expired' | 'confirmed';
      botToken?: string;
      baseUrl?: string;
      userId?: string;
    }>(DEFAULT_BASE_URL, 'ilink/bot/get_qrcode_status', { ticket }, signal, POLL_TIMEOUT_MS);

    switch (result.status) {
      case 'wait':
        break;
      case 'scaned':
        callbacks.onScanned();
        break;
      case 'expired':
        return 'expired';
      case 'confirmed':
        if (!result.botToken || !result.userId) {
          throw new Error('Missing botToken or userId in confirmed response');
        }
        return {
          accountId: result.userId,
          botToken: result.botToken,
          baseUrl: result.baseUrl || DEFAULT_BASE_URL,
        };
    }
  }

  return 'aborted';
}

function post<T>(
  baseUrl: string,
  path: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
  timeoutMs: number = REQUEST_TIMEOUT_MS
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('Aborted'));
      return;
    }

    const data = JSON.stringify(body);
    const url = new URL(path, baseUrl);
    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data).toString(),
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw) as T);
        } catch {
          reject(new Error(`Invalid JSON response from ${path}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timeout: ${path}`)));

    const onAbort = () => req.destroy(new Error('Aborted'));
    signal.addEventListener('abort', onAbort, { once: true });
    req.on('close', () => signal.removeEventListener('abort', onAbort));

    req.write(data);
    req.end();
  });
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
bun run test tests/unit/channels/weixinLogin.test.ts 2>&1 | tail -15
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/process/channels/plugins/weixin/WeixinLogin.ts tests/unit/channels/weixinLogin.test.ts
git commit -m "feat(weixin): add WeixinLogin QR-code login flow with tests"
```

---

## Task 5: WeixinPlugin (TDD — Promise Bridge)

**Files:**

- Create: `src/process/channels/plugins/weixin/WeixinPlugin.ts`
- Create: `tests/unit/channels/weixinPlugin.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/channels/weixinPlugin.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IChannelPluginConfig, IUnifiedOutgoingMessage } from '@process/channels/types';
import os from 'os';
import path from 'path';
import fs from 'fs';

let mockStartFn = vi.fn();

async function loadPluginClass() {
  vi.resetModules();
  vi.doMock('weixin-agent-sdk', () => ({
    start: (...args: unknown[]) => mockStartFn(...args),
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
    mockStartFn = vi.fn(() => new Promise<void>(() => {})); // never resolves
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

    const agentArg = mockStartFn.mock.calls[0][0];
    const chatPromise = agentArg.chat({ conversationId: 'user_abc', text: 'Hello' });

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
    const agent = mockStartFn.mock.calls[0][0];
    const response = await agent.chat({ conversationId: 'user_abc', text: 'hi' });
    expect(response.text).toBe('final complete text');
  });

  it('rejects superseded Promise when second chat arrives before first resolves', async () => {
    const WeixinPlugin = await loadPluginClass();
    const plugin = new WeixinPlugin();
    await plugin.initialize(createConfig());
    plugin.onMessage(async () => {}); // leave pending
    await plugin.start();

    const agent = mockStartFn.mock.calls[0][0];
    const first = agent.chat({ conversationId: 'user_abc', text: 'first' });
    await new Promise((r) => setTimeout(r, 0));

    const second = agent.chat({ conversationId: 'user_abc', text: 'second' });
    await expect(first).rejects.toThrow('superseded');

    // resolve second
    const msgId = await plugin.sendMessage('user_abc', { type: 'text' });
    await plugin.editMessage('user_abc', msgId, { type: 'text', text: 'ok', replyMarkup: {} });
    await expect(second).resolves.toBeDefined();
  });

  it('rejects all pending on stop', async () => {
    const WeixinPlugin = await loadPluginClass();
    const plugin = new WeixinPlugin();
    await plugin.initialize(createConfig());
    plugin.onMessage(async () => {}); // leave pending
    await plugin.start();

    const agent = mockStartFn.mock.calls[0][0];
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
    plugin.onMessage(async () => {});
    await plugin.start();

    const agent = mockStartFn.mock.calls[0][0];
    const chatPromise = agent.chat({ conversationId: 'user_abc', text: 'hi' });
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 100);
    await expect(chatPromise).rejects.toThrow('Response timeout');
    vi.useRealTimers();
  });

  it('rejects immediately when _stopping is true', async () => {
    const WeixinPlugin = await loadPluginClass();
    const plugin = new WeixinPlugin();
    await plugin.initialize(createConfig());
    plugin.onMessage(async () => {});
    await plugin.start();
    await plugin.stop();

    const agent = mockStartFn.mock.calls[0][0];
    await expect(agent.chat({ conversationId: 'u', text: 'hi' })).rejects.toThrow('Plugin stopped');
  });
});

describe('WeixinPlugin — testConnection', () => {
  it('returns false when credential file does not exist', async () => {
    const WeixinPlugin = await loadPluginClass();
    const result = await WeixinPlugin.testConnection('nonexistent_account_id_xyz');
    expect(result.success).toBe(false);
  });

  it('returns true when credential file exists with a token', async () => {
    const WeixinPlugin = await loadPluginClass();
    const accountsDir = path.join(os.homedir(), '.openclaw', 'openclaw-weixin', 'accounts');
    fs.mkdirSync(accountsDir, { recursive: true });
    const accountFile = path.join(accountsDir, 'test_acc_valid.json');
    fs.writeFileSync(accountFile, JSON.stringify({ token: 'tok_test', baseUrl: 'https://x.com' }));

    const result = await WeixinPlugin.testConnection('test_acc_valid', 'tok_test');
    expect(result.success).toBe(true);

    fs.unlinkSync(accountFile);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
bun run test tests/unit/channels/weixinPlugin.test.ts 2>&1 | tail -10
```

Expected: `FAIL` — `Cannot find module`.

- [ ] **Step 3: Implement `WeixinPlugin`**

Create `src/process/channels/plugins/weixin/WeixinPlugin.ts`:

```typescript
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { start } from 'weixin-agent-sdk';
import type { Agent, ChatRequest, ChatResponse } from 'weixin-agent-sdk';
import fs from 'fs';
import os from 'os';
import path from 'path';

import type { IChannelPluginConfig, IUnifiedOutgoingMessage, PluginType } from '../../types';
import { BasePlugin } from '../BasePlugin';
import { toUnifiedIncomingMessage, toChatResponse } from './WeixinAdapter';

const RESPONSE_TIMEOUT_MS = 5 * 60 * 1000;

interface PendingResponse {
  resolve: (response: ChatResponse) => void;
  reject: (error: Error) => void;
  accumulatedText: string;
  mediaResponse?: ChatResponse['media'];
  timer: ReturnType<typeof setTimeout>;
}

export class WeixinPlugin extends BasePlugin {
  readonly type: PluginType = 'weixin';

  private accountId = '';
  private botToken = '';
  private abortController: AbortController | null = null;
  private _stopping = false;
  private pendingResponses = new Map<string, PendingResponse>();
  private activeUsers = new Set<string>();

  // ==================== Lifecycle ====================

  protected async onInitialize(config: IChannelPluginConfig): Promise<void> {
    const { accountId, botToken } = config.credentials ?? {};
    if (!accountId || !botToken) {
      throw new Error('WeChat accountId and botToken are required');
    }
    this.accountId = accountId as string;
    this.botToken = botToken as string;
  }

  protected async onStart(): Promise<void> {
    this._stopping = false;
    this.abortController = new AbortController();

    const agent: Agent = { chat: (req) => this.handleChat(req) };

    void start(agent, {
      accountId: this.accountId,
      botToken: this.botToken,
      abortSignal: this.abortController.signal,
    }).catch((error: unknown) => {
      if (!this.abortController?.signal.aborted) {
        this.setStatus('error', error instanceof Error ? error.message : String(error));
      }
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

  async sendMessage(chatId: string, _message: IUnifiedOutgoingMessage): Promise<string> {
    return `weixin_pending_${chatId}`;
  }

  async editMessage(chatId: string, _messageId: string, message: IUnifiedOutgoingMessage): Promise<void> {
    const pending = this.pendingResponses.get(chatId);
    if (!pending) return;

    if (message.text) {
      pending.accumulatedText = message.text;
    }

    if (message.type === 'image' || message.type === 'file') {
      pending.mediaResponse = toChatResponse(message).media;
    }

    if (message.replyMarkup !== undefined) {
      clearTimeout(pending.timer);
      this.pendingResponses.delete(chatId);
      pending.resolve({
        text: pending.accumulatedText || undefined,
        media: pending.mediaResponse,
      });
    }
  }

  getActiveUserCount(): number {
    return this.activeUsers.size;
  }

  getBotInfo(): { id: string; username?: string; displayName: string } | null {
    return { id: this.accountId, displayName: 'Aion Assistant' };
  }

  // ==================== Promise bridge ====================

  private handleChat(request: ChatRequest): Promise<ChatResponse> {
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

    return new Promise<ChatResponse>((resolve, reject) => {
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
      void this.emitMessage(unified).catch((error: unknown) => {
        clearTimeout(timer);
        this.pendingResponses.delete(conversationId);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  // ==================== Static ====================

  static async testConnection(accountId: string, _botToken?: string): Promise<{ success: boolean; error?: string }> {
    try {
      const accountFile = path.join(os.homedir(), '.openclaw', 'openclaw-weixin', 'accounts', `${accountId}.json`);
      const raw = fs.readFileSync(accountFile, 'utf-8');
      const data = JSON.parse(raw) as { token?: string };
      if (!data.token) {
        return { success: false, error: 'No token in credential file' };
      }
      return { success: true };
    } catch {
      return { success: false, error: `Credential file not found for accountId: ${accountId}` };
    }
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
bun run test tests/unit/channels/weixinPlugin.test.ts 2>&1 | tail -20
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/process/channels/plugins/weixin/WeixinPlugin.ts tests/unit/channels/weixinPlugin.test.ts
git commit -m "feat(weixin): add WeixinPlugin with Promise bridge"
```

---

## Task 6: WeixinLoginHandler + IPC Bridge (TDD)

**Files:**

- Create: `src/process/channels/plugins/weixin/WeixinLoginHandler.ts`
- Create: `src/process/bridge/weixinLoginBridge.ts`
- Create: `tests/unit/channels/weixinLoginHandler.test.ts`
- Modify: `src/process/bridge/index.ts`
- Modify: `src/preload.ts`

- [ ] **Step 1: Write failing tests for WeixinLoginHandler**

Create `tests/unit/channels/weixinLoginHandler.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock WeixinLogin before importing WeixinLoginHandler
let mockStartLoginFn = vi.fn();
vi.mock('@process/channels/plugins/weixin/WeixinLogin', () => ({
  startLogin: (...args: unknown[]) => mockStartLoginFn(...args),
}));

async function loadHandlerClass() {
  vi.resetModules();
  vi.doMock('@process/channels/plugins/weixin/WeixinLogin', () => ({
    startLogin: (...args: unknown[]) => mockStartLoginFn(...args),
  }));
  const mod = await import('@process/channels/plugins/weixin/WeixinLoginHandler');
  return mod.WeixinLoginHandler;
}

function makeMockWindow() {
  return {
    webContents: { send: vi.fn() },
  };
}

describe('WeixinLoginHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls startLogin and resolves when onDone fires', async () => {
    const WeixinLoginHandler = await loadHandlerClass();
    const win = makeMockWindow();
    const handler = new WeixinLoginHandler(() => win as never);

    mockStartLoginFn = vi.fn(({ onDone }: { onDone: (r: unknown) => void }) => {
      setTimeout(() => onDone({ accountId: 'u1', botToken: 'tok', baseUrl: 'https://x' }), 0);
      return { abort: vi.fn() };
    });

    const result = await handler.startLogin();
    expect(result.accountId).toBe('u1');
    expect(result.botToken).toBe('tok');
  });

  it('sends weixin:login:qr event to renderer on onQR', async () => {
    const WeixinLoginHandler = await loadHandlerClass();
    const win = makeMockWindow();
    const handler = new WeixinLoginHandler(() => win as never);

    mockStartLoginFn = vi.fn(({ onQR, onDone }: { onQR: (url: string) => void; onDone: (r: unknown) => void }) => {
      setTimeout(() => {
        onQR('https://qr.example.com/abc');
        onDone({ accountId: 'u1', botToken: 'tok', baseUrl: 'https://x' });
      }, 0);
      return { abort: vi.fn() };
    });

    await handler.startLogin();
    expect(win.webContents.send).toHaveBeenCalledWith('weixin:login:qr', {
      qrcodeUrl: 'https://qr.example.com/abc',
    });
  });

  it('abort() cancels in-progress login', async () => {
    const WeixinLoginHandler = await loadHandlerClass();
    const win = makeMockWindow();
    const handler = new WeixinLoginHandler(() => win as never);

    const mockAbort = vi.fn();
    mockStartLoginFn = vi.fn(() => ({ abort: mockAbort }));

    handler.startLogin().catch(() => {}); // do not await
    handler.abort();

    expect(mockAbort).toHaveBeenCalledTimes(1);
  });

  it('cancels previous login when startLogin is called twice', async () => {
    const WeixinLoginHandler = await loadHandlerClass();
    const win = makeMockWindow();
    const handler = new WeixinLoginHandler(() => win as never);

    const firstAbort = vi.fn();
    let callCount = 0;

    mockStartLoginFn = vi.fn(({ onDone }: { onDone: (r: unknown) => void }) => {
      callCount++;
      if (callCount === 2) {
        setTimeout(() => onDone({ accountId: 'u2', botToken: 'tok2', baseUrl: 'https://x' }), 0);
      }
      return { abort: firstAbort };
    });

    const second = handler.startLogin(); // second call cancels first
    await expect(second).resolves.toBeDefined();
    // first abort was called when second startLogin was initiated
    expect(firstAbort).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
bun run test tests/unit/channels/weixinLoginHandler.test.ts 2>&1 | tail -10
```

Expected: `FAIL` — `Cannot find module`.

- [ ] **Step 3: Implement `WeixinLoginHandler`**

Create `src/process/channels/plugins/weixin/WeixinLoginHandler.ts`:

```typescript
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BrowserWindow } from 'electron';
import { startLogin } from './WeixinLogin';
import type { LoginHandle } from './WeixinLogin';

/**
 * Manages the WeChat QR-code login flow over Electron IPC.
 * Instantiated once by weixinLoginBridge and reused for all login requests.
 */
export class WeixinLoginHandler {
  private loginHandle: LoginHandle | null = null;

  constructor(private readonly getWindow: () => BrowserWindow | null) {}

  startLogin(): Promise<{ accountId: string; botToken: string; baseUrl: string }> {
    this.loginHandle?.abort();

    return new Promise((resolve, reject) => {
      const win = this.getWindow();

      this.loginHandle = startLogin({
        onQR: (qrcodeUrl) => {
          win?.webContents.send('weixin:login:qr', { qrcodeUrl });
        },
        onScanned: () => {
          win?.webContents.send('weixin:login:scanned');
        },
        onDone: (result) => {
          win?.webContents.send('weixin:login:done', result);
          resolve(result);
        },
        onError: (error) => {
          reject(error);
        },
      });
    });
  }

  abort(): void {
    this.loginHandle?.abort();
    this.loginHandle = null;
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
bun run test tests/unit/channels/weixinLoginHandler.test.ts 2>&1 | tail -15
```

Expected: all tests PASS.

- [ ] **Step 5: Implement `weixinLoginBridge`**

Create `src/process/bridge/weixinLoginBridge.ts`:

```typescript
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserWindow, ipcMain } from 'electron';
import { WeixinLoginHandler } from '@process/channels/plugins/weixin/WeixinLoginHandler';

let handler: WeixinLoginHandler | null = null;

export function initWeixinLoginBridge(): void {
  const getWindow = () => BrowserWindow.getAllWindows()[0] ?? null;
  handler = new WeixinLoginHandler(getWindow);

  ipcMain.handle('weixin:login:start', async () => {
    try {
      return await handler!.startLogin();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message);
    }
  });
}
```

- [ ] **Step 6: Register bridge in `src/process/bridge/index.ts`**

Add import after the existing imports (around line 37, after `initExtensionsBridge`):

```typescript
import { initWeixinLoginBridge } from './weixinLoginBridge';
```

In `initAllBridges` function, after `initStarOfficeBridge();` (line 76), add:

```typescript
initWeixinLoginBridge();
```

Add `initWeixinLoginBridge` to the named re-export object (lines 98–118):

```typescript
  initWeixinLoginBridge,
```

- [ ] **Step 7: Update `src/preload.ts` — expose weixin IPC to renderer**

In `src/preload.ts`, find the closing of the `contextBridge.exposeInMainWorld` block. The file currently ends the object at:

```typescript
  webuiGenerateQRToken: () => ipcRenderer.invoke('webui-direct-generate-qr-token'),
});
```

Insert the following **before** the `});` line:

```typescript
  // WeChat login IPC
  weixinLoginStart: () => ipcRenderer.invoke('weixin:login:start'),
  weixinLoginOnQR: (callback: (data: { qrcodeUrl: string }) => void) => {
    const h = (_event: unknown, data: { qrcodeUrl: string }) => callback(data);
    ipcRenderer.on('weixin:login:qr', h);
    return () => ipcRenderer.off('weixin:login:qr', h);
  },
  weixinLoginOnScanned: (callback: () => void) => {
    const h = () => callback();
    ipcRenderer.on('weixin:login:scanned', h);
    return () => ipcRenderer.off('weixin:login:scanned', h);
  },
  weixinLoginOnDone: (callback: (data: { accountId: string }) => void) => {
    const h = (_event: unknown, data: { accountId: string }) => callback(data);
    ipcRenderer.on('weixin:login:done', h);
    return () => ipcRenderer.off('weixin:login:done', h);
  },
```

- [ ] **Step 8: Type-check**

```bash
bunx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/process/channels/plugins/weixin/WeixinLoginHandler.ts \
        src/process/bridge/weixinLoginBridge.ts \
        src/process/bridge/index.ts \
        src/preload.ts \
        tests/unit/channels/weixinLoginHandler.test.ts
git commit -m "feat(weixin): add WeixinLoginHandler, IPC bridge, and preload bindings"
```

---

## Task 7: Wire Plugin Into Channel System

**Files:**

- Create: `src/process/channels/plugins/weixin/index.ts`
- Modify: `src/process/channels/plugins/index.ts`
- Modify: `src/process/channels/index.ts`
- Modify: `src/process/channels/core/ChannelManager.ts`

- [ ] **Step 1: Create weixin module index**

Create `src/process/channels/plugins/weixin/index.ts`:

```typescript
/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export { WeixinPlugin } from './WeixinPlugin';
export * from './WeixinAdapter';
```

- [ ] **Step 2: Export from `plugins/index.ts`**

In `src/process/channels/plugins/index.ts`, add after the DingTalk plugin export:

```typescript
// WeChat plugin
export { WeixinPlugin } from './weixin/WeixinPlugin';
export * from './weixin/WeixinAdapter';
```

- [ ] **Step 3: Export from `channels/index.ts`**

In `src/process/channels/index.ts`, after `export { DingTalkPlugin }`, add:

```typescript
export { WeixinPlugin } from './plugins/weixin/WeixinPlugin';
```

- [ ] **Step 4: Register in `ChannelManager`**

In `src/process/channels/core/ChannelManager.ts`, add import:

```typescript
import { WeixinPlugin } from '../plugins/weixin/WeixinPlugin';
```

In the constructor, after `registerPlugin('dingtalk', DingTalkPlugin);`, add:

```typescript
registerPlugin('weixin', WeixinPlugin);
```

- [ ] **Step 5: Run full test suite**

```bash
bun run test 2>&1 | tail -20
```

Expected: all existing tests pass, all new weixin tests pass.

- [ ] **Step 6: Run type-check**

```bash
bunx tsc --noEmit 2>&1 | head -20
```

Expected: no output.

- [ ] **Step 7: Run lint and format**

```bash
bun run lint:fix && bun run format
```

- [ ] **Step 8: Run prek check**

```bash
prek run --from-ref origin/main --to-ref HEAD 2>&1 | tail -20
```

Expected: no failures.

- [ ] **Step 9: Final commit**

```bash
git add src/process/channels/plugins/weixin/index.ts \
        src/process/channels/plugins/index.ts \
        src/process/channels/index.ts \
        src/process/channels/core/ChannelManager.ts
git commit -m "feat(weixin): wire WeixinPlugin into channel system"
```

---

## Completion Checklist

- [ ] `weixin-agent-sdk` installed as dependency
- [ ] `BuiltinPluginType` includes `'weixin'`
- [ ] `hasPluginCredentials('weixin', ...)` uses `accountId + botToken` (inserted before fallback return)
- [ ] `shortPlatform` local var in `getChannelConversationName` includes `weixin: 'wx'`
- [ ] `WeixinAdapter`: all 4 inbound media types + 3 outbound types covered by tests
- [ ] `WeixinLogin`: QR fetch → poll → expired-retry (max 3) → confirmed state machine tested
- [ ] `WeixinPlugin` lifecycle: init → start → running → stop; `botToken` stored and passed to `start()`
- [ ] Promise bridge: emit, accumulate, resolve on final edit
- [ ] Concurrent requests: superseded properly rejected
- [ ] 5-minute timeout works
- [ ] Stop rejects all pending before aborting SDK
- [ ] `testConnection(accountId, botToken?)` reads local credential file
- [ ] `WeixinLoginHandler`: QR/scanned/done events forwarded to renderer; double-start aborts previous
- [ ] `initWeixinLoginBridge` registered in `initAllBridges` and re-exported from `bridge/index.ts`
- [ ] `src/preload.ts` exposes `weixinLoginStart`, `weixinLoginOnQR`, `weixinLoginOnScanned`, `weixinLoginOnDone`
- [ ] `ChannelManager` constructor calls `registerPlugin('weixin', WeixinPlugin)`
- [ ] All tests pass (`bun run test`)
- [ ] No type errors (`bunx tsc --noEmit`)
- [ ] `prek` check passes
