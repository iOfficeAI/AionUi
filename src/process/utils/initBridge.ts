/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from '@office-ai/platform';
import { initAllBridges } from '../bridge';
import { workerTaskManager } from '@process/task/workerTaskManagerSingleton';

logger.config({ print: true });

initAllBridges({
  workerTaskManager,
});
