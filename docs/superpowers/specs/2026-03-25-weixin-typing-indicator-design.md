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

| Question | Decision |
|---|---|
| Periodic re-send? | Yes — every 10 s (typing indicators auto-expire ~15 s on WeChat) |
| On API failure? | Best-effort: retry up to 2 times (500 ms backoff), then log and ignore |
| SSE incremental reply? | Abandoned — not supported by WeChat Bot protocol |

## Architecture

### New file: `WeixinTyping.ts`

Single-responsibility module that owns all typing-indicator logic.

**Public API:**

```typescript
class TypingManager {
  constructor(opts: { baseUrl: string; token: string; log: (msg: string) => void })

  /**
   * Send TYPING immediately, then re-send every TYPING_INTERVAL_MS until stop() is called.
   * If a previous typing session for the same userId is still active, it is stopped first.
   * Returns a stop function that cancels the interval and sends CANCEL (best-effort).
   */
  async startTyping(userId: string, contextToken?: string): Promise<() => Promise<void>>
}
```

**Internal behavior:**

- `typing_ticket` cache: per-user Map, TTL = 24 h (randomized), exponential-backoff retry up to 1 h on failure
- `sendTyping` retry: max 2 retries, initial delay 500 ms, exponential backoff; failure is logged and swallowed
- `stop()` is idempotent — safe to call multiple times
- `stop()` sends `CANCEL` status (best-effort, does not throw)

**Constants:**

```
TYPING_INTERVAL_MS     = 10_000
TYPING_RETRY_DELAY_MS  = 500
MAX_TYPING_RETRIES     = 2
CONFIG_CACHE_TTL_MS    = 24 * 60 * 60 * 1000
CONFIG_INITIAL_RETRY_MS = 2_000
CONFIG_MAX_RETRY_MS    = 60 * 60 * 1000
```

### Modified file: `WeixinMonitor.ts`

Minimal changes — only the per-message handler block inside `runMonitor` changes.

**Before:**
```typescript
const response = await agent.chat({ conversationId, text })
if (response.text) {
  await callSendMessage(baseUrl, token, wechatUin, conversationId, response.text, msg.context_token)
}
```

**After:**
```typescript
const stopTyping = await typingMgr.startTyping(conversationId, msg.context_token)
try {
  const response = await agent.chat({ conversationId, text })
  await stopTyping()
  if (response.text) {
    await callSendMessage(baseUrl, token, wechatUin, conversationId, response.text, msg.context_token)
  }
} catch (err) {
  await stopTyping()
  throw err
}
```

`TypingManager` is instantiated once before the loop:

```typescript
const typingMgr = new TypingManager({ baseUrl, token, log: logFn })
```

### Unchanged files

- `WeixinPlugin.ts` — no changes
- `WeixinAdapter.ts` — no changes
- `WeixinLogin.ts` / `WeixinLoginHandler.ts` — no changes
- `WeixinChatRequest` type — no changes (`contextToken` is consumed internally by Monitor)
- `MonitorOptions` type — no new fields needed (reuses `baseUrl`, `token`, `log`)

## Data Flow

```
getUpdates → message received
    ↓
typingMgr.startTyping(userId, contextToken)
    ├─ callGetConfig(userId, contextToken) → typing_ticket (cached 24 h)
    ├─ sendTyping(TYPING)                  ← immediate
    └─ setInterval(10 s) → sendTyping(TYPING)
    ↓
agent.chat(request)
    ↓
stop()
    ├─ clearInterval
    └─ sendTyping(CANCEL)  [best-effort]
    ↓
callSendMessage(text)
```

## API Calls (WeChat Bot protocol)

| Endpoint | Purpose | Timeout |
|---|---|---|
| `ilink/bot/getconfig` | Get `typing_ticket` for a user | 10 s |
| `ilink/bot/sendtyping` | Send typing status (TYPING=1 / CANCEL=2) | 10 s |

Request body for `sendTyping`:
```json
{
  "ilink_user_id": "<userId>",
  "typing_ticket": "<ticket>",
  "status": 1,
  "base_info": {}
}
```

## Error Handling

- `getConfig` failure: cache returns `""` for `typingTicket`; `startTyping` skips all API calls when ticket is empty and returns a no-op stop function
- `sendTyping` failure: retried up to 2 times; if still failing, logged and ignored — main `agent.chat` flow is never blocked

## Testing

- Unit tests for `TypingManager`:
  - `startTyping` sends TYPING immediately
  - interval re-sends at 10 s cadence
  - `stop()` cancels interval and sends CANCEL
  - empty `typingTicket` → no API calls made
  - `getConfig` failure → graceful degradation
  - concurrent `startTyping` for same user → previous stop called first
- `WeixinMonitor.ts` tests:
  - typing started before `agent.chat`, stopped after
  - typing stopped on agent error

## Out of Scope

- SSE / incremental token streaming to WeChat client
- Typing indicator for media messages (text-only for now)
- Changes to `WeixinPlugin.ts` or the IPC bridge
