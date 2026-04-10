// tests/unit/team-SqliteTeamRepository.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CURRENT_DB_VERSION, initSchema } from '@process/services/database/schema';
import { runMigrations } from '@process/services/database/migrations';
import { BetterSqlite3Driver } from '@process/services/database/drivers/BetterSqlite3Driver';
import { SqliteTeamRepository } from '@process/team/repository/SqliteTeamRepository';
import type { MailboxMessage, TeamTask, TTeam } from '@process/team/types';

let nativeModuleAvailable = true;
try {
  const d = new BetterSqlite3Driver(':memory:');
  d.close();
} catch (e) {
  if (e instanceof Error && e.message.includes('NODE_MODULE_VERSION')) {
    nativeModuleAvailable = false;
  }
}

const describeOrSkip = nativeModuleAvailable ? describe : describe.skip;

function makeTeam(overrides: Partial<TTeam> = {}): TTeam {
  return {
    id: 'team-1',
    userId: 'user-1',
    name: 'Test Team',
    workspace: '/tmp/workspace',
    workspaceMode: 'shared',
    leadAgentId: 'slot-1',
    agents: [
      {
        slotId: 'slot-1',
        conversationId: 'conv-1',
        role: 'lead',
        agentType: 'acp',
        agentName: 'Claude',
        conversationType: 'acp',
        status: 'idle',
      },
    ],
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describeOrSkip('SqliteTeamRepository', () => {
  let repo: SqliteTeamRepository;
  let driver: BetterSqlite3Driver;

  beforeEach(() => {
    driver = new BetterSqlite3Driver(':memory:');
    initSchema(driver);
    runMigrations(driver, 0, CURRENT_DB_VERSION);
    // Insert a test user to satisfy the FOREIGN KEY constraint on teams.user_id
    driver
      .prepare(
        `INSERT INTO users (id, username, password_hash, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run('user-1', 'testuser', 'hash', 1000, 1000);
    repo = new SqliteTeamRepository(driver);
  });

  afterEach(() => {
    driver.close();
  });

  it('creates and retrieves a team', async () => {
    const team = makeTeam();
    await repo.create(team);
    const found = await repo.findById('team-1');
    expect(found).not.toBeNull();
    expect(found!.name).toBe('Test Team');
    expect(found!.agents).toHaveLength(1);
    expect(found!.agents[0].role).toBe('lead');
  });

  it('lists teams by userId', async () => {
    await repo.create(makeTeam({ id: 'team-1' }));
    await repo.create(makeTeam({ id: 'team-2', name: 'Team 2' }));
    const list = await repo.findAll('user-1');
    expect(list).toHaveLength(2);
  });

  it('updates a team', async () => {
    await repo.create(makeTeam());
    const updated = await repo.update('team-1', { name: 'Renamed', updatedAt: 2000 });
    expect(updated.name).toBe('Renamed');
    const found = await repo.findById('team-1');
    expect(found!.name).toBe('Renamed');
  });

  it('deletes a team', async () => {
    await repo.create(makeTeam());
    await repo.delete('team-1');
    const found = await repo.findById('team-1');
    expect(found).toBeNull();
  });

  it('returns null for missing team', async () => {
    const found = await repo.findById('nonexistent');
    expect(found).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // Mailbox: readUnreadAndMark (atomic read + mark)
  // ---------------------------------------------------------------------------

  describe('readUnreadAndMark', () => {
    const msg = (id: string, read = false): MailboxMessage => ({
      id,
      teamId: 'team-1',
      toAgentId: 'agent-a',
      fromAgentId: 'agent-b',
      type: 'chat',
      content: `msg-${id}`,
      read,
      createdAt: Date.now(),
    });

    beforeEach(async () => {
      await repo.create(makeTeam());
    });

    it('returns unread messages and marks them read in one transaction', async () => {
      await repo.writeMessage(msg('m1'));
      await repo.writeMessage(msg('m2'));
      await repo.writeMessage(msg('m3', true)); // already read

      const result = await repo.readUnreadAndMark('team-1', 'agent-a');
      expect(result).toHaveLength(2);
      expect(result.map((m) => m.id).toSorted()).toEqual(['m1', 'm2']);

      // Second call should return nothing — already marked
      const second = await repo.readUnreadAndMark('team-1', 'agent-a');
      expect(second).toHaveLength(0);
    });

    it('returns empty array when no unread messages exist', async () => {
      const result = await repo.readUnreadAndMark('team-1', 'agent-a');
      expect(result).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Tasks: appendToBlocks (atomic)
  // ---------------------------------------------------------------------------

  describe('appendToBlocks', () => {
    const makeTask = (id: string, overrides: Partial<TeamTask> = {}): TeamTask => ({
      id,
      teamId: 'team-1',
      subject: `Task ${id}`,
      status: 'open',
      blockedBy: [],
      blocks: [],
      metadata: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...overrides,
    });

    beforeEach(async () => {
      await repo.create(makeTeam());
    });

    it('appends a block id to the task blocks array', async () => {
      await repo.createTask(makeTask('t1'));
      await repo.appendToBlocks('t1', 't2');

      const task = await repo.findTaskById('t1');
      expect(task!.blocks).toEqual(['t2']);
    });

    it('does not duplicate an existing block id', async () => {
      await repo.createTask(makeTask('t1', { blocks: ['t2'] }));
      await repo.appendToBlocks('t1', 't2');

      const task = await repo.findTaskById('t1');
      expect(task!.blocks).toEqual(['t2']);
    });

    it('is a no-op for nonexistent task', async () => {
      await expect(repo.appendToBlocks('nonexistent', 't2')).resolves.toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Tasks: removeFromBlockedBy (atomic)
  // ---------------------------------------------------------------------------

  describe('removeFromBlockedBy', () => {
    const makeTask = (id: string, overrides: Partial<TeamTask> = {}): TeamTask => ({
      id,
      teamId: 'team-1',
      subject: `Task ${id}`,
      status: 'open',
      blockedBy: [],
      blocks: [],
      metadata: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...overrides,
    });

    beforeEach(async () => {
      await repo.create(makeTeam());
    });

    it('removes a blocker id from blockedBy array', async () => {
      await repo.createTask(makeTask('t1', { blockedBy: ['t0', 't2'] }));
      const updated = await repo.removeFromBlockedBy('t1', 't0');

      expect(updated.blockedBy).toEqual(['t2']);
    });

    it('returns task unchanged when blocker id is not present', async () => {
      await repo.createTask(makeTask('t1', { blockedBy: ['t0'] }));
      const updated = await repo.removeFromBlockedBy('t1', 'nonexistent');

      expect(updated.blockedBy).toEqual(['t0']);
    });

    it('throws for nonexistent task', async () => {
      await expect(repo.removeFromBlockedBy('nonexistent', 't0')).rejects.toThrow('Task "nonexistent" not found');
    });
  });
});
