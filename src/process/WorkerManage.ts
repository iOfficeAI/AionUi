/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/storage';
import AcpAgentManager from './task/AcpAgentManager';
import { CodexAgentManager } from '@/agent/codex';
import NanoBotAgentManager from './task/NanoBotAgentManager';
import OpenClawAgentManager from './task/OpenClawAgentManager';
// import type { AcpAgentTask } from './task/AcpAgentTask';
import { ProcessChat } from './initStorage';
import type AgentBaseTask from './task/BaseAgentManager';
import { GeminiAgentManager } from './task/GeminiAgentManager';
import { getDatabase } from './database/export';
import type { SwarmSessionManager } from '@/agent/swarm/SwarmSessionManager';

const taskList: {
  id: string;
  task: AgentBaseTask<unknown>;
}[] = [];

const swarmList: {
  id: string;
  swarm: SwarmSessionManager;
}[] = [];

/**
 * Runtime options for building conversations
 * Used by cron jobs to force yoloMode
 */
export interface BuildConversationOptions {
  /** Force yolo mode (auto-approve all tool calls). Defaults to true if not specified. */
  yoloMode?: boolean;
  /** Skip task cache - create a new isolated instance */
  skipCache?: boolean;
}

const getTaskById = (id: string) => {
  return taskList.find((item) => item.id === id)?.task;
};

const buildConversation = (conversation: TChatConversation, options?: BuildConversationOptions) => {
  console.log(`[WorkerManage] buildConversation called: id=${conversation.id}, type=${conversation.type}`);

  // Default yoloMode to true if not explicitly specified
  const yoloMode = options?.yoloMode ?? true;

  // If not skipping cache, check for existing task
  if (!options?.skipCache) {
    const task = getTaskById(conversation.id);
    if (task) {
      console.log(`[WorkerManage] Found cached task for ${conversation.id}`);
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
          yoloMode,
          // Persisted session mode for resume / 持久化的会话模式用于恢复
          sessionMode: conversation.extra.sessionMode,
        },
        conversation.model
      );
      // Only cache if not skipping cache
      if (!options?.skipCache) {
        taskList.push({ id: conversation.id, task });
      }
      return task;
    }
    case 'acp': {
      console.log(`[WorkerManage] Creating AcpAgentManager for ${conversation.id}`);
      const task = new AcpAgentManager({
        ...conversation.extra,
        conversation_id: conversation.id,
        // Runtime options / 运行时选项
        yoloMode,
      });
      if (!options?.skipCache) {
        taskList.push({ id: conversation.id, task });
        console.log(`[WorkerManage] Added ACP task to taskList, total tasks: ${taskList.length}`);
      }
      return task;
    }
    case 'codex': {
      const task = new CodexAgentManager({
        ...conversation.extra,
        conversation_id: conversation.id,
        // Runtime options / 运行时选项
        yoloMode,
        // Persisted session mode for resume / 持久化的会话模式用于恢复
        sessionMode: conversation.extra.sessionMode,
      });
      if (!options?.skipCache) {
        taskList.push({ id: conversation.id, task });
      }
      return task;
    }
    case 'openclaw-gateway': {
      const task = new OpenClawAgentManager({
        ...conversation.extra,
        conversation_id: conversation.id,
        // Runtime options / 运行时选项
        yoloMode,
      });
      if (!options?.skipCache) {
        taskList.push({ id: conversation.id, task });
      }
      return task;
    }
    case 'nanobot': {
      const task = new NanoBotAgentManager({
        ...conversation.extra,
        conversation_id: conversation.id,
        yoloMode,
      });
      if (!options?.skipCache) {
        taskList.push({ id: conversation.id, task });
      }
      return task;
    }
    case 'swarm': {
      // Swarm conversations don't have tasks - they have SwarmSessionManager
      // which is registered separately via registerSwarm()
      console.log(`[WorkerManage] Skipping task build for swarm conversation ${conversation.id}`);
      return null;
    }
    default: {
      return null;
    }
  }
};

const getTaskByIdRollbackBuild = async (id: string, options?: BuildConversationOptions): Promise<AgentBaseTask<unknown>> => {
  console.log(`[WorkerManage] getTaskByIdRollbackBuild: id=${id}, options=${JSON.stringify(options)}`);

  // If not skipping cache, check for existing task
  if (!options?.skipCache) {
    const task = taskList.find((item) => item.id === id)?.task;
    if (task) {
      console.log(`[WorkerManage] Found existing task in memory for: ${id}`);
      return Promise.resolve(task);
    }
  }

  // Try to load from database first
  const db = getDatabase();
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

const kill = (id: string) => {
  const index = taskList.findIndex((item) => item.id === id);
  if (index === -1) return;
  const task = taskList[index];
  if (task) {
    task.task.kill();
  }
  taskList.splice(index, 1);
};

const clear = () => {
  taskList.forEach((item) => {
    item.task.kill();
  });
  taskList.length = 0;
};

const addTask = (id: string, task: AgentBaseTask<unknown>) => {
  const existing = taskList.find((item) => item.id === id);
  if (existing) {
    existing.task = task;
  } else {
    taskList.push({ id, task });
  }
};

const listTasks = () => {
  return taskList.map((t) => ({ id: t.id, type: t.task.type }));
};

const registerSwarm = (parentConversationId: string, swarm: SwarmSessionManager) => {
  const existing = swarmList.find((item) => item.id === parentConversationId);
  if (existing) {
    existing.swarm = swarm;
  } else {
    swarmList.push({ id: parentConversationId, swarm });
  }
};

const getSwarmById = (parentConversationId: string): SwarmSessionManager | undefined => {
  return swarmList.find((item) => item.id === parentConversationId)?.swarm;
};

const WorkerManage = {
  buildConversation,
  getTaskById,
  getTaskByIdRollbackBuild,
  addTask,
  listTasks,
  kill,
  clear,
  registerSwarm,
  getSwarmById,
};

export default WorkerManage;
