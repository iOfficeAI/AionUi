# Design: Remove weixin-agent-sdk Dependency

**Date:** 2026-03-25
**Status:** Approved

## Overview

Replace the `weixin-agent-sdk` npm dependency with a self-contained implementation inside the `weixin/` plugin directory. The goal is simpler, more controllable code with logs integrated into AionUi's own system. Only text messaging is supported in this iteration; media (images, files, audio) is out of scope.

## Motivation

- `weixin-agent-sdk` is a black box: logs go to `console.log`, retry behavior is opaque, and credential passing requires writing files to `openclaw-weixin/` and manipulating `OPENCLAW_STATE_DIR`.
- `WeixinLogin.ts` already calls the iLink Bot API directly without the SDK, proving the approach is viable.
- A minimal in-house implementation covering only text is roughly 150 lines vs. a full-featured SDK.

## File Changes

### New file

**`src/process/channels/plugins/weixin/WeixinMonitor.ts`**

Owns the long-poll loop and the two required API calls (`getUpdates`, `sendMessage`). Equivalent to the SDK's `monitor.ts` + `api.ts`, stripped to text-only.

### Modified files

| File                                       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `WeixinPlugin.ts`                          | Remove `start()` import from SDK; remove `openclaw-weixin/` directory writes and `OPENCLAW_STATE_DIR` env manipulation; call `startMonitor()` instead. `onInitialize()` stores `accountId`, `botToken`, and `baseUrl` (optional, defaults to `https://ilinkai.weixin.qq.com`). Remove `media` handling from `editMessage()` and delete `PendingResponse.mediaResponse` field (text-only scope). Update `handleChat` signature. `testConnection()` uses the new credential file path (see below). |
| `WeixinAdapter.ts`                         | Replace `import type { ChatRequest, ChatResponse } from 'weixin-agent-sdk'` with `import type { WeixinChatRequest, WeixinChatResponse } from './WeixinMonitor'`. Remove `media` parameter from `toUnifiedIncomingMessage` (no `media` field in `WeixinChatRequest`). Delete `toChatResponse`, `mediaTypeToContentType`, and `mediaTypeToAttachmentType` (unused in text-only mode). Keep `stripHtml`.                                                                                            |
| `package.json`                             | Remove `weixin-agent-sdk` dependency.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `tests/unit/channels/weixinPlugin.test.ts` | Change mock target from `weixin-agent-sdk` to `@process/channels/plugins/weixin/WeixinMonitor`. Update agent access in 6 places. Update `testConnection` test setup to write to the new path (see Testing Strategy).                                                                                                                                                                                                                                                                             |

### New test file

**`tests/unit/channels/weixinMonitor.test.ts`** — unit tests for `WeixinMonitor` in isolation with a mocked `fetch`.

## WeixinMonitor Public API

```typescript
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
  /** Directory used to persist get_updates_buf. Caller passes getPlatformServices().paths.getDataDir(). */
  dataDir: string;
  agent: WeixinAgent;
  abortSignal?: AbortSignal;
  log?: (msg: string) => void;
};

/**
 * Start the long-poll monitor in the background (non-blocking).
 * Errors are logged via opts.log; loop stops when abortSignal fires.
 */
export function startMonitor(opts: MonitorOptions): void;
```

## WeixinMonitor Internal Logic

### Long-poll loop

```
load get_updates_buf from <dataDir>/weixin-monitor/<accountId>.buf
while (!aborted):
  POST /ilink/bot/getupdates  (timeout 35s)
  for each message in resp.msgs:
    extract text from item_list (ignore non-text items)
    call agent.chat({ conversationId: msg.from_user_id, text })
    if response.text: POST /ilink/bot/sendmessage
  save updated get_updates_buf
```

### Retry / backoff (matches SDK behavior)

- Consecutive failures 1–2: wait 2 s, retry
- Consecutive failures >= 3: wait 30 s, reset counter

### Request headers

Every `POST` to `/ilink/bot/*` includes:

```
Content-Type: application/json
AuthorizationType: ilink_bot_token
Authorization: Bearer <token>
X-WECHAT-UIN: <random uint32 as base64>
```

`X-WECHAT-UIN` is generated once per `startMonitor()` call and reused for all requests in that session (consistent with SDK behavior).

### get_updates_buf persistence

Stored at `<dataDir>/weixin-monitor/<accountId>.buf` as a plain text file (raw buf string only). Loaded on start to resume from the last processed message; written after each successful `getUpdates` response that returns a non-empty buf.

The correct advancement of `get_updates_buf` prevents the server from replaying already-delivered messages, so no additional client-side deduplication is required.

### baseUrl default

`MonitorOptions.baseUrl` is required. `WeixinPlugin.onInitialize()` falls back to `https://ilinkai.weixin.qq.com` when the config does not include a `baseUrl`.

## WeixinPlugin Changes

### PendingResponse interface

Delete the `mediaResponse` field (was `mediaResponse?: ChatResponse['media']`). Text-only: the interface becomes:

