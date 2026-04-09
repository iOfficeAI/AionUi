// tests/unit/team-TaskManager.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskManager } from '@process/team/TaskManager';
import type { ITeamRepository } from '@process/team/repository/ITeamRepository';
import type { TeamTask } from '@process/team/types';

function makeTask(overrides: Partial<TeamTask> = {}): TeamTask {
  return {
    id: 'task-1',
    teamId: 'team-1',
    subject: 'Do something',
    description: 'Details here',
    status: 'pending',
    owner: undefined,
    blockedBy: [],
    blocks: [],
    metadata: {},
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function makeRepo(): ITeamRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteMailboxByTeam: vi.fn(),
    deleteTasksByTeam: vi.fn(),
    writeMessage: vi.fn(),
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
  } as unknown as ITeamRepository;
}

describe('TaskManager', () => {
  let repo: ITeamRepository;
  let taskManager: TaskManager;

  beforeEach(() => {
    repo = makeRepo();
    taskManager = new TaskManager(repo);
    vi.clearAllMocks();
  });

  describe('create', () => {
    it('creates a task with auto-generated ID and pending status', async () => {
      const createdTask = makeTask({ id: 'generated-id' });
      vi.mocked(repo.createTask).mockResolvedValue(createdTask);

      const result = await taskManager.create({
        teamId: 'team-1',
        subject: 'Do something',
        description: 'Details here',
      });

      expect(repo.createTask).toHaveBeenCalledOnce();
      const arg = vi.mocked(repo.createTask).mock.calls[0][0];
      expect(arg.status).toBe('pending');
      expect(arg.teamId).toBe('team-1');
      expect(arg.subject).toBe('Do something');
      expect(arg.description).toBe('Details here');
      expect(arg.blockedBy).toEqual([]);
      expect(arg.blocks).toEqual([]);
      expect(typeof arg.id).toBe('string');
      expect(result).toBe(createdTask);
    });

    it('creates task with optional owner', async () => {
      const createdTask = makeTask({ owner: 'slot-1' });
      vi.mocked(repo.createTask).mockResolvedValue(createdTask);

      await taskManager.create({ teamId: 'team-1', subject: 'Task', owner: 'slot-1' });

      const arg = vi.mocked(repo.createTask).mock.calls[0][0];
      expect(arg.owner).toBe('slot-1');
    });

    it('creates task without blockedBy when not provided', async () => {
      const createdTask = makeTask();
      vi.mocked(repo.createTask).mockResolvedValue(createdTask);

      await taskManager.create({ teamId: 'team-1', subject: 'Task' });

      const arg = vi.mocked(repo.createTask).mock.calls[0][0];
      expect(arg.blockedBy).toEqual([]);
    });

    it('atomically appends to upstream blocks when blockedBy is provided', async () => {
      const createdTask = makeTask({ id: 'task-new', blockedBy: ['task-upstream'] });
      vi.mocked(repo.createTask).mockResolvedValue(createdTask);
      vi.mocked(repo.appendToBlocks).mockResolvedValue(undefined);

      await taskManager.create({
        teamId: 'team-1',
        subject: 'Downstream task',
        blockedBy: ['task-upstream'],
      });

      expect(repo.appendToBlocks).toHaveBeenCalledWith('task-upstream', 'task-new');
    });

    it('handles multiple blockedBy dependencies with atomic appends', async () => {
      const createdTask = makeTask({ id: 'task-new', blockedBy: ['task-a', 'task-b'] });
      vi.mocked(repo.createTask).mockResolvedValue(createdTask);
      vi.mocked(repo.appendToBlocks).mockResolvedValue(undefined);

      await taskManager.create({
        teamId: 'team-1',
        subject: 'Task',
        blockedBy: ['task-a', 'task-b'],
      });

      expect(repo.appendToBlocks).toHaveBeenCalledTimes(2);
      expect(repo.appendToBlocks).toHaveBeenCalledWith('task-a', 'task-new');
      expect(repo.appendToBlocks).toHaveBeenCalledWith('task-b', 'task-new');
    });
  });

  describe('update', () => {
    it('delegates to repo.updateTask with updatedAt timestamp', async () => {
      const updatedTask = makeTask({ status: 'in_progress' });
      vi.mocked(repo.updateTask).mockResolvedValue(updatedTask);

      const result = await taskManager.update('task-1', { status: 'in_progress' });

      expect(repo.updateTask).toHaveBeenCalledWith(
        'task-1',
        expect.objectContaining({ status: 'in_progress', updatedAt: expect.any(Number) })
      );
      expect(result).toBe(updatedTask);
    });

    it('can update owner', async () => {
      const updatedTask = makeTask({ owner: 'slot-2' });
      vi.mocked(repo.updateTask).mockResolvedValue(updatedTask);

      await taskManager.update('task-1', { owner: 'slot-2' });

      expect(repo.updateTask).toHaveBeenCalledWith('task-1', expect.objectContaining({ owner: 'slot-2' }));
    });
  });

  describe('list', () => {
    it('returns all tasks for a team from repo', async () => {
      const tasks = [makeTask({ id: 'task-1' }), makeTask({ id: 'task-2' })];
      vi.mocked(repo.findTasksByTeam).mockResolvedValue(tasks);

      const result = await taskManager.list('team-1');

      expect(result).toEqual(tasks);
      expect(repo.findTasksByTeam).toHaveBeenCalledWith('team-1');
    });

    it('returns empty array when no tasks', async () => {
      vi.mocked(repo.findTasksByTeam).mockResolvedValue([]);

      const result = await taskManager.list('team-1');

      expect(result).toEqual([]);
    });
  });

  describe('getByOwner', () => {
    it('returns tasks for a specific owner', async () => {
      const tasks = [makeTask({ owner: 'slot-1' })];
      vi.mocked(repo.findTasksByOwner).mockResolvedValue(tasks);

      const result = await taskManager.getByOwner('team-1', 'slot-1');

      expect(result).toEqual(tasks);
      expect(repo.findTasksByOwner).toHaveBeenCalledWith('team-1', 'slot-1');
    });
  });

  describe('checkUnblocks', () => {
    it('returns empty array when completed task not found', async () => {
      vi.mocked(repo.findTaskById).mockResolvedValue(null);

      const result = await taskManager.checkUnblocks('task-999');

      expect(result).toEqual([]);
    });

    it('returns empty array when no tasks depend on the completed task', async () => {
      const completedTask = makeTask({ id: 'task-1', teamId: 'team-1' });
      vi.mocked(repo.findTaskById).mockResolvedValue(completedTask);
      vi.mocked(repo.findTasksByTeam).mockResolvedValue([makeTask({ id: 'task-2', blockedBy: [] })]);

      const result = await taskManager.checkUnblocks('task-1');

      expect(result).toEqual([]);
      expect(repo.updateTask).not.toHaveBeenCalled();
    });

    it('atomically removes completed taskId from dependents and returns fully unblocked tasks', async () => {
      const completedTask = makeTask({ id: 'task-1', teamId: 'team-1' });
      const dependent = makeTask({ id: 'task-2', blockedBy: ['task-1'] });
      vi.mocked(repo.findTaskById).mockResolvedValue(completedTask);
      vi.mocked(repo.findTasksByTeam).mockResolvedValue([completedTask, dependent]);
      const unblocked = makeTask({ id: 'task-2', blockedBy: [] });
      vi.mocked(repo.removeFromBlockedBy).mockResolvedValue(unblocked);
      vi.mocked(repo.updateTask).mockResolvedValue(makeTask({ id: 'task-1', blocks: [] }));

      const result = await taskManager.checkUnblocks('task-1');

      expect(repo.removeFromBlockedBy).toHaveBeenCalledWith('task-2', 'task-1');
      expect(result).toEqual([unblocked]);
      // Also clears the completed task's stale blocks pointer
      expect(repo.updateTask).toHaveBeenCalledWith('task-1', expect.objectContaining({ blocks: [] }));
    });

    it('returns only tasks whose blockedBy is now empty (still blocked tasks not returned)', async () => {
      const completedTask = makeTask({ id: 'task-1', teamId: 'team-1' });
      const fullyUnblocked = makeTask({ id: 'task-2', blockedBy: ['task-1'] });
      const stillBlocked = makeTask({ id: 'task-3', blockedBy: ['task-1', 'task-other'] });
      vi.mocked(repo.findTaskById).mockResolvedValue(completedTask);
      vi.mocked(repo.findTasksByTeam).mockResolvedValue([completedTask, fullyUnblocked, stillBlocked]);
      vi.mocked(repo.removeFromBlockedBy)
        .mockResolvedValueOnce(makeTask({ id: 'task-2', blockedBy: [] }))
        .mockResolvedValueOnce(makeTask({ id: 'task-3', blockedBy: ['task-other'] }));
      vi.mocked(repo.updateTask).mockResolvedValue(makeTask({ id: 'task-1', blocks: [] }));

      const result = await taskManager.checkUnblocks('task-1');

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('task-2');
    });

    it('handles multiple dependents in parallel', async () => {
      const completedTask = makeTask({ id: 'task-0', teamId: 'team-1' });
      const dep1 = makeTask({ id: 'task-1', blockedBy: ['task-0'] });
      const dep2 = makeTask({ id: 'task-2', blockedBy: ['task-0'] });
      vi.mocked(repo.findTaskById).mockResolvedValue(completedTask);
      vi.mocked(repo.findTasksByTeam).mockResolvedValue([completedTask, dep1, dep2]);
      vi.mocked(repo.removeFromBlockedBy).mockResolvedValue(makeTask({ blockedBy: [] }));
      vi.mocked(repo.updateTask).mockResolvedValue(makeTask({ id: 'task-0', blocks: [] }));

      await taskManager.checkUnblocks('task-0');

      expect(repo.removeFromBlockedBy).toHaveBeenCalledTimes(2);
    });

    it('concurrent checkUnblocks is now safe with atomic removeFromBlockedBy', async () => {
      const taskA = makeTask({ id: 'task-a', teamId: 'team-1', status: 'completed' });
      const taskB = makeTask({ id: 'task-b', teamId: 'team-1', status: 'completed' });
      const taskC = makeTask({ id: 'task-c', teamId: 'team-1', blockedBy: ['task-a', 'task-b'] });

      vi.mocked(repo.findTaskById).mockImplementation(async (id) => {
        if (id === 'task-a') return taskA;
        if (id === 'task-b') return taskB;
        return null;
      });
      vi.mocked(repo.findTasksByTeam).mockResolvedValue([taskA, taskB, taskC]);

      // Simulate atomic removeFromBlockedBy: each call independently removes its own ID
      let remainingBlockers = ['task-a', 'task-b'];
      vi.mocked(repo.removeFromBlockedBy).mockImplementation(async (_taskId, unblockedId) => {
        remainingBlockers = remainingBlockers.filter((id) => id !== unblockedId);
        return makeTask({ id: 'task-c', blockedBy: [...remainingBlockers] });
      });
      vi.mocked(repo.updateTask).mockResolvedValue(makeTask({ blocks: [] }));

      const [resultA, resultB] = await Promise.all([
        taskManager.checkUnblocks('task-a'),
        taskManager.checkUnblocks('task-b'),
      ]);

      // With atomic operations, one of the two calls should see C as fully unblocked
      const allUnblocked = [...resultA, ...resultB];
      expect(allUnblocked.some((t) => t.blockedBy.length === 0)).toBe(true);
    });
  });
});
