// src/process/task/IWorkerTaskManager.ts

import type { IAgentManager } from './IAgentManager';
import type { BuildConversationOptions } from './agentTypes';

export interface IWorkerTaskManager {
  getTask(id: string): IAgentManager | undefined;
  getOrBuildTask(id: string, options?: BuildConversationOptions): Promise<IAgentManager>;
  addTask(id: string, task: IAgentManager): void;
  kill(id: string): void;
  clear(): void;
  listTasks(): Array<{ id: string; type: string }>;
}
