/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import AcpAgentManager from './task/AcpAgentManager';
import CodexAgentManager from './task/CodexAgentManager';
import NanoBotAgentManager from './task/NanoBotAgentManager';
import OpenClawAgentManager from './task/OpenClawAgentManager';
// import type { AcpAgentTask } from './task/AcpAgentTask';
import { ProcessChat } from '@process/utils/initStorage';
import type AgentBaseTask from './task/BaseAgentManager';
import { GeminiAgentManager } from './task/GeminiAgentManager';
import { getDatabase, getDatabaseSync } from '@process/services/database';
import { releaseConversationMessageCache } from '@process/utils/message';
import { cronBusyGuard } from './services/cron/CronBusyGuard';
import { ConversationTurnCompletionService } from './services/ConversationTurnCompletionService';
import { workerTaskManager } from './task/workerTaskManagerSingleton';

const taskList: {
  id: string;
  task: AgentBaseTask<unknown>;
  lastUsedAt: number;
}[] = [];

const FINISHED_TASK_IDLE_EVICT_MS = 2 * 60 * 1000;
const MAX_CACHED_TASKS = 30;

/**
 * Runtime options for building conversations
 * Used by cron jobs to force yoloMode
 */
export interface BuildConversationOptions {
  /** Force yolo mode (auto-approve all tool calls) */
  yoloMode?: boolean;
  /** Skip task cache - create a new isolated instance */
  skipCache?: boolean;
}

const touchTask = (id: string) => {
  const entry = taskList.find((item) => item.id === id);
  if (entry) {
    entry.lastUsedAt = Date.now();
  }
  return entry;
};

const destroyTask = async (id: string, task: AgentBaseTask<unknown>) => {
  try {
    const cleanupCapableTask = task as AgentBaseTask<unknown> & { cleanup?: () => void };
    if (typeof cleanupCapableTask.cleanup === 'function') {
      cleanupCapableTask.cleanup();
    }
  } catch (error) {
    console.warn('[WorkerManage] Failed to cleanup task before removal:', error, { id });
  }

  try {
    task.kill();
  } catch (error) {
    console.warn('[WorkerManage] Failed to kill task during removal:', error, { id });
  }

  cronBusyGuard.remove(id);
  ConversationTurnCompletionService.getInstance().forgetSession(id);

  try {
    await releaseConversationMessageCache(id, {
      persistPending: true,
    });
  } catch (error) {
    console.warn('[WorkerManage] Failed to release conversation message cache:', error, { id });
  }
};

const isPrunableConversation = (id: string): boolean => {
  let db;
  try {
    db = getDatabaseSync();
  } catch {
    return false;
  }
  const result = db.getConversation(id);
  if (!result.success || !result.data) {
    return false;
  }

  const conversation = result.data;
  const extra = (conversation.extra || {}) as { isHealthCheck?: boolean };

  return conversation.source === 'api' || extra.isHealthCheck === true;
};

const shouldKeepTask = (
  entry: { id: string; task: AgentBaseTask<unknown>; lastUsedAt: number },
  now: number
): boolean => {
  if (!isPrunableConversation(entry.id)) {
    return true;
  }

  if (entry.task.status !== 'finished') {
    return true;
  }

  if (typeof entry.task.getConfirmations === 'function' && entry.task.getConfirmations().length > 0) {
    return true;
  }

  return now - entry.lastUsedAt < FINISHED_TASK_IDLE_EVICT_MS;
};

const getTaskById = (id: string) => {
  return touchTask(id)?.task;
};

const peekTaskById = (id: string) => {
  return taskList.find((item) => item.id === id)?.task;
};

