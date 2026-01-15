/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/storage';
import AcpAgentManager from './task/AcpAgentManager';
import { CodexAgentManager } from '@/agent/codex';
// import type { AcpAgentTask } from './task/AcpAgentTask';
import { ProcessChat } from './initStorage';
import type AgentBaseTask from './task/BaseAgentManager';
import { GeminiAgentManager } from './task/GeminiAgentManager';
import { getDatabase } from './database/export';

const taskList: {
  id: string;
  task: AgentBaseTask<unknown>;
}[] = [];

const getTaskById = (id: string) => {
  return taskList.find((item) => item.id === id)?.task;
};

const buildConversation = (conversation: TChatConversation) => {
  const task = getTaskById(conversation.id);

  if (task) {
    return task;
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
        },
        conversation.model
      );
      taskList.push({ id: conversation.id, task });
      return task;
    }
    case 'acp': {
      const task = new AcpAgentManager({ ...conversation.extra, conversation_id: conversation.id });
      taskList.push({ id: conversation.id, task });
      return task;
    }
    case 'codex': {
      const task = new CodexAgentManager({ ...conversation.extra, conversation_id: conversation.id });
      taskList.push({ id: conversation.id, task });
      return task;
    }
    default: {
      return null;
    }
  }
};

const getTaskByIdRollbackBuild = async (id: string): Promise<AgentBaseTask<unknown>> => {
  const task = taskList.find((item) => item.id === id)?.task;
  if (task) return Promise.resolve(task);
  // Try to load from database first
  const db = getDatabase();
  const dbResult = db.getConversation(id);

  if (dbResult.success && dbResult.data) {
    return buildConversation(dbResult.data);
  }

  // Fallback to file storage
  const list = (await ProcessChat.get('chat.history')) as TChatConversation[] | undefined;
  const conversation = list?.find((item) => item.id === id);
  if (conversation) {
    return buildConversation(conversation);
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

const WorkerManage = {
  buildConversation,
  getTaskById,
  getTaskByIdRollbackBuild,
  addTask,
  listTasks,
  kill,
  clear,
};

export default WorkerManage;
