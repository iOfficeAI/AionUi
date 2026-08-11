/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Singleton accessor for TeamGuideMcpServer.
 * Call `initTeamGuideService(teamSessionService)` once on app boot (in initBridge.ts).
 * AcpAgent reads the stdio config via `getTeamGuideStdioConfig()` when building session MCP servers.
 */

import type { TeamSessionService } from '@process/team/TeamSessionService';
import type { StdioMcpConfig } from '../team/TeamMcpServer';
import { TeamGuideMcpServer } from './TeamGuideMcpServer';

let _service: TeamGuideMcpServer | null = null;
let _stdioConfig: StdioMcpConfig | null = null;

/**
 * Initialize and start the TeamGuideMcpServer singleton.
 * Must be called before any ACP agent session is created.
 */
export async function initTeamGuideService(teamSessionService: TeamSessionService): Promise<void> {
  if (_service) return; // already started
  _service = new TeamGuideMcpServer(teamSessionService);
  _stdioConfig = await _service.start();
}

/**
 * Returns the stdio MCP config of the running TeamGuideMcpServer,
 * or null if the service has not been started yet.
 */
export function getTeamGuideStdioConfig(): StdioMcpConfig | null {
  return _stdioConfig;
}

/**
 * Stop the singleton server (call on app quit).
 */
export async function stopTeamGuideService(): Promise<void> {
  await _service?.stop();
  _service = null;
  _stdioConfig = null;
}
