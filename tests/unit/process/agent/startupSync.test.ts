/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DefaultModelIntent } from '../../../../src/common/config/storage';

const resolveProcessUnifiedIntentForMigration = vi.fn();

vi.mock('../../../../src/process/agent/modelSync/defaultModelIntent', () => ({
  resolveProcessUnifiedIntentForMigration,
}));

const { prepareDefaultModelSyncOnStartup, STARTUP_DEFAULT_MODEL_SYNC_BACKENDS, getStartupBackendSyncState } = await import(
  '../../../../src/process/agent/modelSync/startupSync'
);

type StoreShape = Record<string, unknown>;

function createConfigStore(initial: StoreShape = {}) {
  const store: StoreShape = { ...initial };
  return {
    store,
    get: vi.fn(async (key: string) => store[key]),
    set: vi.fn(async (key: string, value: unknown) => {
      store[key] = value;
      return value;
    }),
  };
}

const SAMPLE_INTENT: DefaultModelIntent = {
  providerId: 'provider-1',
  modelId: 'gpt-4.1',
  providerPlatform: 'openai',
  providerName: 'Provider 1',
  source: 'migration',
  updatedAt: 100,
};

describe('prepareDefaultModelSyncOnStartup', () => {
  beforeEach(() => {
    resolveProcessUnifiedIntentForMigration.mockReset();
  });

  it('backfills unified intent once and syncs startup backends', async () => {
    const configStore = createConfigStore({
      'migration.defaultModelIntentBackfilled': false,
    });
    resolveProcessUnifiedIntentForMigration.mockResolvedValue(SAMPLE_INTENT);
    const syncBackends = vi.fn(async () => [
      { backend: 'claude', supported: true, appliedModelId: 'default:gpt-4.1' },
      { backend: 'openclaw-gateway', supported: true, appliedModelId: 'provider-1/gpt-4.1' },
      { backend: 'hermes', supported: true, appliedModelId: 'custom:provider-1:gpt-4.1' },
      { backend: 'opencode', supported: true, appliedModelId: 'provider-1:gpt-4.1' },
    ]);

    const result = await prepareDefaultModelSyncOnStartup(configStore, syncBackends);

    expect(configStore.set).toHaveBeenNthCalledWith(1, 'agent.defaultModelIntent', SAMPLE_INTENT);
    expect(configStore.set).toHaveBeenNthCalledWith(2, 'migration.defaultModelIntentBackfilled', true);
    expect(syncBackends).toHaveBeenCalledWith(SAMPLE_INTENT, [...STARTUP_DEFAULT_MODEL_SYNC_BACKENDS]);
    expect(configStore.store['agent.startupModelSyncResults']).toEqual([
      { backend: 'claude', supported: true, appliedModelId: 'default:gpt-4.1' },
      { backend: 'openclaw-gateway', supported: true, appliedModelId: 'provider-1/gpt-4.1' },
      { backend: 'hermes', supported: true, appliedModelId: 'custom:provider-1:gpt-4.1' },
      { backend: 'opencode', supported: true, appliedModelId: 'provider-1:gpt-4.1' },
    ]);
    expect(result.backfilled).toBe(true);
    expect(result.migrationMarked).toBe(true);
    expect(result.syncResults).toHaveLength(4);
  });

  it('does not overwrite an existing unified intent and still syncs it', async () => {
    const existingIntent: DefaultModelIntent = {
      providerId: 'provider-live',
      modelId: 'claude-4-sonnet',
      updatedAt: 200,
      source: 'guid',
    };
    const configStore = createConfigStore({
      'migration.defaultModelIntentBackfilled': false,
      'agent.defaultModelIntent': existingIntent,
    });
    resolveProcessUnifiedIntentForMigration.mockResolvedValue(SAMPLE_INTENT);
    const syncBackends = vi.fn(async () => []);

    const result = await prepareDefaultModelSyncOnStartup(configStore, syncBackends);

    expect(configStore.set).toHaveBeenCalledTimes(2);
    expect(configStore.set).toHaveBeenCalledWith('migration.defaultModelIntentBackfilled', true);
    expect(configStore.set).toHaveBeenCalledWith('agent.startupModelSyncResults', []);
    expect(syncBackends).toHaveBeenCalledWith(existingIntent, [...STARTUP_DEFAULT_MODEL_SYNC_BACKENDS]);
    expect(result.intent).toEqual(existingIntent);
    expect(result.backfilled).toBe(false);
  });

  it('skips migration writes after the backfill flag is already set', async () => {
    const configStore = createConfigStore({
      'migration.defaultModelIntentBackfilled': true,
      'agent.defaultModelIntent': SAMPLE_INTENT,
    });
    const syncBackends = vi.fn(async () => []);

    const result = await prepareDefaultModelSyncOnStartup(configStore, syncBackends);

    expect(resolveProcessUnifiedIntentForMigration).not.toHaveBeenCalled();
    expect(configStore.set).toHaveBeenCalledOnce();
    expect(configStore.set).toHaveBeenCalledWith('agent.startupModelSyncResults', []);
    expect(syncBackends).toHaveBeenCalledWith(SAMPLE_INTENT, [...STARTUP_DEFAULT_MODEL_SYNC_BACKENDS]);
    expect(result.migrationMarked).toBe(false);
  });

  it('marks migration complete even when no legacy intent can be resolved', async () => {
    const configStore = createConfigStore({
      'migration.defaultModelIntentBackfilled': false,
    });
    resolveProcessUnifiedIntentForMigration.mockResolvedValue(null);
    const syncBackends = vi.fn();

    const result = await prepareDefaultModelSyncOnStartup(configStore, syncBackends);

    expect(configStore.set).toHaveBeenCalledTimes(2);
    expect(configStore.set).toHaveBeenCalledWith('migration.defaultModelIntentBackfilled', true);
    expect(configStore.set).toHaveBeenCalledWith('agent.startupModelSyncResults', []);
    expect(syncBackends).not.toHaveBeenCalled();
    expect(result.intent).toBeNull();
    expect(result.syncResults).toEqual([]);
    expect(configStore.store['agent.startupModelSyncResults']).toEqual([]);
  });

  it('captures sync errors without throwing so startup remains non-blocking', async () => {
    const configStore = createConfigStore({
      'migration.defaultModelIntentBackfilled': true,
      'agent.defaultModelIntent': SAMPLE_INTENT,
    });
    const syncBackends = vi.fn(async () => {
      throw new Error('sync failed');
    });

    const result = await prepareDefaultModelSyncOnStartup(configStore, syncBackends);

    expect(result.intent).toEqual(SAMPLE_INTENT);
    expect(result.syncResults).toEqual([]);
    expect(result.syncError).toBe('sync failed');
    expect(configStore.store['agent.startupModelSyncResults']).toEqual([]);
  });

  it('reads persisted startup sync state for a backend', async () => {
    const configStore = createConfigStore({
      'agent.startupModelSyncResults': [
        { backend: 'claude', supported: true, state: 'prepared' },
        { backend: 'hermes', supported: false, state: 'degraded' },
      ],
    });

    await expect(getStartupBackendSyncState(configStore, 'claude')).resolves.toBe('prepared');
    await expect(getStartupBackendSyncState(configStore, 'hermes')).resolves.toBe('degraded');
    await expect(getStartupBackendSyncState(configStore, 'openclaw-gateway')).resolves.toBeNull();
  });
});