const buildConversation = (conversation: TChatConversation, options?: BuildConversationOptions) => {
  // If not skipping cache, check for existing task
  if (!options?.skipCache) {
    const task = getTaskById(conversation.id);
    if (task) {
      return task;
    }
  }

  switch (conversation.type) {
    case 'gemini': {
      const task = new GeminiAgentManager(
        {
          workspace: conversation.extra.workspace,
          conversation_id: conversation.id,
          webSearchEngine: conversation.extra.webSearchEngine,
          // 系统规则 / System rules
          presetRules: conversation.extra.presetRules,
          // 向后兼容 / Backward compatible
          contextContent: conversation.extra.contextContent,
          // 启用的 skills 列表（通过 SkillManager 加载）/ Enabled skills list (loaded via SkillManager)
          enabledSkills: conversation.extra.enabledSkills,
          // Runtime options / 运行时选项
          yoloMode: options?.yoloMode,
          // Persisted session mode for resume / 持久化的会话模式用于恢复
          sessionMode: conversation.extra.sessionMode,
        },
        conversation.model
      );
      // Only cache if not skipping cache
      if (!options?.skipCache) {
        taskList.push({ id: conversation.id, task, lastUsedAt: Date.now() });
      }
      return task;
    }
    case 'acp': {
      const task = new AcpAgentManager({
        ...conversation.extra,
        backend: conversation.extra.backend as import('@/common/types/acpTypes').AcpBackendAll,
        conversation_id: conversation.id,
        // Runtime options / 运行时选项
        yoloMode: options?.yoloMode,
      });
      if (!options?.skipCache) {
        taskList.push({ id: conversation.id, task, lastUsedAt: Date.now() });
      }
      return task;
    }
    case 'codex': {
      const task = new CodexAgentManager({
        ...conversation.extra,
        conversation_id: conversation.id,
        // Runtime options / 运行时选项
        yoloMode: options?.yoloMode,
        // Persisted session mode for resume / 持久化的会话模式用于恢复
        sessionMode: conversation.extra.sessionMode,
      });
      if (!options?.skipCache) {
        taskList.push({ id: conversation.id, task, lastUsedAt: Date.now() });
      }
      return task;
    }
    case 'openclaw-gateway': {
      const task = new OpenClawAgentManager({
        ...conversation.extra,
        conversation_id: conversation.id,
        // Runtime options / 运行时选项
        yoloMode: options?.yoloMode,
      });
      if (!options?.skipCache) {
        taskList.push({ id: conversation.id, task, lastUsedAt: Date.now() });
      }
      return task;
    }
    case 'nanobot': {
      const task = new NanoBotAgentManager({
        ...conversation.extra,
        conversation_id: conversation.id,
        yoloMode: options?.yoloMode,
      });
      if (!options?.skipCache) {
        taskList.push({ id: conversation.id, task, lastUsedAt: Date.now() });
      }
      return task;
    }
    default: {
      return null;
    }
  }
};

const getTaskByIdRollbackBuild = async (
  id: string,
  options?: BuildConversationOptions
): Promise<AgentBaseTask<unknown>> => {
  console.log(`[WorkerManage] getTaskByIdRollbackBuild: id=${id}, options=${JSON.stringify(options)}`);

  // If not skipping cache, check for existing task
  if (!options?.skipCache) {
    const task = touchTask(id)?.task;
    if (task) {
      console.log(`[WorkerManage] Found existing task in memory for: ${id}`);
      return Promise.resolve(task);
    }
  }

  // Try to load from database first
  const db = await getDatabase();
  const dbResult = db.getConversation(id);
  console.log(`[WorkerManage] Database lookup result: success=${dbResult.success}, hasData=${!!dbResult.data}`);

  if (dbResult.success && dbResult.data) {
    console.log(`[WorkerManage] Building conversation from database: ${id}`);
    return buildConversation(dbResult.data, options);
  }

  // Fallback to file storage
  const list = (await ProcessChat.get('chat.history')) as TChatConversation[] | undefined;
  const conversation = list?.find((item) => item.id === id);
  if (conversation) {
    console.log(`[WorkerManage] Building conversation from file storage: ${id}`);
    return buildConversation(conversation, options);
  }

  console.error('[WorkerManage] Conversation not found in database or file storage:', id);
  return Promise.reject(new Error('Conversation not found'));
};

type SendMessageResult =
  | { success: true }
  | {
      success: false;
      msg: string;
    };

