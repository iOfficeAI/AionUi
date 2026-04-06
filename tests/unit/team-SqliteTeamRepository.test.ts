// tests/unit/team-SqliteTeamRepository.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initSchema } from '@process/services/database/schema';
import { runMigrations } from '@process/services/database/migrations';
import { BetterSqlite3Driver } from '@process/services/database/drivers/BetterSqlite3Driver';
import { SqliteTeamRepository } from '@process/team/repository/SqliteTeamRepository';
import type { TTeam } from '@process/team/types';

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
    runMigrations(driver, 0, 20);
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
});
