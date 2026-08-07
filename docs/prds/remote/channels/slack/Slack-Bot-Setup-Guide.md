# Slack Bot Setup Guide (AionUi)

Connect AionUi to Slack as a bot using **Socket Mode** (WebSocket). No public URL, reverse proxy, or tunnel is required — it works on your laptop or a private network.

| Item           | Value                                                                      |
| -------------- | -------------------------------------------------------------------------- |
| **Connection** | Socket Mode (WebSocket)                                                    |
| **Tokens**     | Bot Token (`xoxb-…`) + App-Level Token (`xapp-…` with `connections:write`) |
| **Auth model** | Per-user **pairing** (approve once in AionUi Settings)                     |
| **DMs**        | Always accepted (after pairing)                                            |
| **Channels**   | Only allowlisted channel IDs + `@mention` (empty allowlist = **DM-only**)  |

---

## Overview

1. Create a Slack app — preferably **from** [`slack-app-manifest.json`](./slack-app-manifest.json) (scopes, events, Socket Mode, Messages tab).
2. Generate App-Level Token (`xapp-…` + `connections:write`) and install the app (`xoxb-…`).
3. In AionUi: **Settings → Channels → Slack** → paste tokens → **Test & Connect**.
4. DM the bot → pairing code → **Approve** in AionUi.
5. (Optional) Add channel IDs to the allowlist and invite the bot to those channels.

---

## Step 1: Create a Slack App

### Option A: From app manifest (recommended)

Scopes, bot events, Socket Mode, and the Messages tab are pre-declared in
[`slack-app-manifest.json`](./slack-app-manifest.json).

