import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({ app: { isPackaged: false, getPath: vi.fn(() => '/tmp') } }));
vi.mock('@process/initStorage', () => ({ ProcessChat: { get: vi.fn(async () => []) } }));

const mockGetConversation = vi.fn();
vi.mock('@process/database/export', () => ({
  getDatabase: vi.fn(() => ({ getConversation: mockGetConversation })),
}));

import { WorkerTaskManager } from '../../src/process/task/WorkerTaskManager';

function makeFactory(agent?: any) {
  return { register: vi.fn(), create: vi.fn(() => agent ?? makeAgent()) };
}
function makeAgent(id = 'c1') {
  return {
    type: 'gemini' as const,
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

describe('WorkerTaskManager', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns cached task on second call to getTask', () => {
    const mgr = new WorkerTaskManager(makeFactory() as any);
    const agent = makeAgent();
    mgr.addTask('c1', agent as any);
    expect(mgr.getTask('c1')).toBe(agent);
  });

  it('kill removes task from list and calls task.kill()', () => {
    const agent = makeAgent();
    const mgr = new WorkerTaskManager(makeFactory(agent) as any);
    mgr.addTask('c1', agent as any);
    mgr.kill('c1');
    expect(mgr.getTask('c1')).toBeUndefined();
    expect(agent.kill).toHaveBeenCalled();
  });

  it('getOrBuildTask calls factory.create on cache miss', async () => {
    const agent = makeAgent();
    const factory = makeFactory(agent);
    const mgr = new WorkerTaskManager(factory as any);
    mockGetConversation.mockReturnValue({ success: true, data: { id: 'c1', type: 'gemini', extra: {} } });

    const result = await mgr.getOrBuildTask('c1');
    expect(factory.create).toHaveBeenCalled();
    expect(result).toBe(agent);
  });

  it('getOrBuildTask returns cached task without calling factory', async () => {
    const agent = makeAgent();
    const factory = makeFactory(agent);
    const mgr = new WorkerTaskManager(factory as any);
    mgr.addTask('c1', agent as any);

    const result = await mgr.getOrBuildTask('c1');
    expect(factory.create).not.toHaveBeenCalled();
    expect(result).toBe(agent);
  });
});
