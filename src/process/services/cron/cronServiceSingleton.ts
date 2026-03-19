/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { SqliteConversationRepository } from '@process/database/SqliteConversationRepository';
import { workerTaskManager } from '@process/task/worker/workerTaskManagerSingleton';
import { cronBusyGuard } from './CronBusyGuard';
import { CronService } from './CronService';
import { IpcCronEventEmitter } from './IpcCronEventEmitter';
import { SqliteCronRepository } from './SqliteCronRepository';
import { WorkerTaskManagerJobExecutor } from './WorkerTaskManagerJobExecutor';

export const cronService = new CronService(
  new SqliteCronRepository(),
  new IpcCronEventEmitter(),
  new WorkerTaskManagerJobExecutor(workerTaskManager, cronBusyGuard),
  new SqliteConversationRepository()
);
