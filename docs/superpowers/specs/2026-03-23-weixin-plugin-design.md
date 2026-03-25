# WeChat (Weixin) Plugin Design

**Date:** 2026-03-23
**Status:** Approved (v2 — post-review fixes)
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
├── WeixinPlugin.ts       # BasePlugin subclass + Promise bridge
├── WeixinAdapter.ts      # ChatRequest/Response <-> IUnified* conversion
├── WeixinLogin.ts        # QR code login (independent HTTP implementation)
├── WeixinLoginHandler.ts # IPC handler class (instantiated by src/process/ipc/ setup)
└── index.ts              # Exports
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
  accountId: string; // logged-in account ID, passed to SDK start()
  botToken: string; // iLink Bot token (used by SDK internally)
  baseUrl: string; // API base URL, default: https://ilinkai.weixin.qq.com
}
```

**Lifecycle:**

| Method                                            | Behavior                                                                                                                                      |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `onInitialize(config)`                            | Validate `accountId` + `botToken` in credentials                                                                                              |
| `onStart()`                                       | Create `AbortController`; set `_stopping = false`; call `start(agent, { accountId, abortSignal })`                                            |
| `onStop()`                                        | (1) Set `_stopping = true`; (2) Reject all pending responses with `Error('Plugin stopped')`; (3) Call `abortController.abort()`               |
| `async sendMessage(chatId, msg): Promise<string>` | Record `chatId` as initial placeholder key; return `"weixin_pending_{chatId}"` (satisfies `BasePlugin.sendMessage: Promise<string>` override) |
| `editMessage(chatId, msgId, msg)`                 | Accumulate text; resolve Promise on `replyMarkup` flag (`msgId` ignored — see note below)                                                     |
| `getActiveUserCount()`                            | Return size of active users Set                                                                                                               |
| `getBotInfo()`                                    | Return `{ id: accountId, displayName: 'Aion Assistant' }`                                                                                     |

**`static async testConnection(accountId: string, botToken?: string)`** — static override of `BasePlugin.testConnection`. Verifies local credential file exists at `~/.openclaw/openclaw-weixin/accounts/<accountId>.json` and that it contains a valid token. No network call.

> Note on `msgId` in `editMessage`: WeChat does not support message editing. The `pendingResponses` map is keyed by `chatId` (= WeChat user ID), not `msgId`. The `msgId` parameter is intentionally ignored.

### Promise Bridge

```typescript
interface PendingResponse {
  resolve: (response: ChatResponse) => void;
  reject: (error: Error) => void;
  accumulatedText: string; // collects streaming text chunks
  mediaResponse?: ChatResponse['media'];
  timer: NodeJS.Timeout; // 5-minute timeout
}

// Map keyed by chatId (= WeChat conversationId = user ID)
pendingResponses: Map<string, PendingResponse>;