1. Open [https://api.slack.com/apps](https://api.slack.com/apps).
2. **Create New App** → **From an app manifest**.
3. Pick your workspace → paste the full contents of `slack-app-manifest.json` → **Next** → **Create**.
4. Skip ahead to **Step 2: App-Level Token** (Socket Mode is already on; you still need to mint `xapp-…`).

To update an existing app: **App Manifest → Edit** → paste the file → **Save**, then **reinstall** if Slack asks.

### Option B: From scratch (manual)

1. Open [https://api.slack.com/apps](https://api.slack.com/apps).
2. **Create New App** → **From scratch**.
3. App name (e.g. `AionUi`) and workspace → **Create App**.
4. Continue with **Steps 2–5** below (token, scopes, events, Messages tab), then **Step 6**.

---

## Step 2: App-Level Token (Socket Mode)

Even with the manifest, Slack still requires you to **generate** the App-Level Token:

1. **Settings → Socket Mode** — confirm enabled (manifest sets this).
2. **Basic Information → App-Level Tokens** → **Generate Token and Scopes**:
   - Name: any (e.g. `aionui-socket`)
   - Scope: **`connections:write`**
   - **Generate** and copy the token (`xapp-…`)

This is the **App Token** field in AionUi.

---

## Step 3: Bot Token Scopes (manual path only)

If you used **Option A**, scopes are already set — skip to **Step 6**.

**Features → OAuth & Permissions** → **Bot Token Scopes** → add:

| Scope               | Purpose                                                    |
| ------------------- | ---------------------------------------------------------- |
| `chat:write`        | Send messages as the bot                                   |
| `app_mentions:read` | Detect `@mentions` in channels                             |
| `channels:history`  | Receive messages in public channels the bot is in          |
| `channels:read`     | Channel metadata                                           |
| `groups:history`    | Receive messages in private channels the bot is invited to |
| `groups:read`       | Private channel metadata                                   |
| `im:history`        | Receive DMs                                                |
| `im:read`           | DM metadata                                                |
| `im:write`          | Open / manage DMs                                          |
| `users:read`        | Resolve display names for pairing                          |

**Optional later:** `files:read` if attachment download is enabled in a future release.

Missing `channels:history` / `groups:history` is the usual reason the bot works in DMs but never sees channel messages.

---

## Step 4: Event Subscriptions (manual path only)

If you used **Option A**, events are already set — skip to **Step 6**.

1. **Features → Event Subscriptions** → enable events.
2. **Subscribe to bot events**:

| Event              | Required                  | Purpose                                   |
| ------------------ | ------------------------- | ----------------------------------------- |
| `message.im`       | **Yes**                   | Direct messages                           |
| `message.channels` | For public channels       | Messages in public channels the bot joins |
| `message.groups`   | For private channels      | Messages in private channels              |
| `app_mention`      | **Yes** if using channels | `@mention` events                         |

3. **Save Changes**.

> Socket Mode does **not** need a Request URL. Event delivery goes over the WebSocket.

---

## Step 5: Messages Tab / DMs (manual path only)

If you used **Option A**, the Messages tab is already enabled — skip to **Step 6**.

Without this step, users see **“Sending messages to this app has been turned off”**.

1. **Features → App Home**
2. **Show Tabs → Messages Tab** → ON
3. Check **Allow users to send Slash commands and messages from the messages tab**

---

## Step 6: Install to Workspace

1. **Settings → Install App** → **Install to Workspace** → **Allow**.
2. Copy **Bot User OAuth Token** (`xoxb-…`).

If you change scopes or events later, you **must reinstall** the app for changes to apply.

---

## Step 7: Configure AionUi

1. Open **AionUi → Settings → Channels → Slack**.
2. Paste:

| Field                | Value                                                            |
| -------------------- | ---------------------------------------------------------------- |
| **Bot Token**        | `xoxb-…`                                                         |
| **App Token**        | `xapp-…` (with `connections:write`)                              |
| **Allowed channels** | Optional. Comma-separated `C…` / `G…` IDs. **Empty = DMs only.** |

3. Choose **Assistant** and **Model** for this channel (same as Telegram / DingTalk).
4. Click **Test & Connect**.

On success, the plugin enables over Socket Mode and the card shows **Connected**.

### Finding a channel ID

1. In Slack, open the channel → **View channel details** → **About**.
2. Channel ID is at the bottom (`C…` public, `G…` private).

Invite the bot: `/invite @YourBotName` in each allowlisted channel.

---

## Step 8: Pairing (authorization)

AionUi does **not** use a static Slack member allowlist. Access is granted with the **shared channel pairing flow** (same idea as Telegram / Lark / DingTalk).

### Flow

```text
Unauthorized user DMs the bot (or @mentions it in an allowlisted channel)
        │
        ▼
Bot replies with a 6-digit pairing code (valid ~10 minutes)
        │
        ▼
AionUi Settings → Channels → Slack
  · "Pending Pairing Requests" shows user + code
  · Admin clicks Approve (or Reject)
        │
        ▼
User is in "Authorized Users" and can chat
```

### User side (Slack)

1. Open a **DM** with the bot (or `@mention` in an allowlisted channel after the bot is invited).
2. Send any message.
3. Bot replies roughly like:

   > Welcome! To use this bot, you need authorization.
   >
   > Your pairing code: **`048754`**
   >
   > Share this code with the admin… Settings → Channel → Pairing Requests.
   > The code expires in 10 minutes.

4. Wait for the admin to approve (or use **Refresh Code** / **Check Status** if the bot shows those actions).

### Admin side (AionUi)

1. Keep **Settings → Channels → Slack** open (or reopen it).
2. Under **Pending Pairing Requests**:
   - Confirm display name + code
   - **Approve** or **Reject**
3. After approve, the user appears under **Authorized Users**.
4. **Revoke access** removes authorization; the user must pair again.

### Rules

| Rule             | Behavior                                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| Pairing          | **Once per Slack user**, not per message                                                                  |
| Code TTL         | ~10 minutes; request a new code by messaging again / refresh                                              |
| Credentials lock | While any authorized user exists, token fields stay locked until you disable the channel and revoke users |
| Re-pair          | After revoke, the next message triggers a new pairing request                                             |

---

## How the bot responds

| Context                 | Behavior                                                                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1:1 DM**              | After pairing, every message is handled (no `@mention` required)                                                                                               |
| **Allowlisted channel** | Only if channel ID is in **Allowed channels** **and** the bot is `@mentioned` (or `app_mention`)                                                               |
| **Empty allowlist**     | **DM-only** — channel messages are ignored                                                                                                                     |
| **Threads**             | Each Slack thread is its own AionUi conversation session (`channel:thread_root`). Top-level messages open a new thread session; replies continue that session. |

Conversation list titles use a technical slug (e.g. `slack-aionrs-D0BKLLCM-…`), same family as Telegram (`tg-aionrs-…`). Human channel names are not used as titles today.

---

## Troubleshooting

| Problem                         | What to check                                                                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Test & Connect fails            | Bot token + app token valid; app token has `connections:write`; app reinstalled after scope changes                                                                   |
| No DMs / “messages turned off”  | **App Home → Messages Tab** enabled                                                                                                                                   |
| Pairing never appears in AionUi | Channel **Connected**; message was a real user DM (not only bot self-messages); check Pending list + Refresh                                                          |
| Works in DM, not in channels    | `message.channels` / `message.groups` subscribed; `channels:history` / `groups:history`; channel ID in **Allowed channels**; bot `/invite`d; user `@mention`s the bot |
| Connected but silent            | Pairing not approved; wrong workspace; Socket Mode off                                                                                                                |
| Changed scopes, nothing changed | **Reinstall** the app to the workspace                                                                                                                                |

### Quick checklist

1. Socket Mode ON + `xapp-…` with `connections:write`
2. Bot token `xoxb-…` after install
3. Events: `message.im`, `app_mention` (+ channel events if needed)
4. Messages Tab ON
5. AionUi Test & Connect → Connected
6. DM bot → code → Approve in Settings
7. (Channels) allowlist + `/invite` + `@mention`

---

## Related

- Channels PRD: [../channels.md](../channels.md) (F-WEBUI-22 Slack, F-WEBUI-20 pairing)
- UI entry: **Settings → Channels → Slack**
- Backend: AionCore Slack plugin (`plugin_id: slack`, Socket Mode)
