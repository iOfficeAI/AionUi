import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();
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
    get: mockGet,
  },
}));

const { migrateConfigStorage } = await import('@/common/config/configMigration');

describe('migrateConfigStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should skip migration if flag already set', async () => {
    mockServiceGet.mockReturnValue(true);
    await migrateConfigStorage();
    expect(mockSetBatch).not.toHaveBeenCalled();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('should read all legacy keys from ConfigStorage', async () => {
    mockServiceGet.mockReturnValue(undefined);
    mockGet.mockResolvedValue(undefined);
    await migrateConfigStorage();
    expect(mockGet.mock.calls.length).toBeGreaterThan(40);
  });

  it('should migrate found values and set flag', async () => {
    mockServiceGet.mockReturnValue(undefined);
    mockGet.mockImplementation(async (key: string) => {
      if (key === 'theme') return 'dark';
      if (key === 'language') return 'zh-CN';
      return undefined;
    });
    await migrateConfigStorage();
    expect(mockSetBatch).toHaveBeenCalledTimes(1);
    const batchArg = mockSetBatch.mock.calls[0][0];
    expect(batchArg.theme).toBe('dark');
    expect(batchArg.language).toBe('zh-CN');
    expect(batchArg['migration.configStorageImported']).toBe(true);
  });

  it('should skip null values', async () => {
    mockServiceGet.mockReturnValue(undefined);
    mockGet.mockImplementation(async (key: string) => {
      if (key === 'theme') return null;
      return undefined;
    });
    await migrateConfigStorage();
    const batchArg = mockSetBatch.mock.calls[0][0];
    expect(batchArg.theme).toBeUndefined();
    expect(batchArg['migration.configStorageImported']).toBe(true);
  });

  it('should handle ConfigStorage.get errors gracefully', async () => {
    mockServiceGet.mockReturnValue(undefined);
    mockGet.mockRejectedValue(new Error('storage error'));
    await migrateConfigStorage();
    expect(mockSetBatch).toHaveBeenCalledTimes(1);
    const batchArg = mockSetBatch.mock.calls[0][0];
    expect(batchArg['migration.configStorageImported']).toBe(true);
  });
});
