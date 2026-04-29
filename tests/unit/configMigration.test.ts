import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLegacyGet = vi.fn();
const mockHttpRequest = vi.fn();

vi.mock('@/common/adapter/httpBridge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/common/adapter/httpBridge')>();
  return {
    ...actual,
    httpRequest: mockHttpRequest,
  };
});

vi.mock('@/common/config/storage', () => ({
  ConfigStorage: {
    get: mockLegacyGet,
  },
}));

const { migrateConfigStorage } = await import('@/common/config/configMigration');

describe('migrateConfigStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHttpRequest.mockImplementation(async (method: string, _path: string, body?: unknown) => {
      if (method === 'GET') return {};
      if (method === 'PUT') return body;
      return undefined;
    });
  });

  it('should skip migration if flag already set', async () => {
    mockHttpRequest.mockResolvedValueOnce({ 'migration.configStorageImported': true });
    await migrateConfigStorage();
    expect(mockHttpRequest).toHaveBeenCalledTimes(1);
    expect(mockLegacyGet).not.toHaveBeenCalled();
  });

  it('should read all legacy keys from ConfigStorage', async () => {
    mockLegacyGet.mockResolvedValue(undefined);
    await migrateConfigStorage();
    expect(mockLegacyGet.mock.calls.length).toBeGreaterThan(40);
  });

  it('should migrate found values and set flag', async () => {
    mockLegacyGet.mockImplementation(async (key: string) => {
      if (key === 'theme') return 'dark';
      if (key === 'language') return 'zh-CN';
      if (key === 'assistants') return [{ id: 'legacy-a', name: 'Legacy' }];
      if (key === 'migration.electronConfigImported') return true;
      return undefined;
    });
    await migrateConfigStorage();
    expect(mockHttpRequest).toHaveBeenCalledWith('PUT', '/api/settings/client', expect.any(Object));
    const batchArg = mockHttpRequest.mock.calls.find((call) => call[0] === 'PUT')?.[2] as Record<string, unknown>;
    expect(batchArg.theme).toBe('dark');
    expect(batchArg.language).toBe('zh-CN');
    expect(batchArg.assistants).toBeUndefined();
    expect(batchArg['migration.electronConfigImported']).toBeUndefined();
    expect(batchArg['migration.configStorageImported']).toBe(true);
  });

  it('should not request migration.electronConfigImported from legacy storage', async () => {
    mockLegacyGet.mockResolvedValue(undefined);
    await migrateConfigStorage();
    const requestedKeys = mockLegacyGet.mock.calls.map((call) => call[0] as string);
    expect(requestedKeys).not.toContain('migration.electronConfigImported');
    expect(requestedKeys).not.toContain('migration.assistantEnabledFixed');
    expect(requestedKeys).not.toContain('migration.coworkDefaultSkillsAdded');
    expect(requestedKeys).not.toContain('migration.builtinDefaultSkillsAdded_v2');
    expect(requestedKeys).not.toContain('migration.promptsI18nAdded');
    expect(requestedKeys).not.toContain('migration.assistantsSplitCustom');
  });

  it('should skip null values', async () => {
    mockLegacyGet.mockImplementation(async (key: string) => {
      if (key === 'theme') return null;
      return undefined;
    });
    await migrateConfigStorage();
    const batchArg = mockHttpRequest.mock.calls.find((call) => call[0] === 'PUT')?.[2] as Record<string, unknown>;
    expect(batchArg.theme).toBeUndefined();
    expect(batchArg['migration.configStorageImported']).toBe(true);
  });

  it('should handle ConfigStorage.get errors gracefully', async () => {
    mockLegacyGet.mockRejectedValue(new Error('storage error'));
    await migrateConfigStorage();
    expect(mockHttpRequest).toHaveBeenCalledWith('PUT', '/api/settings/client', expect.any(Object));
    const batchArg = mockHttpRequest.mock.calls.find((call) => call[0] === 'PUT')?.[2] as Record<string, unknown>;
    expect(batchArg['migration.configStorageImported']).toBe(true);
  });
});