```typescript
interface PendingResponse {
  resolve: (response: WeixinChatResponse) => void;
  reject: (error: Error) => void;
  accumulatedText: string;
  timer: ReturnType<typeof setTimeout>;
}
```

### handleChat() signature

Change from SDK types to local types:

```typescript
// before
private handleChat(request: ChatRequest): Promise<ChatResponse>

// after
private handleChat(request: WeixinChatRequest): Promise<WeixinChatResponse>
```

### onInitialize()

```typescript
protected async onInitialize(config: IChannelPluginConfig): Promise<void> {
  const { accountId, botToken, baseUrl } = config.credentials ?? {};
  if (!accountId || !botToken) {
    throw new Error('WeChat accountId and botToken are required');
  }
  this.accountId = accountId as string;
  this.botToken = botToken as string;
  this.baseUrl = (baseUrl as string | undefined) ?? 'https://ilinkai.weixin.qq.com';
}
```

No file system writes. No env var manipulation.

### onStart()

```typescript
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
```

### editMessage() — media branch removed

Delete the `if (message.type === 'image' || message.type === 'file')` branch and the `toChatResponse(message).media` assignment. Only text accumulation and `replyMarkup` resolution remain.

### testConnection()

`testConnection()` checks whether the buf file `<dataDir>/weixin-monitor/<accountId>.buf` exists (written by a previous successful monitor run). If it exists, the account is considered configured.

```typescript
static async testConnection(accountId: string, _botToken?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const stateDir = getPlatformServices().paths.getDataDir();
    const bufFile = path.join(stateDir, 'weixin-monitor', `${accountId}.buf`);
    fs.accessSync(bufFile); // throws if missing
    return { success: true };
  } catch {
    return { success: false, error: `No sync buf found for accountId: ${accountId}` };
  }
}
```

This is a file-existence check, not a network call. It mirrors the previous `openclaw-weixin/accounts/<accountId>.json` check pattern.

## WeixinAdapter.ts Changes

- `toUnifiedIncomingMessage(request: WeixinChatRequest)` — remove `media` handling entirely; always returns `content.type = 'text'`.
- `toChatResponse` — **deleted**.
- `mediaTypeToContentType` — **deleted**.
- `mediaTypeToAttachmentType` — **deleted**.
- `stripHtml` — **kept** (still used to clean outgoing text).

## Testing Strategy

### weixinPlugin.test.ts (modified)

**1. Mock target** changes from `weixin-agent-sdk` to `WeixinMonitor`:

```typescript
// before
vi.doMock('weixin-agent-sdk', () => ({
  start: (...args: unknown[]) => mockStartFn(...args),
}));

// after
vi.doMock('@process/channels/plugins/weixin/WeixinMonitor', () => ({
  startMonitor: (...args: unknown[]) => mockStartFn(...args),
}));
```

**2. Agent access changes in 6 places** — the agent is now nested inside the `opts` object:

```typescript
// before
const agentArg = mockStartFn.mock.calls[0][0];
agentArg.chat({ conversationId: 'user_abc', text: 'Hello' });

// after
const { agent } = mockStartFn.mock.calls[0][0] as MonitorOptions;
agent.chat({ conversationId: 'user_abc', text: 'Hello' });
```

**3. testConnection test setup** — update the file path written in the "returns true when credential file exists" test:

```typescript
// before: writes to TEST_DATA_DIR/openclaw-weixin/accounts/test_acc_valid.json
const accountsDir = path.join(TEST_DATA_DIR, 'openclaw-weixin', 'accounts');
fs.mkdirSync(accountsDir, { recursive: true });
fs.writeFileSync(path.join(accountsDir, 'test_acc_valid.json'), JSON.stringify({ token: 'tok_test' }));

// after: writes to TEST_DATA_DIR/weixin-monitor/test_acc_valid.buf
const monitorDir = path.join(TEST_DATA_DIR, 'weixin-monitor');
fs.mkdirSync(monitorDir, { recursive: true });
fs.writeFileSync(path.join(monitorDir, 'test_acc_valid.buf'), 'some-buf-value');
```

All other test assertions (response values, rejection reasons, timing) remain identical.

### weixinMonitor.test.ts (new)

Mock `fetch` globally. Tests run against a temp `dataDir`. Cover:

- `getUpdates` response with one text message → `agent.chat()` called once → `sendMessage` called with `response.text`
- Non-text message items (e.g. `type !== 1`) are silently ignored — `agent.chat` is not called
- **buf persistence**: after one poll cycle completes (mock fetch returns one message then the abort signal fires), read `<dataDir>/weixin-monitor/<accountId>.buf` from disk and assert it equals the `get_updates_buf` from the mock response
- Fetch error triggers 2 s retry; third consecutive error triggers 30 s backoff (use `vi.useFakeTimers()`)
- `abortSignal` fired before any fetch resolves stops the loop cleanly with no unhandled rejection
- `dataDir` is an OS temp directory scoped to each test

## Out of Scope

- Media download / CDN upload / AES decryption
- SILK audio transcoding
- Slash command handling (`/clear` etc.)
- Typing indicator (`sendTyping`) — can be added later as a one-liner
- `getConfig` API call (typing ticket)
