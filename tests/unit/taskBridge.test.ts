import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: vi.fn(() => '/tmp') } }));

const handlers: Record<string, (...args: any[]) => any> = {};
function makeChannel(name: string) {
  return {
    provider: vi.fn((fn: (...args: any[]) => any) => {
      handlers[name] = fn;
    }),
    emit: vi.fn(),
    invoke: vi.fn(),
  };
}

vi.mock('../../src/common', () => ({
  ipcBridge: {
    task: {
      stopAll: makeChannel('stopAll'),
      getRunningCount: makeChannel('getRunningCount'),
    },
  },
}));

import { initTaskBridge } from '../../src/process/bridge/taskBridge';
import type { IWorkerTaskManager } from '../../src/process/task/IWorkerTaskManager';

function makeTaskManager(overrides?: Partial<IWorkerTaskManager>): IWorkerTaskManager {
  return {
    getTask: vi.fn(() => undefined),
    getOrBuildTask: vi.fn(async () => {
      throw new Error('not found');
    }),
    addTask: vi.fn(),
    kill: vi.fn(),
    clear: vi.fn(),
    listTasks: vi.fn(() => []),
    ...overrides,
  };
}

function makeStoppableTask() {
  return { stop: vi.fn(async () => {}) };
}

describe('taskBridge', () => {
  let taskManager: IWorkerTaskManager;

  beforeEach(() => {
    vi.clearAllMocks();
    taskManager = makeTaskManager();
    initTaskBridge(taskManager);
  });

  // --- stopAll ---

  it('stopAll stops every running task and returns correct count', async () => {
    const t1 = makeStoppableTask();
    const t2 = makeStoppableTask();
    vi.mocked(taskManager.listTasks).mockReturnValue([
      { id: 'c1', type: 'gemini' },
      { id: 'c2', type: 'acp' },
    ]);
    vi.mocked(taskManager.getTask)
      .mockReturnValueOnce(t1 as any)
      .mockReturnValueOnce(t2 as any);

    const result = await handlers['stopAll']();

    expect(t1.stop).toHaveBeenCalled();
    expect(t2.stop).toHaveBeenCalled();
    expect(result).toEqual({ success: true, count: 2 });
  });

  it('getRunningCount returns zero when no tasks are active', async () => {
    vi.mocked(taskManager.listTasks).mockReturnValue([]);

    const result = await handlers['getRunningCount']();

    expect(result).toEqual({ success: true, count: 0 });
  });

  it('getRunningCount returns count even when a task has no stop method', async () => {
    vi.mocked(taskManager.listTasks).mockReturnValue([
      { id: 'c1', type: 'gemini' },
      { id: 'c2', type: 'nanobot' },
    ]);

    const result = await handlers['getRunningCount']();

    expect(result).toEqual({ success: true, count: 2 });
  });

  it('stopAll returns success:false when listTasks throws', async () => {
    vi.mocked(taskManager.listTasks).mockImplementation(() => {
      throw new Error('internal error');
    });

    const result = await handlers['stopAll']();

    expect(result).toEqual({ success: false, count: 0 });
  });
});
