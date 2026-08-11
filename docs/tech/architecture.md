# Architecture

## Multi-Process Model

AionUi is an Electron app with three types of processes:

- **Main Process** (`src/process/`, `src/index.ts`) — application logic, database, IPC handling. No DOM APIs available.
- **Renderer Process** (`src/renderer/`) — React UI. No Node.js APIs available.
- **Worker Processes** (`src/process/worker/`) — background AI tasks (gemini, codex, acp workers).

Cross-process communication must go through the IPC bridge.

## IPC Communication

- Preload script: `src/preload.ts` — exposes a secure `contextBridge` API to the renderer
- Message type definitions: `src/renderer/messages/`
- All IPC channels are typed; add new channels in both the preload and the messages directory

## WebUI Server

Located in `src/process/webserver/`.

- Express + WebSocket for real-time communication
- JWT authentication for remote access
- Enables network clients to access the agent UI remotely (not just local Electron window)

## Run Modes

AionUi can run in four modes. The WebSocket channel is the browser-side equivalent of
Electron IPC — both transports reach the same bridge handlers and services.

```
start / cli  (Electron desktop)
┌─────────────────────────────────────────────────────┐
│  Electron window          Browser (optional WebUI)  │
│      │                          │                   │
│      │ IPC                      │ WebSocket         │
│      ▼                          ▼                   │
│       bridge handlers / services / DB               │
└─────────────────────────────────────────────────────┘

webui  (Electron, no window)
┌─────────────────────────────────────────────────────┐
│  (no Electron window)     Browser                   │
│                                  │                  │
│                                  │ WebSocket        │
│                                  ▼                  │
│       bridge handlers / services / DB               │
│       + full Electron API (fsBridge, cronBridge,    │
│         mcpBridge, notificationBridge …)            │
└─────────────────────────────────────────────────────┘

server  (pure Node.js, no Electron)
┌─────────────────────────────────────────────────────┐
│  (no Electron window)     Browser                   │
│                                  │                  │
│                                  │ WebSocket        │
│                                  ▼                  │
│       bridge handlers / services / DB               │
│       (10 Electron-only bridges unavailable:        │
│        fsBridge, cronBridge, mcpBridge,             │
│        dialogBridge, shellBridge, applicationBridge,│
│        windowControlsBridge, updateBridge,          │
│        webuiBridge, notificationBridge)             │
└─────────────────────────────────────────────────────┘
```

Authentication flow (WebUI / server modes):

1. `POST /login` → JWT token
2. Connect WebSocket with token (verified on handshake)
3. All bridge calls travel over the WebSocket connection

## Cron System

Located in `src/process/services/cron/`.

- Based on `croner` library
- `CronService`: task scheduling engine
- `CronBusyGuard`: prevents concurrent execution of the same job
