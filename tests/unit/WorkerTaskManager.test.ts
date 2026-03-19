import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: vi.fn(() => '/tmp') } }));

const { mockProcessChatGet } = vi.hoisted(() => ({ mockProcessChatGet: vi.fn(async () => []) }));
vi.mock('@process/initStorage', () => ({ ProcessChat: { get: mockProcessChatGet } }));

const mockGetConversation = vi.fn();
vi.mock('@process/database/export', () => ({
  getDatabase: vi.fn(() => ({ getConversation: mockGetConversation })),
}));

import { WorkerTaskManager } from '../../src/process/task/WorkerTaskManager';
import type { AgentType } from '../../src/process/task/agentTypes';

function makeFactory(agent?: any) {
  return { register: vi.fn(), create: vi.fn(() => agent ?? makeAgent()) };
}

function makeAgent(id = 'c1', type: AgentType = 'gemini') {
  return {
    type,
    status: undefined,
    workspace: '/ws',
    conversation_id: id,
    kill: vi.fn(),
    sendMessage: vi.fn(),
    stop: vi.fn(),
    confirm: vi.fn(),
    getConfirmations: vi.fn(() => []),
  };
}

function makeConversation(id: string, type: AgentType = 'gemini') {
  return { id, type, extra: {} };
}

describe('WorkerTaskManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConversation.mockReturnValue({ success: false });
    mockProcessChatGet.mockResolvedValue([]);
  });

  // --- getTask / addTask ---

  it('getTask returns undefined for unknown id', () => {
    const mgr = new WorkerTaskManager(makeFactory() as any);
    expect(mgr.getTask('unknown')).toBeUndefined();
  });

  it('addTask stores task and getTask returns it', () => {
    const mgr = new WorkerTaskManager(makeFactory() as any);
    const agent = makeAgent();
    mgr.addTask('c1', agent as any);
    expect(mgr.getTask('c1')).toBe(agent);
  });

  it('addTask replaces existing task with same id', () => {
    const mgr = new WorkerTaskManager(makeFactory() as any);
    const agent1 = makeAgent('c1', 'gemini');
    const agent2 = makeAgent('c1', 'acp');
    mgr.addTask('c1', agent1 as any);
    mgr.addTask('c1', agent2 as any);
    expect(mgr.getTask('c1')).toBe(agent2);
  });

  // --- kill ---

  it('kill removes task from list and calls task.kill()', () => {
    const agent = makeAgent();
    const mgr = new WorkerTaskManager(makeFactory(agent) as any);
    mgr.addTask('c1', agent as any);
    mgr.kill('c1');
    expect(mgr.getTask('c1')).toBeUndefined();
    expect(agent.kill).toHaveBeenCalled();
  });

  it('kill is a no-op for unknown id', () => {
    const mgr = new WorkerTaskManager(makeFactory() as any);
    expect(() => mgr.kill('nonexistent')).not.toThrow();
  });

  // --- clear ---

  it('clear kills all tasks and empties the list', () => {
    const agent1 = makeAgent('c1', 'gemini');
    const agent2 = makeAgent('c2', 'acp');
    const mgr = new WorkerTaskManager(makeFactory() as any);
    mgr.addTask('c1', agent1 as any);
    mgr.addTask('c2', agent2 as any);
    mgr.clear();
    expect(agent1.kill).toHaveBeenCalled();
    expect(agent2.kill).toHaveBeenCalled();
    expect(mgr.listTasks()).toHaveLength(0);
  });

  // --- listTasks ---

  it('listTasks returns id and type for each task', () => {
    const mgr = new WorkerTaskManager(makeFactory() as any);
    mgr.addTask('c1', makeAgent('c1', 'gemini') as any);
    mgr.addTask('c2', makeAgent('c2', 'acp') as any);
    mgr.addTask('c3', makeAgent('c3', 'nanobot') as any);
    expect(mgr.listTasks()).toEqual([
      { id: 'c1', type: 'gemini' },
      { id: 'c2', type: 'acp' },
      { id: 'c3', type: 'nanobot' },
    ]);
  });

  // --- getOrBuildTask: cache hit ---

  it('getOrBuildTask returns cached task without calling factory', async () => {
    const agent = makeAgent();
    const factory = makeFactory(agent);
    const mgr = new WorkerTaskManager(factory as any);
    mgr.addTask('c1', agent as any);

    const result = await mgr.getOrBuildTask('c1');
    expect(factory.create).not.toHaveBeenCalled();
    expect(result).toBe(agent);
  });

  // --- getOrBuildTask: DB hit ---

  it('getOrBuildTask builds from DB on cache miss (gemini)', async () => {
    const agent = makeAgent('c1', 'gemini');
    const factory = makeFactory(agent);
    const mgr = new WorkerTaskManager(factory as any);
    mockGetConversation.mockReturnValue({ success: true, data: makeConversation('c1', 'gemini') });

    const result = await mgr.getOrBuildTask('c1');
    expect(factory.create).toHaveBeenCalledWith(makeConversation('c1', 'gemini'), undefined);
    expect(result).toBe(agent);
  });

  it('getOrBuildTask builds from DB for acp type', async () => {
    const agent = makeAgent('c2', 'acp');
    const factory = makeFactory(agent);
    const mgr = new WorkerTaskManager(factory as any);
    mockGetConversation.mockReturnValue({ success: true, data: makeConversation('c2', 'acp') });

    const result = await mgr.getOrBuildTask('c2');
    expect(factory.create).toHaveBeenCalled();
    expect(result).toBe(agent);
  });

  it('getOrBuildTask caches task built from DB', async () => {
    const agent = makeAgent();
    const factory = makeFactory(agent);
    const mgr = new WorkerTaskManager(factory as any);
    mockGetConversation.mockReturnValue({ success: true, data: makeConversation('c1') });

    await mgr.getOrBuildTask('c1');
    await mgr.getOrBuildTask('c1'); // second call should use cache
    expect(factory.create).toHaveBeenCalledTimes(1);
  });

  // --- getOrBuildTask: file storage fallback ---

  it('getOrBuildTask falls back to file storage when DB misses', async () => {
    const agent = makeAgent('c1', 'nanobot');
    const factory = makeFactory(agent);
    const mgr = new WorkerTaskManager(factory as any);
    mockGetConversation.mockReturnValue({ success: false });
    mockProcessChatGet.mockResolvedValue([makeConversation('c1', 'nanobot')]);

    const result = await mgr.getOrBuildTask('c1');
    expect(factory.create).toHaveBeenCalled();
    expect(result).toBe(agent);
  });

  it('getOrBuildTask falls back to file storage for openclaw-gateway type', async () => {
    const agent = makeAgent('c3', 'openclaw-gateway');
    const factory = makeFactory(agent);
    const mgr = new WorkerTaskManager(factory as any);
    mockGetConversation.mockReturnValue({ success: false });
    mockProcessChatGet.mockResolvedValue([makeConversation('c3', 'openclaw-gateway')]);

    const result = await mgr.getOrBuildTask('c3');
    expect(result).toBe(agent);
  });

  // --- getOrBuildTask: not found ---

  it('getOrBuildTask rejects when conversation not found in DB or file', async () => {
    const mgr = new WorkerTaskManager(makeFactory() as any);
    mockGetConversation.mockReturnValue({ success: false });
    mockProcessChatGet.mockResolvedValue([]);

    await expect(mgr.getOrBuildTask('missing')).rejects.toThrow('Conversation not found: missing');
  });

  // --- getOrBuildTask: skipCache option ---

  it('getOrBuildTask with skipCache bypasses cache and does not store result', async () => {
    const agent = makeAgent();
    const factory = makeFactory(agent);
    const mgr = new WorkerTaskManager(factory as any);
    mgr.addTask('c1', agent as any);
    mockGetConversation.mockReturnValue({ success: true, data: makeConversation('c1') });

    await mgr.getOrBuildTask('c1', { skipCache: true });
    expect(factory.create).toHaveBeenCalledTimes(1);
    // Task list should still only have the original (not a duplicate)
    expect(mgr.listTasks()).toHaveLength(1);
  });
});
