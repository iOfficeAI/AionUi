/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Regression coverage for the model-config migration
 * (`docs/backend-migration/specs/2026-04-24-model-config-frontend-migration-design.md`).
 *
 * Root-cause guarantee: the `/api/settings/client` endpoint leaked a
 * `model.config` key because the legacy migration path pushed `IProvider[]`
 * into the generic client-preferences KV store. Removing `'model.config'`
 * from `ALL_LEGACY_KEYS` is what kills that leak. These tests freeze that
 * removal so a future good-intentioned re-add would fail the suite.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockLegacyGet = vi.fn();
const mockSetBatch = vi.fn();
const mockServiceGet = vi.fn();

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: mockServiceGet,
    setBatch: mockSetBatch,
  },
}));

vi.mock('@/common/config/storage', () => ({
  ConfigStorage: {
    get: mockLegacyGet,
  },
}));

const { migrateConfigStorage } = await import('@/common/config/configMigration');

describe('configMigration — model.config is not a legacy key', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not request model.config from legacy storage during migration', async () => {
    mockServiceGet.mockReturnValue(undefined);
    mockLegacyGet.mockResolvedValue(undefined);

    await migrateConfigStorage();

    const requestedKeys = mockLegacyGet.mock.calls.map((call) => call[0] as string);
    expect(requestedKeys).not.toContain('model.config');
  });

  it('never pushes model.config to the backend even if legacy storage returns one', async () => {
    // Pathological case: an old dev build somehow wrote a `model.config`
    // row to the legacy store. The frontend must *not* replay it into the
    // new client-preferences KV (which is exactly what produced the leak
    // observed before the migration). Because `model.config` is no longer
    // in `ALL_LEGACY_KEYS`, `ConfigStorage.get('model.config')` is never
    // called, and the value simply stays orphaned.
    mockServiceGet.mockReturnValue(undefined);
    mockLegacyGet.mockImplementation(async (key: string) => {
      if (key === 'model.config') {
        // Would only run if someone re-added the key; keep the shape
        // realistic so a regression is loud.
        return [
          {
            id: 'legacy',
            platform: 'openai',
            name: 'Legacy',
            base_url: 'https://api.openai.com',
            api_key: 'sk-legacy',
            models: ['gpt-4'],
          },
        ];
      }
      if (key === 'theme') return 'dark';
      return undefined;
    });

    await migrateConfigStorage();

    expect(mockSetBatch).toHaveBeenCalledTimes(1);
    const batchArg = mockSetBatch.mock.calls[0][0] as Record<string, unknown>;
    expect(batchArg).not.toHaveProperty('model.config');
    // Sanity: legitimate keys still flow through so the test is actually
    // exercising the migration code path.
    expect(batchArg.theme).toBe('dark');
    expect(batchArg['migration.configStorageImported']).toBe(true);
  });

  it('requests more than 40 legacy keys overall (sanity)', async () => {
    // The real `ALL_LEGACY_KEYS` list is ~55 entries. If the module
    // accidentally got stubbed to a smaller subset the other assertions
    // above could silently pass. This guards against that class of bug.
    mockServiceGet.mockReturnValue(undefined);
    mockLegacyGet.mockResolvedValue(undefined);

    await migrateConfigStorage();

    expect(mockLegacyGet.mock.calls.length).toBeGreaterThan(40);
  });
});
