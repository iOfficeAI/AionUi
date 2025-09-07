/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/storage';
import AcpAgentManager from './task/AcpAgentManager';
// import type { AcpAgentTask } from './task/AcpAgentTask';
import type AgentBaseTask from './task/BaseAgentManager';
import { GeminiAgentManager } from './task/GeminiAgentManager';

const taskList: {
  id: string;
  task: AgentBaseTask<any>;
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
      // For ACP tasks, they are created directly in initBridge.ts
      // We just need to add them to the taskList when they're passed here
      return null; // ACP tasks are handled differently
    }
    default: {
      // Type assertion to help TypeScript understand that conversation has a type property
      const unknownConversation = conversation as TChatConversation;
      return null;
    }
  }
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

const addTask = (id: string, task: AgentBaseTask<{}>) => {
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
  addTask,
  listTasks,
  kill,
  clear,
};

export default WorkerManage;
