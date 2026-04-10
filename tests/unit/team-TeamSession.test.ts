import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { TeamSession } from '../../src/process/team/TeamSession';
import type { ITeamRepository } from '../../src/process/team/repository/ITeamRepository';
import type { TTeam } from '../../src/common/types/teamTypes';
import type { IWorkerTaskManager } from '../../src/process/task/IWorkerTaskManager';

const makeRepo = (): ITeamRepository =>
  ({
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMailboxByTeam: vi.fn(),
    deleteTasksByTeam: vi.fn(),
    writeMessage: vi.fn(async (message) => message),
    readUnread: vi.fn(),
    readUnreadAndMark: vi.fn(),
    markRead: vi.fn(),
    getMailboxHistory: vi.fn(),
    createTask: vi.fn(),
    findTaskById: vi.fn(),
    updateTask: vi.fn(),
    findTasksByTeam: vi.fn(),
    findTasksByOwner: vi.fn(),
    deleteTask: vi.fn(),
    appendToBlocks: vi.fn(),
    removeFromBlockedBy: vi.fn(),
  }) as unknown as ITeamRepository;

const makeWorkerTaskManager = (): IWorkerTaskManager =>
  ({
    getOrBuildTask: vi.fn(),
    buildTask: vi.fn(),
    removeTask: vi.fn(),
    stopTask: vi.fn(),
    updateStatus: vi.fn(),
    getTaskStatus: vi.fn(),
    listTaskStatuses: vi.fn(),
    getTaskConversationId: vi.fn(),
    stopAndRemoveTask: vi.fn(),
    stopAllTasks: vi.fn(),
    updateTaskFilePath: vi.fn(),
  }) as unknown as IWorkerTaskManager;

const makeTeam = (): TTeam => ({
  id: 'team-1',
  userId: 'user-1',
  name: 'Test Team',
  workspace: '/workspace',
  workspaceMode: 'shared',
  leadAgentId: 'slot-lead',
  createdAt: 1,
  updatedAt: 1,
  agents: [
    {
      slotId: 'slot-lead',
      conversationId: 'conv-lead',
      role: 'lead',
      agentType: 'codex',
      agentName: 'Lead',
      conversationType: 'acp',
      status: 'idle',
    },
    {
      slotId: 'slot-member',
      conversationId: 'conv-member',
      role: 'teammate',
      agentType: 'codex',
      agentName: 'Member',
      conversationType: 'acp',
      status: 'idle',
    },
  ],
});

describe('TeamSession delivery semantics', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sendMessage resolves after mailbox acceptance even when wake fails', async () => {
    const repo = makeRepo();
    const session = new TeamSession(makeTeam(), repo, makeWorkerTaskManager());
    vi.spyOn(session, 'startMcpServer').mockResolvedValue({ command: 'noop', args: [], env: [] });

    const wakeSpy = vi
      .spyOn(
        (session as unknown as { teammateManager: { wake: (slotId: string) => Promise<void> } }).teammateManager,
        'wake'
      )
      .mockRejectedValue(new Error('Task unavailable'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(session.sendMessage('hello team')).resolves.toBeUndefined();

    expect(repo.writeMessage).toHaveBeenCalledTimes(1);
    expect(wakeSpy).toHaveBeenCalledWith('slot-lead');
    expect(errorSpy).toHaveBeenCalledWith(
      '[TeamSession] Accepted team message but failed to wake slot-lead:',
      'Task unavailable'
    );
  });

  it('sendMessageToAgent resolves after mailbox acceptance even when wake fails', async () => {
    const repo = makeRepo();
    const session = new TeamSession(makeTeam(), repo, makeWorkerTaskManager());
    vi.spyOn(session, 'startMcpServer').mockResolvedValue({ command: 'noop', args: [], env: [] });

    const wakeSpy = vi
      .spyOn(
        (session as unknown as { teammateManager: { wake: (slotId: string) => Promise<void> } }).teammateManager,
        'wake'
      )
      .mockRejectedValue(new Error('Task unavailable'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(session.sendMessageToAgent('slot-member', 'hello member')).resolves.toBeUndefined();

    expect(repo.writeMessage).toHaveBeenCalledTimes(1);
    expect(wakeSpy).toHaveBeenCalledWith('slot-member');
    expect(errorSpy).toHaveBeenCalledWith(
      '[TeamSession] Accepted agent message but failed to wake slot-member:',
      'Task unavailable'
    );
  });

  it('still rejects when acceptance fails before mailbox delivery', async () => {
    const repo = makeRepo();
    const session = new TeamSession(makeTeam(), repo, makeWorkerTaskManager());
    vi.spyOn(session, 'startMcpServer').mockRejectedValue(new Error('mcp failed'));

    await expect(session.sendMessage('hello team')).rejects.toThrow('mcp failed');
    expect(repo.writeMessage).not.toHaveBeenCalled();
  });
});
