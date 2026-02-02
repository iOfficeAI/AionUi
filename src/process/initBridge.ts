/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from '@office-ai/platform';
import { initAllBridges } from './bridge';
import { cronService } from '@process/services/cron/CronService';

logger.config({ print: true });

// 初始化所有IPC桥接
initAllBridges();

// Initialize cron service (load jobs from database and start timers)
void cronService.init().catch((error) => {
  console.error('[initBridge] Failed to initialize CronService:', error);
});
