/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Singleton accessor for AionMcpService.
 * Call `initAionMcpService(teamSessionService)` once on app boot (in initBridge.ts).
 * AcpAgent reads the stdio config via `getAionMcpStdioConfig()` when building session MCP servers.
 */

import type { TeamSessionService } from '@process/team/TeamSessionService';
import type { StdioMcpConfig } from '@process/team/TeamMcpServer';
import { AionMcpService } from './AionMcpService';

let _service: AionMcpService | null = null;
let _stdioConfig: StdioMcpConfig | null = null;

/**
 * Initialize and start the AionMcpService singleton.
 * Must be called before any ACP agent session is created.
 */
export async function initAionMcpService(teamSessionService: TeamSessionService): Promise<void> {
  if (_service) return; // already started
  _service = new AionMcpService(teamSessionService);
  _stdioConfig = await _service.start();
}

/**
 * Returns the stdio MCP config of the running AionMcpService,
 * or null if the service has not been started yet.
 */
export function getAionMcpStdioConfig(): StdioMcpConfig | null {
  return _stdioConfig;
}

/**
 * Stop the singleton server (call on app quit).
 */
export async function stopAionMcpService(): Promise<void> {
  await _service?.stop();
  _service = null;
  _stdioConfig = null;
}
