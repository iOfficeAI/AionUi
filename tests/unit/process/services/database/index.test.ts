import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ISqliteDriver } from '@process/services/database/drivers/ISqliteDriver';

vi.mock('@process/utils', () => ({
  ensureDirectory: vi.fn(),
  getDataPath: vi.fn(() => '/tmp/test'),
}));

vi.mock('@process/services/database/drivers/createDriver');
vi.mock('@process/services/database/migrations', () => ({ runMigrations: vi.fn() }));

vi.mock('@process/services/database/schema', () => ({
  CURRENT_DB_VERSION: 1,
  getDatabaseVersion: vi.fn(() => 1),
  initSchema: vi.fn(),
  setDatabaseVersion: vi.fn(),
}));

vi.mock('@process/services/database/types', () => ({
  conversationToRow: vi.fn(),
  messageToRow: vi.fn(),
  rowToConversation: vi.fn(),
  rowToMessage: vi.fn(),
}));

vi.mock('@process/channels/types', () => ({
  rowToChannelUser: vi.fn(),
  rowToChannelSession: vi.fn(),
  rowToPairingRequest: vi.fn(),
}));

vi.mock('@process/channels/utils/credentialCrypto', () => ({
  encryptCredentials: vi.fn(),
  decryptCredentials: vi.fn(),
  encryptString: vi.fn(),
  decryptString: vi.fn(),
}));

import { AionUIDatabase } from '@process/services/database/index';
import { createDriver } from '@process/services/database/drivers/createDriver';
import { initSchema } from '@process/services/database/schema';
import fs from 'fs';

function createMockDriver(): ISqliteDriver {
  return {
    prepare: vi.fn(() => ({
      get: vi.fn(),
      all: vi.fn(() => []),
      run: vi.fn(() => ({ changes: 0, lastInsertRowid: 0 })),
    })),
    exec: vi.fn(),
    pragma: vi.fn(),
    transaction: vi.fn((fn) => fn),
    close: vi.fn(),
  };
}

describe('AionUIDatabase.create recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('closes the failed driver before attempting file recovery', async () => {
    const failedDriver = createMockDriver();
    const freshDriver = createMockDriver();

    vi.mocked(createDriver).mockResolvedValueOnce(failedDriver).mockResolvedValueOnce(freshDriver);

    // First init fails (corruption), second succeeds
    vi.mocked(initSchema)
      .mockImplementationOnce(() => {
        throw new Error('database disk image is malformed');
      })
      .mockImplementationOnce(() => {});

    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation(() => undefined as never);
    vi.spyOn(fs, 'unlinkSync').mockImplementation(() => undefined as never);

    await AionUIDatabase.create('/tmp/test.db');

    expect(failedDriver.close).toHaveBeenCalledOnce();
    expect(renameSpy).toHaveBeenCalled();
  });

  it('recovers successfully after closing the failed driver', async () => {
    const failedDriver = createMockDriver();
    const freshDriver = createMockDriver();

    vi.mocked(createDriver).mockResolvedValueOnce(failedDriver).mockResolvedValueOnce(freshDriver);

    vi.mocked(initSchema)
      .mockImplementationOnce(() => {
        throw new Error('database disk image is malformed');
      })
      .mockImplementationOnce(() => {});

    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'renameSync').mockImplementation(() => undefined as never);
    vi.spyOn(fs, 'unlinkSync').mockImplementation(() => undefined as never);

    const db = await AionUIDatabase.create('/tmp/test.db');
    expect(db).toBeInstanceOf(AionUIDatabase);
    expect(createDriver).toHaveBeenCalledTimes(2);
  });

  it('does not close driver when createDriver itself throws', async () => {
    vi.mocked(createDriver).mockRejectedValueOnce(new Error('dlopen failed: libsqlite3.so not found'));

    await expect(AionUIDatabase.create('/tmp/test.db')).rejects.toThrow('dlopen');
  });

  it('throws when corrupted file cannot be renamed or deleted', async () => {
    const failedDriver = createMockDriver();

    vi.mocked(createDriver).mockResolvedValueOnce(failedDriver);

    vi.mocked(initSchema).mockImplementationOnce(() => {
      throw new Error('database disk image is malformed');
    });

    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('EPERM: operation not permitted');
    });
    vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {
      throw new Error('EPERM: operation not permitted');
    });

    await expect(AionUIDatabase.create('/tmp/test.db')).rejects.toThrow(
      'Database is corrupted and cannot be recovered'
    );
    expect(failedDriver.close).toHaveBeenCalledOnce();
  });

  it('falls back to unlink when rename fails', async () => {
    const failedDriver = createMockDriver();
    const freshDriver = createMockDriver();

    vi.mocked(createDriver).mockResolvedValueOnce(failedDriver).mockResolvedValueOnce(freshDriver);

    vi.mocked(initSchema)
      .mockImplementationOnce(() => {
        throw new Error('database disk image is malformed');
      })
      .mockImplementationOnce(() => {});

    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('EPERM');
    });
    const unlinkSpy = vi.spyOn(fs, 'unlinkSync').mockImplementation(() => undefined as never);

    await AionUIDatabase.create('/tmp/test.db');

    expect(unlinkSpy).toHaveBeenCalledWith('/tmp/test.db');
  });
});
