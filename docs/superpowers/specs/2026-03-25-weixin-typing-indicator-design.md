# Design: WeChat Typing Indicator

**Date:** 2026-03-25
**Branch:** feat/weixin-plugin
**Status:** Approved

## Background

The WeChat (weixin) channel integration lacks a "typing" status indicator when the agent is
processing a reply. Users see no feedback between sending a message and receiving the response,
which degrades the experience for slow queries.

SSE incremental reply was also considered but is not feasible: the WeChat Bot protocol is
polling-based (`getUpdates` + `sendMessage` with complete payloads). Streaming tokens to the
WeChat client is not supported. This feature is out of scope.

## Goal

Show the WeChat "typing…" indicator to the user as soon as a message is received and keep it
visible until the agent reply is sent.

## Decisions

| Question               | Decision                                                               |
| ---------------------- | ---------------------------------------------------------------------- |
| Periodic re-send?      | Yes — every 10 s (typing indicators auto-expire ~15 s on WeChat)       |
| On API failure?        | Best-effort: retry up to 2 times (500 ms backoff), then log and ignore |
| SSE incremental reply? | Abandoned — not supported by WeChat Bot protocol                       |

## Architecture

### New file: `WeixinTyping.ts`

Single-responsibility module that owns all typing-indicator logic.

**Public API:**

```typescript
class TypingManager {
  constructor(opts: {
    baseUrl: string;
    token: string;
    wechatUin: string; // X-WECHAT-UIN header — generated in startMonitor, passed through
    abortSignal?: AbortSignal; // when fired: clear all intervals + abort in-flight sendTyping fetches
    log: (msg: string) => void;
  });

  /**
   * Send TYPING immediately, then re-send every TYPING_INTERVAL_MS until stop() is called.
   * If a previous typing session for the same userId is active, it is stopped first.
   * When typingTicket is empty (getConfig failed), returns a no-op stop — agent.chat still proceeds.
   * Returns a stop function that cancels the interval and sends CANCEL (best-effort, does not throw).
   * stop() is idempotent — safe to call multiple times.
   */
  async startTyping(userId: string, contextToken?: string): Promise<() => Promise<void>>;
}
```

**Internal behavior:**

- `typing_ticket` cache: per-user `Map<string, CacheEntry>`, TTL computed as
  `now + Math.random() * CONFIG_CACHE_TTL_MS` (same formula as the weixin-agent-sdk reference
  implementation). This spreads expiry times uniformly across the 24 h window so concurrent
  users do not all refresh at the same moment (thundering-herd prevention).
- On `getConfig` failure: schedule retry with exponential backoff starting at
  `CONFIG_INITIAL_RETRY_MS`, doubling each failure up to `CONFIG_MAX_RETRY_MS`.
- Stale cache entry or fetch failure both result in `typingTicket = ""`.
- When `typingTicket` is empty `startTyping` immediately returns a no-op stop function; no
  `sendTyping` or `getConfig` calls are made.
- `sendTyping` retry: max `MAX_TYPING_RETRIES` retries with initial delay `TYPING_RETRY_DELAY_MS`,
  doubling each attempt; after final failure, log and swallow — never throws.
- Concurrent `startTyping` for the same `userId`: calls `stop()` on the previous session before
  starting a new one to clear the old interval.
- `AbortSignal` handling: when `abortSignal` fires, `clearInterval` on all active intervals and
  cancel any in-flight `sendTyping` fetch (via inner `AbortController`). Subsequent `startTyping`
  calls made after abort return a no-op immediately.
- `WeixinTyping.ts` reuses the same `apiPost` helper extracted from `WeixinMonitor.ts` (or
  inline equivalent), ensuring `Content-Length`, `Authorization`, `AuthorizationType`, and
  `X-WECHAT-UIN` headers are present on all requests.

**Constants:**

```
TYPING_INTERVAL_MS      = 10_000   // re-send cadence
TYPING_RETRY_DELAY_MS   = 500      // initial retry delay for sendTyping
MAX_TYPING_RETRIES      = 2        // max sendTyping retry attempts
CONFIG_CACHE_TTL_MS     = 24 * 60 * 60 * 1000   // max typing_ticket cache lifetime
CONFIG_INITIAL_RETRY_MS = 2_000    // initial getConfig retry delay
CONFIG_MAX_RETRY_MS     = 60 * 60 * 1000         // max getConfig retry delay
```

### Modified file: `WeixinMonitor.ts`

Minimal changes. `wechatUin` is generated in `startMonitor` (the exported function) and passed
to `runMonitor`. `TypingManager` is instantiated once at the top of `runMonitor`, after
`wechatUin` is received and before the loop:

```typescript
const typingMgr = new TypingManager({ baseUrl, token, wechatUin, abortSignal: signal, log: logFn });
```

Per-message handler block. The existing extractions (`conversationId`, `text`) are unchanged;
only the chat + send section is replaced:

```typescript
// existing — unchanged
const conversationId = msg.from_user_id ?? '';
const text = textItem.text_item?.text ?? '';

// new — replaces the bare `agent.chat` + `callSendMessage` block
const stopTyping = await typingMgr.startTyping(conversationId, msg.context_token);
try {
  const response = await agent.chat({ conversationId, text });
  await stopTyping();
  if (response.text) {
    await callSendMessage(baseUrl, token, wechatUin, conversationId, response.text, msg.context_token);
  }
} catch (err) {
  await stopTyping();
  throw err;
}
```

