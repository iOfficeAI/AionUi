import { describe, expect, it, vi } from 'vitest';
import { LEGACY_HANDOFF_COLUMNS } from '@/process/services/database/legacyHandoffContract';
import { repairLegacyHandoffSchema } from '@/process/services/database/repairLegacyHandoffSchema';

function makeDriver(tableColumns: Record<string, string[]>) {
  const exec = vi.fn();
  return {
    exec,
    pragma: vi.fn((sql: string) => {
      const match = /^table_info\(([^)]+)\)$/.exec(sql);
      if (!match) return [];
      const table = match[1];
      const columns = tableColumns[table];
      if (!columns) return [];
      return columns.map((name) => ({ name }));
    }),
  };
}

describe('legacy handoff schema repair', () => {
  it('keeps the AionUi mirror contract aligned with AionCore handoff columns', () => {
    expect(LEGACY_HANDOFF_COLUMNS).toEqual([
      { table: 'cron_jobs', column: 'skill_content', definition: 'TEXT' },
      { table: 'cron_jobs', column: 'description', definition: 'TEXT' },
      { table: 'conversations', column: 'pinned', definition: 'INTEGER NOT NULL DEFAULT 0' },
      { table: 'conversations', column: 'pinned_at', definition: 'INTEGER' },
      { table: 'teams', column: 'session_mode', definition: 'TEXT' },
      { table: 'teams', column: 'agents_version', definition: "TEXT NOT NULL DEFAULT '1.0.0'" },
    ]);
  });

  it('adds missing compatible columns on existing tables', () => {
    const driver = makeDriver({
      teams: [
        'id',
        'user_id',
        'name',
        'workspace',
        'workspace_mode',
        'agents',
        'lead_agent_id',
        'created_at',
        'updated_at',
      ],
      conversations: ['id', 'user_id', 'name', 'type', 'extra', 'model', 'status', 'created_at', 'updated_at'],
      cron_jobs: ['id', 'name'],
    });

    const result = repairLegacyHandoffSchema(driver as any);

    expect(result.repairedColumns).toContainEqual({ table: 'teams', column: 'session_mode' });
    expect(result.repairedColumns).toContainEqual({ table: 'teams', column: 'agents_version' });
    expect(driver.exec).toHaveBeenCalledWith('ALTER TABLE teams ADD COLUMN session_mode TEXT');
    expect(driver.exec).toHaveBeenCalledWith(
      "ALTER TABLE teams ADD COLUMN agents_version TEXT NOT NULL DEFAULT '1.0.0'"
    );
  });

  it('skips tables that do not exist in the legacy DB', () => {
    const driver = makeDriver({
      teams: ['id', 'session_mode', 'agents_version'],
    });

    const result = repairLegacyHandoffSchema(driver as any);

    expect(result.skippedTables).toContain('cron_jobs');
    expect(driver.exec).not.toHaveBeenCalledWith(expect.stringContaining('cron_jobs'));
  });

  it('is a no-op when every contract column already exists', () => {
    const driver = makeDriver({
      teams: ['id', 'session_mode', 'agents_version'],
      conversations: ['id', 'pinned', 'pinned_at'],
      cron_jobs: ['id', 'skill_content', 'description'],
    });

    const result = repairLegacyHandoffSchema(driver as any);

    expect(result.repairedColumns).toEqual([]);
    expect(driver.exec).not.toHaveBeenCalled();
  });
});
