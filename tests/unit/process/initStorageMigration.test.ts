/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import type { AcpBackendConfig } from '../../../src/common/types/acpTypes';

/**
 * Test the one-time split migration in initStorage.ts §5.2.
 *
 * v1.9.18 accidentally merged `acp.customAgents` (user-defined ACP agents) into
 * `assistants` (preset assistants). This migration splits them back:
 *
 *   - `assistants`       → preset entries only (isPreset === true)
 *   - `acp.customAgents` → user-defined customs (isPreset !== true), merged with
 *                          any already-existing `acp.customAgents` entries
 *
 * The migration is gated by `migration.assistantsSplitCustom` so it runs once.
 *
 * Because initStorage() has many side-effects (filesystem, database, MCP, etc.),
 * we test the migration contract directly against an in-memory config store,
 * mirroring the same pattern used by the other migration tests.
 */

type ConfigStore = {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<unknown>;
};

/**
 * Reproduce the exact migration logic from initStorage.ts §5.2.
 * Keeping this inline couples the test to behavior, not implementation detail.
 */
async function splitAssistantsMigration(configFile: ConfigStore): Promise<void> {
  const ASSISTANTS_SPLIT_MIGRATION_KEY = 'migration.assistantsSplitCustom';
  const splitMigrationDone = await configFile.get(ASSISTANTS_SPLIT_MIGRATION_KEY).catch(() => false);
  if (splitMigrationDone) return;

  const legacyCustomAgents =
    ((await configFile.get('acp.customAgents').catch((): undefined => undefined)) as AcpBackendConfig[] | undefined) ||
    [];
  const currentAssistants =
    ((await configFile.get('assistants').catch((): undefined => undefined)) as AcpBackendConfig[] | undefined) || [];

  const presetsInAssistants = currentAssistants.filter((a) => a.isPreset === true);
  const customsInAssistants = currentAssistants.filter((a) => a.isPreset !== true);

  const existingCustomIds = new Set(legacyCustomAgents.map((a) => a.id));
  const mergedCustoms = [...legacyCustomAgents, ...customsInAssistants.filter((a) => !existingCustomIds.has(a.id))];

  if (mergedCustoms.length > 0) {
    await configFile.set('acp.customAgents', mergedCustoms);
  }
  await configFile.set('assistants', presetsInAssistants);
  await configFile.set(ASSISTANTS_SPLIT_MIGRATION_KEY, true);
}

function makeConfigStore(initial: Record<string, unknown> = {}): ConfigStore & {
  store: Record<string, unknown>;
  getMock: ReturnType<typeof vi.fn>;
  setMock: ReturnType<typeof vi.fn>;
} {
  const store: Record<string, unknown> = { ...initial };
  const getMock = vi.fn(async (key: string) => store[key]);
  const setMock = vi.fn(async (key: string, value: unknown) => {
    store[key] = value;
    return value;
  });
  return { get: getMock, set: setMock, store, getMock, setMock };
}

describe('assistants split migration (acp.customAgents ←→ assistants)', () => {
  it('splits mixed entries in assistants back into presets + custom agents', async () => {
    const assistants: AcpBackendConfig[] = [
      { id: 'builtin-cowork', name: 'Cowork', isPreset: true },
      { id: 'xagent', name: 'XAgent', defaultCliPath: 'java -jar xagent.jar' },
      { id: 'builtin-scholar', name: 'Scholar', isPreset: true },
      { id: 'my-cli', name: 'My CLI', defaultCliPath: '/usr/bin/my-cli' },
    ];
    const config = makeConfigStore({ assistants });

    await splitAssistantsMigration(config);

    expect(config.store['assistants']).toEqual([
      { id: 'builtin-cowork', name: 'Cowork', isPreset: true },
      { id: 'builtin-scholar', name: 'Scholar', isPreset: true },
    ]);
    expect(config.store['acp.customAgents']).toEqual([
      { id: 'xagent', name: 'XAgent', defaultCliPath: 'java -jar xagent.jar' },
      { id: 'my-cli', name: 'My CLI', defaultCliPath: '/usr/bin/my-cli' },
    ]);
    expect(config.store['migration.assistantsSplitCustom']).toBe(true);
  });

  it('merges existing acp.customAgents with customs extracted from assistants, deduping by id', async () => {
    const legacyCustoms: AcpBackendConfig[] = [{ id: 'xagent', name: 'XAgent (legacy)', defaultCliPath: '/old/path' }];
    const assistants: AcpBackendConfig[] = [
      { id: 'builtin-cowork', name: 'Cowork', isPreset: true },
      // Same id as legacy → legacy wins (dedup)
      { id: 'xagent', name: 'XAgent (duplicate)', defaultCliPath: '/new/path' },
      { id: 'another', name: 'Another', defaultCliPath: '/tmp/another' },
    ];
    const config = makeConfigStore({ 'acp.customAgents': legacyCustoms, assistants });

    await splitAssistantsMigration(config);

    expect(config.store['acp.customAgents']).toEqual([
      { id: 'xagent', name: 'XAgent (legacy)', defaultCliPath: '/old/path' },
      { id: 'another', name: 'Another', defaultCliPath: '/tmp/another' },
    ]);
    expect(config.store['assistants']).toEqual([{ id: 'builtin-cowork', name: 'Cowork', isPreset: true }]);
  });

  it('does nothing when migration flag is already set', async () => {
    const config = makeConfigStore({
      assistants: [{ id: 'x', name: 'X', defaultCliPath: '/x' }],
      'migration.assistantsSplitCustom': true,
    });

    await splitAssistantsMigration(config);

    expect(config.setMock).not.toHaveBeenCalled();
    expect(config.store['assistants']).toEqual([{ id: 'x', name: 'X', defaultCliPath: '/x' }]);
    expect(config.store['acp.customAgents']).toBeUndefined();
  });

  it('handles empty state: writes empty assistants and sets flag', async () => {
    const config = makeConfigStore({});

    await splitAssistantsMigration(config);

    expect(config.store['assistants']).toEqual([]);
    // No customs → acp.customAgents not written
    expect(config.store['acp.customAgents']).toBeUndefined();
    expect(config.store['migration.assistantsSplitCustom']).toBe(true);
  });

  it('preserves isPreset===true entries in assistants unchanged', async () => {
    const assistants: AcpBackendConfig[] = [
      { id: 'builtin-a', name: 'A', isPreset: true, enabled: true },
      { id: 'builtin-b', name: 'B', isPreset: true, enabled: false },
    ];
    const config = makeConfigStore({ assistants });

    await splitAssistantsMigration(config);

    expect(config.store['assistants']).toEqual(assistants);
    expect(config.store['acp.customAgents']).toBeUndefined();
  });

  it('treats missing isPreset as custom (isPreset !== true)', async () => {
    const assistants: AcpBackendConfig[] = [{ id: 'legacy', name: 'No Flag', defaultCliPath: '/bin/legacy' }];
    const config = makeConfigStore({ assistants });

    await splitAssistantsMigration(config);

    expect(config.store['assistants']).toEqual([]);
    expect(config.store['acp.customAgents']).toEqual(assistants);
  });

  it('gracefully handles get() errors — treats as empty', async () => {
    const config = makeConfigStore({});
    config.getMock.mockRejectedValue(new Error('storage corrupted'));

    await splitAssistantsMigration(config);

    // The flag check also rejects → treated as not-done; migration proceeds on empty data.
    expect(config.store['assistants']).toEqual([]);
    expect(config.store['migration.assistantsSplitCustom']).toBe(true);
  });
});