const sendMessage = async (
  conversationId: string,
  message: string,
  msgId: string,
  files?: string[]
): Promise<SendMessageResult> => {
  let task = workerTaskManager.getTask(conversationId) as AgentBaseTask<unknown> | undefined;

  try {
    if (!task) {
      task = (await workerTaskManager.getOrBuildTask(conversationId)) as AgentBaseTask<unknown>;
    }
  } catch (workerTaskError) {
    try {
      task = await getTaskByIdRollbackBuild(conversationId);
    } catch (legacyTaskError) {
      const error =
        legacyTaskError instanceof Error
          ? legacyTaskError
          : workerTaskError instanceof Error
            ? workerTaskError
            : new Error('conversation not found');
      return {
        success: false,
        msg: error.message,
      };
    }
  }

  if (!task) {
    return {
      success: false,
      msg: 'conversation not found',
    };
  }

  try {
    if (task.type === 'gemini') {
      await (task as GeminiAgentManager).sendMessage({ input: message, msg_id: msgId, files });
      return { success: true };
    }
    if (task.type === 'acp') {
      await (task as AcpAgentManager).sendMessage({ content: message, msg_id: msgId, files });
      return { success: true };
    }
    if (task.type === 'codex') {
      await (task as CodexAgentManager).sendMessage({ content: message, msg_id: msgId, files });
      return { success: true };
    }
    if (task.type === 'openclaw-gateway') {
      await (task as OpenClawAgentManager).sendMessage({ content: message, msg_id: msgId, files });
      return { success: true };
    }
    if (task.type === 'nanobot') {
      await (task as NanoBotAgentManager).sendMessage({ content: message, msg_id: msgId, files });
      return { success: true };
    }
    return { success: false, msg: `Unsupported task type: ${task.type}` };
  } catch (error) {
    return {
      success: false,
      msg: error instanceof Error ? error.message : 'Failed to send message',
    };
  }
};

const kill = (id: string) => {
  const index = taskList.findIndex((item) => item.id === id);
  if (index === -1) return;
  const task = taskList[index];
  taskList.splice(index, 1);
  if (task) {
    void destroyTask(id, task.task);
  }
};

const killAndDrain = async (id: string) => {
  const index = taskList.findIndex((item) => item.id === id);
  if (index === -1) return;
  const task = taskList[index];
  taskList.splice(index, 1);
  if (task) {
    await destroyTask(id, task.task);
  }
};

const clear = () => {
  taskList.forEach((item) => {
    void destroyTask(item.id, item.task);
  });
  taskList.length = 0;
};

const addTask = (id: string, task: AgentBaseTask<unknown>) => {
  const existing = taskList.find((item) => item.id === id);
  if (existing) {
    existing.task = task;
    existing.lastUsedAt = Date.now();
  } else {
    taskList.push({ id, task, lastUsedAt: Date.now() });
  }
};

const pruneIdleTasks = (now: number = Date.now()) => {
  const removableIndexes = taskList
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => !shouldKeepTask(entry, now))
    .toSorted((left, right) => right.index - left.index)
    .map(({ index }) => index);

  removableIndexes.forEach((index) => {
    const [removed] = taskList.splice(index, 1);
    if (removed) {
      void destroyTask(removed.id, removed.task);
    }
  });

  if (taskList.length <= MAX_CACHED_TASKS) {
    return;
  }

  const overflowCandidates = taskList
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.task.status === 'finished' && isPrunableConversation(entry.id))
    .toSorted((left, right) => left.entry.lastUsedAt - right.entry.lastUsedAt);

  const overflowCount = taskList.length - MAX_CACHED_TASKS;
  overflowCandidates
    .slice(0, overflowCount)
    .toSorted((left, right) => right.index - left.index)
    .forEach(({ index }) => {
      const [removed] = taskList.splice(index, 1);
      if (removed) {
        void destroyTask(removed.id, removed.task);
      }
    });
};

const listTasks = () => {
  return taskList.map((t) => ({ id: t.id, type: t.task.type }));
};

const getDebugInfo = () => {
  const now = Date.now();
  const tasks = taskList.map((entry) => {
    const taskWithDiagnostics = entry.task as AgentBaseTask<unknown> & {
      getDiagnostics?: () => unknown;
    };

    return {
      id: entry.id,
      type: entry.task.type,
      status: entry.task.status,
      lastUsedAt: entry.lastUsedAt,
      idleForMs: Math.max(now - entry.lastUsedAt, 0),
      confirmationCount: typeof entry.task.getConfirmations === 'function' ? entry.task.getConfirmations().length : 0,
      isPrunable: isPrunableConversation(entry.id),
      diagnostics:
        typeof taskWithDiagnostics.getDiagnostics === 'function' ? taskWithDiagnostics.getDiagnostics() : undefined,
    };
  });

  return {
    totalTasks: tasks.length,
    tasks,
  };
};

const WorkerManage = {
  buildConversation,
  getTaskById,
  peekTaskById,
  getTaskByIdRollbackBuild,
  sendMessage,
  addTask,
  listTasks,
  getDebugInfo,
  pruneIdleTasks,
  kill,
  killAndDrain,
  clear,
};

export default WorkerManage;
