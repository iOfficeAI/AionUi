import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockHttpRequest } = vi.hoisted(() => ({
  mockHttpRequest: vi.fn(),
}));

const mockMigrateConfigStorage = vi.fn();
const mockMigrateProviders = vi.fn();
const mockMigrateAssistantsToBackend = vi.fn();

vi.mock('@/common/config/configMigration', () => ({
  migrateConfigStorage: mockMigrateConfigStorage,
  migrateProviders: mockMigrateProviders,
}));

vi.mock('@/common/adapter/httpBridge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/common/adapter/httpBridge')>();
  return {
    ...actual,
    httpRequest: mockHttpRequest,
  };
});

vi.mock('@/process/utils/migrateAssistants', () => ({
  migrateAssistantsToBackend: mockMigrateAssistantsToBackend,
}));

const { runBackendMigrations } = await import('@/process/utils/runBackendMigrations');

describe('runBackendMigrations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMigrateConfigStorage.mockResolvedValue(undefined);
    mockMigrateProviders.mockResolvedValue(undefined);
    mockMigrateAssistantsToBackend.mockResolvedValue(true);
    mockHttpRequest.mockResolvedValue(undefined);
  });

  it('runs backend migrations in order', async () => {
    const configFile = {
      get: vi.fn(async () => false),
      set: vi.fn(async () => undefined),
    } as never;
    const order: string[] = [];
    mockMigrateConfigStorage.mockImplementation(async () => {
      order.push('config');
    });
    mockMigrateProviders.mockImplementation(async () => {
      order.push('providers');
    });
    mockMigrateAssistantsToBackend.mockImplementation(async () => {
      order.push('assistants');
      return true;
    });
    mockHttpRequest.mockImplementation(async () => {
      order.push('cleanup');
    });

    await runBackendMigrations(configFile);

    expect(order).toEqual(['cleanup', 'config', 'providers', 'assistants']);
    expect(mockMigrateAssistantsToBackend).toHaveBeenCalledWith(configFile);
    expect((configFile as { set: ReturnType<typeof vi.fn> }).set).toHaveBeenCalledWith(
      'migration.electronConfigImported',
      true
    );
  });

  it('continues when one migration step throws', async () => {
    const configFile = {
      get: vi.fn(async () => false),
      set: vi.fn(async () => undefined),
    } as never;
    mockMigrateConfigStorage.mockRejectedValueOnce(new Error('boom'));

    await runBackendMigrations(configFile);

    expect(mockMigrateProviders).toHaveBeenCalledTimes(1);
    expect(mockMigrateAssistantsToBackend).toHaveBeenCalledWith(configFile);
    expect(mockHttpRequest).toHaveBeenCalledTimes(1);
    expect((configFile as { set: ReturnType<typeof vi.fn> }).set).not.toHaveBeenCalled();
  });

  it('skips migration steps when migration.electronConfigImported is already true', async () => {
    const configFile = {
      get: vi.fn(async () => true),
      set: vi.fn(async () => undefined),
    } as never;

    await runBackendMigrations(configFile);

    expect(mockHttpRequest).toHaveBeenCalledWith('PUT', '/api/settings/client', {
      assistants: null,
      'migration.assistantEnabledFixed': null,
      'migration.coworkDefaultSkillsAdded': null,
      'migration.builtinDefaultSkillsAdded_v2': null,
      'migration.promptsI18nAdded': null,
      'migration.assistantsSplitCustom': null,
    });
    expect(mockMigrateConfigStorage).not.toHaveBeenCalled();
    expect(mockMigrateProviders).not.toHaveBeenCalled();
    expect(mockMigrateAssistantsToBackend).not.toHaveBeenCalled();
    expect((configFile as { set: ReturnType<typeof vi.fn> }).set).not.toHaveBeenCalled();
  });

  it('does not mark overall migration complete when assistants migration is incomplete', async () => {
    const configFile = {
      get: vi.fn(async () => false),
      set: vi.fn(async () => undefined),
    } as never;
    mockMigrateAssistantsToBackend.mockResolvedValueOnce(false);

    await runBackendMigrations(configFile);

    expect(mockMigrateConfigStorage).toHaveBeenCalledTimes(1);
    expect(mockMigrateProviders).toHaveBeenCalledTimes(1);
    expect(mockMigrateAssistantsToBackend).toHaveBeenCalledTimes(1);
    expect((configFile as { set: ReturnType<typeof vi.fn> }).set).not.toHaveBeenCalled();
  });
});
