/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { logger } from '@office-ai/platform';
import { initAllBridges } from './bridge';
import { SqliteConversationRepository } from '@process/database/SqliteConversationRepository';
import { ConversationServiceImpl } from '@process/services/ConversationServiceImpl';
import { cronService } from '@process/services/cron/CronService';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';
import WorkerManage from '@process/WorkerManage';

logger.config({ print: true });

// Thin shim: adapts the existing WorkerManage module to IWorkerTaskManager.
// WorkerManage uses BaseAgentManager internally; the cast to IAgentManager is safe
// because all concrete managers implement the interface in practice.
// This shim will be replaced in PR 4 when WorkerTaskManager is introduced.
const workerTaskManagerShim: IWorkerTaskManager = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getTask: (id) => (WorkerManage.getTaskById(id) as any) ?? undefined,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getOrBuildTask: (id, opts) => WorkerManage.getTaskByIdRollbackBuild(id, opts) as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addTask: (id, task) => WorkerManage.addTask(id, task as any),
  kill: (id) => WorkerManage.kill(id),
  clear: () => WorkerManage.clear(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listTasks: () => WorkerManage.listTasks() as any,
};

const repo = new SqliteConversationRepository();
const conversationServiceImpl = new ConversationServiceImpl(repo);

// 初始化所有IPC桥接
initAllBridges({
  conversationService: conversationServiceImpl,
  workerTaskManager: workerTaskManagerShim,
});

// Initialize cron service (load jobs from database and start timers)
void cronService.init().catch((error) => {
  console.error('[initBridge] Failed to initialize CronService:', error);
});
