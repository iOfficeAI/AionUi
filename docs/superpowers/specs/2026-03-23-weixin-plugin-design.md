# WeChat (Weixin) Plugin Design

**Date:** 2026-03-23
**Status:** Approved
**Scope:** `src/process/channels/plugins/weixin/`

---

## Overview

Integrate `weixin-agent-sdk` into the AionUi channel plugin system so that WeChat users can interact with an Aion AI assistant via the WeChat iLink Bot API.

The SDK provides: `login()` for QR-code-based authentication, and `start(agent)` for a long-poll message loop that calls `agent.chat(request)` with each incoming message and expects a `Promise<ChatResponse>` back.

---

## Architecture

### File Structure

```
src/process/channels/plugins/weixin/
├── WeixinPlugin.ts    # BasePlugin subclass + Promise bridge
├── WeixinAdapter.ts   # ChatRequest/Response <-> IUnified* conversion
├── WeixinLogin.ts     # QR code login (independent HTTP implementation)
└── index.ts           # Exports
```

### Data Flow

```
[WeChat User sends message]
        │
    SDK long-poll (HTTP, max 35s)
        │
    agent.chat(request)          ← called by SDK on WeixinPlugin's internal Agent
        │
    WeixinAdapter.toUnified()
        │
    emitMessage()                ← push to PluginManager; suspend Promise
        │  (awaiting resolution)
        │
    PluginManager → AI → sendMessage() / editMessage()
        │
    editMessage(final)           ← replyMarkup flag signals completion
        │
    Promise resolves → ChatResponse
        │
    SDK sends response to WeChat
```

---

## Component Details

### WeixinPlugin

Extends `BasePlugin`. Implements the `Agent` interface internally as a Promise bridge.

**Type:** `'weixin'`

**Credentials:**
```typescript
{
  accountId: string   // logged-in account ID, passed to SDK start()
  botToken: string    // iLink Bot token (used by SDK internally)
  baseUrl: string     // API base URL, default: https://ilinkai.weixin.qq.com
}
```

**Lifecycle:**

| Method | Behavior |
|--------|----------|
| `onInitialize(config)` | Validate accountId + botToken credentials |
| `onStart()` | Create AbortController; call `start(agent, { accountId, abortSignal })` |
| `onStop()` | Call `abortController.abort()`; reject all pending responses |
| `sendMessage(chatId, msg)` | Record initial placeholder; return `"weixin_pending_{chatId}"` |
| `editMessage(chatId, msgId, msg)` | Accumulate text; resolve Promise on `replyMarkup` flag |
| `getActiveUserCount()` | Return size of active users Set |
| `getBotInfo()` | Return `{ displayName: 'Aion Assistant' }` |
| `testConnection()` | Verify local credential file exists; no network call |

### Promise Bridge

```typescript
interface PendingResponse {
  resolve: (response: ChatResponse) => void
  reject: (error: Error) => void
  accumulatedText: string        // collects streaming text chunks
  mediaResponse?: ChatResponse['media']
  timer: NodeJS.Timeout          // 5-minute timeout
}

// Map keyed by conversationId (= WeChat user ID = chatId)
pendingResponses: Map<string, PendingResponse>
```

**Resolution flow:**

1. `agent.chat(request)` called → create `PendingResponse`, call `emitMessage()`, suspend Promise
2. `sendMessage(chatId, msg)` → record messageId (placeholder), do NOT resolve yet
3. `editMessage(chatId, msgId, msg)` → accumulate `msg.text`; if `msg.media` present, store it
4. `editMessage` with `msg.replyMarkup` set → `resolve({ text: accumulatedText, media: mediaResponse })`
5. Timeout (5 min) → `reject(new Error('Response timeout'))`; SDK built-in error-notice notifies user

