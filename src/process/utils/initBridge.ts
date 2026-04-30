/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from '@office-ai/platform';
import { initAllBridges } from '../bridge';
import { workerTaskManager } from '@process/task/workerTaskManagerSingleton';
import { initTeamGuideService } from '@process/team/mcp/guide/teamGuideSingleton';

logger.config({ print: true });

initAllBridges({
  workerTaskManager,
});

// Start in-process Aion MCP server for team-guide tools (aion_create_team)
void initTeamGuideService().catch((error) => {
  console.error('[initBridge] Failed to initialize TeamGuideMcpServer:', error);
});
