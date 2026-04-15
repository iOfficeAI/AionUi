/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { cronBusyGuard } from '@process/services/cron/CronBusyGuard';
import { conversationLiveStateService } from '@process/services/ConversationLiveStateService';
import { ConversationTurnCompletionService } from '@process/services/ConversationTurnCompletionService';
import { workerTaskManager } from '@process/task/workerTaskManagerSingleton';
import { releaseConversationMessageCache } from '@process/utils/message';

type ConversationRuntimeTaskStatus = 'pending' | 'running' | 'finished';

export type ConversationRuntimeTask = {
  status?: ConversationRuntimeTaskStatus;
  getConfirmations?: () => unknown[];
  stop?: () => Promise<void>;
};

type ConversationRuntimeSource = 'workerTaskManager';

export type ConversationRuntimeTaskResolution = {
  task?: ConversationRuntimeTask;
  source?: ConversationRuntimeSource;
  workerTask?: ConversationRuntimeTask;
};

type GetConversationRuntimeTaskOptions = {
  touchLegacyTask?: boolean;
};

export const getConversationRuntimeTask = (
  sessionId: string,
  _options: GetConversationRuntimeTaskOptions = {}
): ConversationRuntimeTaskResolution => {
  const workerTask = workerTaskManager.getTask(sessionId) as ConversationRuntimeTask | undefined;

  if (workerTask) {
    return {
      task: workerTask,
      source: 'workerTaskManager',
      workerTask,
    };
  }

  return {
    workerTask,
  };
};

export const listConversationRuntimeTaskIds = (): string[] => {
  return workerTaskManager.listTasks().map(({ id }) => id);
};

export const stopConversationRuntime = async (
  sessionId: string
): Promise<{ success: boolean; msg?: string; attemptedSources: ConversationRuntimeSource[] }> => {
  const { workerTask } = getConversationRuntimeTask(sessionId, { touchLegacyTask: false });
  const attemptedSources: ConversationRuntimeSource[] = [];

  const stopOne = async (task: ConversationRuntimeTask | undefined, source: ConversationRuntimeSource) => {
    if (!task || typeof task.stop !== 'function') {
      return;
    }

    attemptedSources.push(source);
    await task.stop();
  };

  try {
    await stopOne(workerTask, 'workerTaskManager');

    return {
      success: true,
      attemptedSources,
      msg: attemptedSources.length > 0 ? undefined : 'conversation not found',
    };
  } catch (error) {
    return {
      success: false,
      attemptedSources,
      msg: error instanceof Error ? error.message : String(error),
    };
  }
};

const forgetConversationTurnCompletionSession = async (sessionId: string): Promise<void> => {
  try {
    ConversationTurnCompletionService.getInstance().forgetSession(sessionId);
  } catch (error) {
    console.warn('[ConversationRuntimeService] Failed to forget turn completion state:', error, { sessionId });
  }
};

const forgetConversationLiveStateSession = async (sessionId: string): Promise<void> => {
  try {
    conversationLiveStateService.forgetSession(sessionId);
  } catch (error) {
    console.warn('[ConversationRuntimeService] Failed to forget live conversation state:', error, { sessionId });
  }
};

const cleanupWorkerOnlyRuntimeArtifacts = async (sessionId: string): Promise<void> => {
  cronBusyGuard.remove(sessionId);
  await forgetConversationTurnCompletionSession(sessionId);
  await forgetConversationLiveStateSession(sessionId);

  try {
    await releaseConversationMessageCache(sessionId, {
      persistPending: true,
    });
  } catch (error) {
    console.warn('[ConversationRuntimeService] Failed to release conversation message cache:', error, { sessionId });
  }
};

export const drainConversationRuntime = async (sessionId: string): Promise<void> => {
  const workerTask = workerTaskManager.getTask(sessionId) as ConversationRuntimeTask | undefined;

  if (workerTask) {
    if (typeof workerTaskManager.removeTask === 'function') {
      workerTaskManager.removeTask(sessionId);
    } else {
      workerTaskManager.kill(sessionId);
    }
  }

  await cleanupWorkerOnlyRuntimeArtifacts(sessionId);
};
