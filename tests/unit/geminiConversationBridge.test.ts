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
    geminiConversation: {
      confirmMessage: makeChannel('confirmMessage'),
    },
  },
}));

import { initGeminiConversationBridge } from '../../src/process/bridge/geminiConversationBridge';
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

function makeGeminiTask(id = 'c1') {
  return {
    type: 'gemini' as const,
    conversation_id: id,
    confirm: vi.fn(),
    kill: vi.fn(),
    stop: vi.fn(),
    sendMessage: vi.fn(),
    getConfirmations: vi.fn(() => []),
  };
}

describe('geminiConversationBridge', () => {
  let taskManager: IWorkerTaskManager;

  beforeEach(() => {
    vi.clearAllMocks();
    taskManager = makeTaskManager();
    initGeminiConversationBridge(taskManager);
  });

  // --- confirmMessage ---

  it('routes confirmation payload to the correct gemini task', async () => {
    const task = makeGeminiTask('c1');
    vi.mocked(taskManager.getTask).mockReturnValue(task as any);

    const result = await handlers['confirmMessage']({
      conversation_id: 'c1',
      msg_id: 'msg-1',
      confirmKey: 'allow',
      callId: 'call-1',
    });

    expect(taskManager.getTask).toHaveBeenCalledWith('c1');
    expect(task.confirm).toHaveBeenCalledWith('msg-1', 'call-1', 'allow');
    expect(result).toEqual({ success: true });
  });

  it('returns error response when task is not found in manager', async () => {
    vi.mocked(taskManager.getTask).mockReturnValue(undefined);

    const result = await handlers['confirmMessage']({
      conversation_id: 'missing',
      msg_id: 'msg-1',
      confirmKey: 'allow',
      callId: 'call-1',
    });

    expect(result).toEqual({ success: false, msg: 'conversation not found' });
  });

  it('returns error response when task type is not gemini', async () => {
    const task = { ...makeGeminiTask('c1'), type: 'acp' as const };
    vi.mocked(taskManager.getTask).mockReturnValue(task as any);

    const result = await handlers['confirmMessage']({
      conversation_id: 'c1',
      msg_id: 'msg-1',
      confirmKey: 'allow',
      callId: 'call-1',
    });

    expect(result).toEqual({ success: false, msg: 'only supported for gemini' });
    expect(task.confirm).not.toHaveBeenCalled();
  });
});
