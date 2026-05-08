/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Remote Agent Bridge — no-op in HTTP bridge mode.
 *
 * All remote agent CRUD, test-connection, and handshake operations are
 * routed via the HTTP bridge directly to the backend REST API at
 * /api/remote-agents/*. Device identity generation and OpenClaw WebSocket
 * handshake are handled by the backend RemoteAgentService.
 *
 * This function is retained for compatibility with the bridge initialization
 * pipeline (bridge/index.ts → initAllBridges).
 */
export function initRemoteAgentBridge(): void {
  // Intentionally empty — all remote agent operations go through
  // ipcBridge.remoteAgent.* which uses HTTP in backend-bridge mode.
}
