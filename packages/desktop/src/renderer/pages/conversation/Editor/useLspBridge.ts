/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Renderer-side LSP bridge — currently a no-op stub.
 *
 * The backend (`aionui-lsp` Rust crate) is wired up and exposes:
 *   POST /api/lsp/sessions       (start)
 *   POST /api/lsp/sessions/stop  (stop)
 *   GET  /api/lsp/ws/:session_id (JSON-RPC over WebSocket)
 *
 * Wiring a real `monaco-languageclient` here is non-trivial because every
 * recent release (v7+) drags in `vscode-languageclient`, which in turn
 * `require("vscode")` — a module that only exists inside the VS Code
 * Electron host. Using it in a plain Electron renderer needs the
 * `@codingame/monaco-vscode-api` shim package (multi-megabyte), Vite
 * config changes to externalize the right submodules, and a service-worker
 * boot sequence. That's its own multi-day integration and out of scope for
 * this vertical slice.
 *
 * Path forward when ready:
 *   1. Add `@codingame/monaco-vscode-api` + a recent `monaco-languageclient`.
 *   2. Call `initialize({ ...services })` from `@codingame/monaco-vscode-api`
 *      before any Monaco model is created.
 *   3. In this hook, on first focused buffer of a server-backed language,
 *      `ipcBridge.lsp.startSession.invoke(...)`, open
 *      `ws://.../api/lsp/ws/:session_id`, wrap with `vscode-ws-jsonrpc`
 *      `toSocket(...)`, and feed reader/writer to a `MonacoLanguageClient`.
 *
 * Until then, Monaco's bundled JS/TS/JSON/CSS/HTML language workers
 * already provide baseline completion + diagnostics for those formats —
 * the editor is not "barebones" without LSP.
 */

import type { OpenBuffer } from './types';

export function useLspBridge(_activeBuffer: OpenBuffer | null): void {
  // Intentionally empty. See module docstring for the integration plan.
}
