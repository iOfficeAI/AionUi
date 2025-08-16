/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/storage';
import type AgentBaseTask from './task/BaseAgentTask';
import { GeminiAgentTask } from './task/GeminiAgentTask';

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
      const task = new GeminiAgentTask(
        {
          workspace: conversation.extra.workspace,
          conversation_id: conversation.id,
        },
        conversation.model
      );
      taskList.push({ id: conversation.id, task });
      return task;
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

const WorkerManage = {
  buildConversation,
  getTaskById,
  kill,
  clear,
};

export default WorkerManage;
