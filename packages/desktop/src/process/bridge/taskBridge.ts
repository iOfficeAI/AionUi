/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 任务管理桥接模块
 * Task Management Bridge Module
 *
 * 负责管理所有运行中的任务（暂停所有、获取运行中任务数量等）
 * Handles management of all running tasks (pause all, get running count, etc.)
 */

import { ipcBridge } from '@/common';
import type { IWorkerTaskManager } from '@process/task/IWorkerTaskManager';

export function initTaskBridge(workerTaskManager: IWorkerTaskManager): void {
  // 暂停所有运行中的任务 / Stop all running tasks
  ipcBridge.task.stopAll.provider(async () => {
    try {
      const tasks = workerTaskManager.listTasks();
      const stopPromises = tasks.map((taskInfo) => {
        const task = workerTaskManager.getTask(taskInfo.id);
        return task?.stop?.();
      });
      await Promise.allSettled(stopPromises);
      return { success: true, count: tasks.length };
    } catch (error) {
      console.error('Failed to stop all tasks:', error);
      return { success: false, count: 0 };
    }
  });

  // 获取运行中的任务数量 / Get count of running tasks
  ipcBridge.task.getRunningCount.provider(async () => {
    try {
      const tasks = workerTaskManager.listTasks();
      return { success: true, count: tasks.length };
    } catch (error) {
      console.error('Failed to get running task count:', error);
      return { success: false, count: 0 };
    }
  });
}
