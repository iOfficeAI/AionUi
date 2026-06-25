import { describe, expect, it, vi } from 'vitest';
import { classifyBackendStartupFailure } from '@/process/startup/backendStartupFailure';
import { repairLegacyHandoffSchema } from '@/process/services/database/repairLegacyHandoffSchema';

function makeDriver(tableColumns: Record<string, string[]>) {
  const exec = vi.fn((sql: string) => {
    const match = /^ALTER TABLE (\w+) ADD COLUMN (\w+) /.exec(sql);
    if (!match) return;
    const [, table, column] = match;
    tableColumns[table] = [...(tableColumns[table] ?? []), column];
  });
  return {
    exec,
    pragma: vi.fn((sql: string) => {
      const match = /^table_info\(([^)]+)\)$/.exec(sql);
      if (!match) return [];
      return (tableColumns[match[1]] ?? []).map((name) => ({ name }));
    }),
  };
}

describe('legacy handoff user-state matrix', () => {
  it('covers v1.x users by repairing drifted source DB before first backend copy', () => {
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
    expect(result.repairedColumns).toContainEqual({ table: 'conversations', column: 'pinned' });
  });

  it('covers already-upgraded v2.x users with a no-op repair', () => {
    const driver = makeDriver({
      teams: ['id', 'session_mode', 'agents_version'],
      conversations: ['id', 'pinned', 'pinned_at'],
      cron_jobs: ['id', 'skill_content', 'description'],
    });

    const result = repairLegacyHandoffSchema(driver as any);

    expect(result.repairedColumns).toEqual([]);
    expect(driver.exec).not.toHaveBeenCalled();
  });

  it('covers unrecoverable backend DB failures by keeping data migration classification', () => {
    const error = new Error('aioncore exited before health check passed') as Error & {
      details?: Record<string, unknown>;
    };
    error.details = {
      stage: 'early_exit',
      backendBoundaryCode: 'BOOTSTRAP_DATA_INIT_FAILED',
      backendBoundaryStage: 'database.migration',
    };

    expect(classifyBackendStartupFailure(error).reason).toBe('backend_data_migration_failed');
  });
});