// Prevents new entries after onStop() is called
_stopping: boolean;
```

**Concurrent request handling:** If `agent.chat(request)` is called while a `PendingResponse` already exists for the same `conversationId` (user sends a second message before AI responds), the existing entry is rejected with `Error('superseded')` and a new entry is created. This ensures the latest user message always gets processed.

**Resolution flow:**

1. `agent.chat(request)` called:
   - If `_stopping` → immediately reject with `Error('Plugin stopped')`
   - If existing pending for `conversationId` → reject old with `Error('superseded')`, clear its timer
   - Create new `PendingResponse`, set 5-minute timer, call `emitMessage()`, suspend Promise
2. `sendMessage(chatId, msg)` → record placeholder, return `"weixin_pending_{chatId}"` (do NOT resolve)
3. `editMessage(chatId, msgId, msg)` → accumulate `msg.text`; if `msg.type === 'image'` or `msg.type === 'file'`, store media; if `msg.replyMarkup` set → resolve and clear timer
4. Timeout → `reject(new Error('Response timeout'))`; SDK built-in error-notice notifies user

### WeixinAdapter

Stateless conversion functions.

**Inbound:** `toUnifiedIncomingMessage(request: ChatRequest): IUnifiedIncomingMessage`

| ChatRequest field               | IUnifiedIncomingMessage field     | Notes                                                        |
| ------------------------------- | --------------------------------- | ------------------------------------------------------------ |
| `conversationId`                | `id`, `chatId`, `user.id`         | WeChat user ID                                               |
| `conversationId` (last 6 chars) | `user.displayName`                | Fallback if no name available                                |
| `text`                          | `content.text`                    |                                                              |
| `media.type`                    | `content.type`                    | `image→photo`, `audio→audio`, `video→video`, `file→document` |
| `media.filePath`                | `content.attachments[0].fileId`   | Local decrypted path (SDK handles download+decrypt)          |
| `media.mimeType`                | `content.attachments[0].mimeType` |                                                              |
| `media.fileName`                | `content.attachments[0].fileName` | File attachments only                                        |
| `Date.now()`                    | `timestamp`                       | SDK `ChatRequest` has no timestamp field                     |
| `'weixin'`                      | `platform`                        |                                                              |

Note: SDK automatically downloads, decrypts, and transcodes media (silk→wav for audio) before calling `agent.chat()`. No additional media processing needed in the adapter.

**Outbound:** `toChatResponse(message: IUnifiedOutgoingMessage): ChatResponse`

| IUnifiedOutgoingMessage                    | ChatResponse                                      | Notes                                        |
| ------------------------------------------ | ------------------------------------------------- | -------------------------------------------- |
| `text`                                     | `text`                                            | Markdown auto-converted to plain text by SDK |
| `type === 'image'` + `imageUrl`            | `media: { type: 'image', url: imageUrl }`         |                                              |
| `type === 'file'` + `fileUrl` + `fileName` | `media: { type: 'file', url: fileUrl, fileName }` |                                              |
| `buttons` / `replyMarkup`                  | Ignored                                           | iLink Bot does not support interactive cards |

**Media type support:**

| AionUi unified type | WeChat SDK type | Direction                                           |
| ------------------- | --------------- | --------------------------------------------------- |
| `photo`             | `image`         | Receive + send                                      |
| `audio`             | —               | Receive only (SDK transcodes silk→wav); cannot send |
| `video`             | `video`         | Receive + send                                      |
| `document`          | `file`          | Receive + send                                      |

### WeixinLogin

Independent HTTP implementation for the QR-code login flow. Does NOT use SDK's `login()` (which only supports terminal output). Calls two WeChat API endpoints directly.

**Endpoints used:**

- `POST ilink/bot/get_bot_qrcode` → `{ qrcode_url, ticket }`
- `POST ilink/bot/get_qrcode_status` → `{ status: 'wait' | 'scaned' | 'expired' | 'confirmed', botToken?, baseUrl? }`

**Login sequence:**

```
Renderer                  WeixinLoginHandler (main process)   WeChat Server
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

### WeixinLoginHandler

Main process IPC handler class. The file lives in `src/process/channels/plugins/weixin/WeixinLoginHandler.ts` and is instantiated and registered from the main IPC setup in `src/process/ipc/` alongside other channel IPC handlers.

Registers the following IPC channels on the `ipcMain`:

| Channel                | Direction       | Description                                   |
| ---------------------- | --------------- | --------------------------------------------- |
| `weixin:login:start`   | renderer → main | Trigger login; returns `accountId` on success |
| `weixin:login:qr`      | main → renderer | Push QR code URL to UI                        |
| `weixin:login:scanned` | main → renderer | Notify QR code scanned                        |
| `weixin:login:done`    | main → renderer | Notify login complete with `accountId`        |

Exposed to renderer via `src/preload.ts` under a `weixin` namespace, consistent with the existing IPC bridge pattern.

---

## Type Changes

### `src/process/channels/types.ts`

```typescript
// 1. Add 'weixin' to built-in plugin types
export type BuiltinPluginType = 'telegram' | 'slack' | 'discord' | 'lark' | 'dingtalk' | 'weixin';

// 2. Add weixin case to hasPluginCredentials()
if (type === 'weixin') return !!(credentials.accountId && credentials.botToken);

// 3. Add weixin to shortPlatform mapping (used in conversation name formatting)
const shortPlatform: Record<string, string> = { telegram: 'tg', dingtalk: 'ding', weixin: 'wx' };
```

No new fields needed in `IPluginCredentials` — the existing index signature `[key: string]: string | ...` covers `accountId`, `botToken`, and `baseUrl`.

### `src/process/channels/plugins/index.ts`

```typescript
// Add WeChat plugin exports
export { WeixinPlugin } from './weixin/WeixinPlugin';
export * from './weixin/WeixinAdapter';
```

---

## Error Handling

| Scenario                                  | Handling                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| Response timeout (5 min)                  | Reject pending Promise; SDK error-notice sends user-facing error message |
| User sends 2nd message before AI responds | Reject old Promise with `Error('superseded')`; process new message       |
| `onStop()` called with pending responses  | (1) Set `_stopping`; (2) Reject all pending; (3) Abort SDK               |
| SDK long-poll failure                     | SDK handles internally (retry with backoff, session guard)               |
| Login QR expired                          | Re-fetch QR code, update UI (max 3 retries)                              |
| Invalid credentials on start              | Throw in `onStart()` → plugin enters `error` status                      |

---

## Out of Scope (First Release)

- Sending audio messages (WeChat iLink Bot receive-only for voice)
- Group chat support (SDK `conversationId` for groups vs individuals — defer to later)
- Interactive button/card UI (iLink Bot API does not support this)
- Message editing after send (WeChat does not support message editing)