**chatId mapping:** WeChat `conversationId` is the WeChat user ID. It maps directly to `chatId` with no encoding (unlike DingTalk's `user:xxx` / `group:xxx` format).

### WeixinAdapter

Stateless conversion functions.

**Inbound:** `toUnifiedIncomingMessage(request: ChatRequest, platform: 'weixin'): IUnifiedIncomingMessage`

| ChatRequest field | IUnifiedIncomingMessage field |
|-------------------|-------------------------------|
| `conversationId` | `id`, `chatId`, `user.id` |
| `text` | `content.text` |
| `media.type` | `content.type` (`image→photo`, `audio→audio`, `video→video`, `file→document`) |
| `media.filePath` | `content.attachments[0].fileId` (local decrypted path) |
| `media.mimeType` | `content.attachments[0].mimeType` |
| `media.fileName` | `content.attachments[0].fileName` |

Note: SDK automatically downloads, decrypts, and transcodes media (silk→wav for audio) before calling `agent.chat()`. No additional media processing needed.

**Outbound:** `toChatResponse(message: IUnifiedOutgoingMessage): ChatResponse`

| IUnifiedOutgoingMessage field | ChatResponse field |
|-------------------------------|-------------------|
| `text` | `text` (Markdown auto-converted to plain text by SDK) |
| `media.url` | `media.url` (local path or HTTPS URL) |
| `media.type` | `media.type` (`photo→image`, `document→file`) |
| `media.fileName` | `media.fileName` |
| `buttons` / `replyMarkup` | Ignored (iLink Bot does not support interactive cards) |

**Media type support:**

| AionUi unified type | WeChat SDK type | Notes |
|--------------------|-----------------|-------|
| `photo` | `image` | Receive + send |
| `audio` | — | Receive only (SDK transcodes silk→wav); cannot send |
| `video` | `video` | Receive + send |
| `document` | `file` | Receive + send |

### WeixinLogin

Independent HTTP implementation for the QR-code login flow. Does NOT use SDK's `login()` (which only supports terminal output). Calls two WeChat API endpoints directly.

**Endpoints used:**
- `POST ilink/bot/get_bot_qrcode` → `{ qrcode_url, ticket }`
- `POST ilink/bot/get_qrcode_status` → `{ status: 'wait' | 'scaned' | 'expired' | 'confirmed', botToken?, baseUrl? }`

**Login sequence:**

```
Renderer                  Main Process (WeixinLogin)         WeChat Server
   │                               │                               │
   │── "weixin:login:start" ──→    │                               │
   │                     POST get_bot_qrcode ──────────────────→   │
   │                               │  ←── { qrcode_url, ticket } ──│
   │ ←── "weixin:login:qr" ───────│                               │
   │   (qrcode_url shown in UI)    │                               │
   │                     POST get_qrcode_status (long-poll) ────→  │
   │                               │  ←── { status: "wait" } ──────│
   │                     POST get_qrcode_status (long-poll) ────→  │
   │                               │  ←── { status: "scaned" } ────│
   │ ←── "weixin:login:scanned" ──│                               │
   │                     POST get_qrcode_status (long-poll) ────→  │
   │                               │  ←── { status: "confirmed",   │
   │                               │   botToken, baseUrl } ─────────│
   │                     Save credentials to plugin config         │
   │ ←── "weixin:login:done" ─────│                               │
   │   (accountId returned)        │                               │
```

**QR code expiry:** On `expired` status, re-fetch QR code (max 3 retries, matching SDK behavior).

---

## Type Changes

### `src/process/channels/types.ts`

```typescript
// Add 'weixin' to built-in plugin types
export type BuiltinPluginType = 'telegram' | 'slack' | 'discord' | 'lark' | 'dingtalk' | 'weixin'

// Add weixin case to hasPluginCredentials()
if (type === 'weixin') return !!(credentials.accountId && credentials.botToken)
```

No new fields needed in `IPluginCredentials` — the existing index signature `[key: string]: string | ...` covers `accountId`, `botToken`, and `baseUrl`.

### `src/process/channels/plugins/index.ts`

```typescript
// Add WeChat plugin exports
export { WeixinPlugin } from './weixin/WeixinPlugin'
export * from './weixin/WeixinAdapter'
```

---

## Error Handling

| Scenario | Handling |
|----------|----------|
| Response timeout (5 min) | Reject pending Promise; SDK error-notice sends user-facing error message |
| `onStop()` called with pending responses | Reject all pending Promises with `Error('Plugin stopped')` |
| SDK long-poll failure | SDK handles internally (retry with backoff, session guard) |
| Login QR expired | Re-fetch QR code, update UI (max 3 retries) |
| Invalid credentials on start | Throw in `onStart()` → plugin enters `error` status |

---

## Out of Scope (First Release)

- Sending audio messages (WeChat iLink Bot receive-only for voice)
- Group chat support (SDK `conversationId` for groups vs individuals — defer to later)
- Interactive button/card UI (iLink Bot API does not support this)
- Message editing after send (WeChat does not support message editing)