`stopTyping()` is called before `callSendMessage` so the typing indicator clears before the
reply appears in the chat.

### Unchanged files

- `WeixinPlugin.ts` — no changes
- `WeixinAdapter.ts` — no changes
- `WeixinLogin.ts` / `WeixinLoginHandler.ts` — no changes
- `WeixinChatRequest` type — no changes (`contextToken` stays internal to Monitor)
- `MonitorOptions` type — no new fields needed (`baseUrl`, `token`, `log` already present)

## Data Flow

```
startMonitor generates wechatUin
    ↓
runMonitor: TypingManager constructed with { baseUrl, token, wechatUin, abortSignal, log }
    ↓
getUpdates → message received (msg.context_token, msg.from_user_id)
    ↓
typingMgr.startTyping(userId, contextToken)
    ├─ callGetConfig(userId, contextToken) → typing_ticket (cached 24 h window)
    │   └─ if ticket == "" → return no-op stop immediately
    ├─ sendTyping(TYPING, userId, ticket)     ← immediate
    └─ setInterval(10 s) → sendTyping(TYPING, userId, ticket)
    ↓
agent.chat({ conversationId, text })
    ↓
stopTyping()
    ├─ clearInterval
    └─ sendTyping(CANCEL, userId, ticket)   [best-effort: try once, catch and swallow all errors]
    ↓
callSendMessage(text)
```

## API Request/Response Schemas

All requests include the following headers (enforced by `apiPost`):

```
Authorization: Bearer <token>
AuthorizationType: ilink_bot_token
X-WECHAT-UIN: <wechatUin>
Content-Type: application/json
Content-Length: <byte length of body>
```

### `ilink/bot/getconfig` (timeout 10 s)

Request body:

```json
{
  "ilink_user_id": "<userId>",
  "context_token": "<contextToken>", // field omitted entirely when contextToken is undefined
  "base_info": {}
}
```

Response (success: `ret == 0`):

```json
{
  "ret": 0,
  "typing_ticket": "<base64 string>"
}
```

Error detection: `ret !== 0` or `errcode !== 0` (when present) → treat as failure, apply retry.

### `ilink/bot/sendtyping` (timeout 10 s)

Request body:

```json
{
  "ilink_user_id": "<userId>",
  "typing_ticket": "<ticket>",
  "status": 1,
  "base_info": {}
}
```

(`status: 2` for CANCEL)

Response body: ignored. HTTP non-2xx → treated as failure.

**Retry behavior by status:**

| Call site                        | On HTTP error or exception                              | Behavior     |
| -------------------------------- | ------------------------------------------------------- | ------------ |
| `sendTyping(TYPING)` in interval | Retry up to `MAX_TYPING_RETRIES`, then log + swallow    | Never throws |
| `sendTyping(CANCEL)` in `stop()` | Single attempt, catch and swallow all errors (no retry) | Never throws |

## Error Handling

| Scenario                                   | Behavior                                                          |
| ------------------------------------------ | ----------------------------------------------------------------- |
| `getConfig` fails                          | Retry with backoff; empty ticket → no-op stop, no typing calls    |
| `sendTyping(TYPING)` fails all retries     | Log + ignore; `agent.chat` proceeds normally                      |
| `sendTyping(CANCEL)` fails                 | Caught and swallowed silently (single attempt, no retry)          |
| `abortSignal` fires during active interval | `clearInterval`, in-flight fetch aborted; no further typing calls |
| `abortSignal` fires before `startTyping`   | Return no-op immediately, no API calls                            |
| `agent.chat` throws (incl. timeout)        | `stopTyping()` called in catch branch; indicator cleared          |

## Testing

All interval-related tests use `vi.useFakeTimers()`.

**`TypingManager` unit tests:**

- `startTyping` → `sendTyping(TYPING)` called immediately with correct `ilink_user_id`,
  `typing_ticket`, `status=1`, and all required headers (`Authorization`, `AuthorizationType`,
  `X-WECHAT-UIN`)
- Advance fake timer 10 s → `sendTyping(TYPING)` called again
- `stop()` → `clearInterval` + `sendTyping(CANCEL, status=2)` sent
- `stop()` called twice → idempotent; only one CANCEL sent
- Empty `typingTicket` (getConfig returns `""`) → no `sendTyping` calls; `stop()` is a no-op
- `getConfig` throws → graceful: no-op stop returned, no error propagated, no `sendTyping` calls,
  `agent.chat` still proceeds
- Concurrent `startTyping` for same `userId` → first session's `stop()` called before second starts
- `abortSignal` fires during active interval → interval cleared, no further `sendTyping` calls
- `abortSignal` fires before `startTyping` is called → returns no-op immediately, no API calls made
- `sendTyping` retries exhausted → error logged, `startTyping` resolves normally (no throw)
- `sendTyping(CANCEL)` fails → error swallowed, `stop()` resolves without throwing

**`WeixinMonitor.ts` integration tests:**

- `sendTyping(TYPING)` sent before `agent.chat` is called
- `sendTyping(CANCEL)` sent after `agent.chat` resolves, before `callSendMessage`
- `sendTyping(CANCEL)` sent when `agent.chat` throws

## Out of Scope

- SSE / incremental token streaming to WeChat client
- Typing indicator for media messages (text-only for now)
- Changes to `WeixinPlugin.ts` or the IPC bridge
