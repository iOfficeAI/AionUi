import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockServiceGet = vi.fn();
const mockServiceSet = vi.fn();
const mockLegacyGet = vi.fn();
const mockListProviders = vi.fn();
const mockCreateProvider = vi.fn();

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: mockServiceGet,
    set: mockServiceSet,
    setBatch: vi.fn(),
  },
}));

vi.mock('@/common/config/storage', () => ({
  ConfigStorage: {
    get: mockLegacyGet,
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    mode: {
      listProviders: { invoke: mockListProviders },
      createProvider: { invoke: mockCreateProvider },
    },
  },
}));

const { migrateProviders } = await import('@/common/config/configMigration');

describe('migrateProviders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips when flag is already set', async () => {
    mockServiceGet.mockReturnValue(true);

    await migrateProviders();

    expect(mockListProviders).not.toHaveBeenCalled();
    expect(mockServiceSet).not.toHaveBeenCalled();
  });

  it('sets flag and returns when backend already has providers', async () => {
    mockServiceGet.mockReturnValue(undefined);
    mockListProviders.mockResolvedValue([{ id: 'existing' }]);

    await migrateProviders();

    expect(mockServiceSet).toHaveBeenCalledWith('migration.providersImported', true);
    expect(mockLegacyGet).not.toHaveBeenCalled();
  });

  it('sets flag and returns when ConfigStorage has no model.config', async () => {
    mockServiceGet.mockReturnValue(undefined);
    mockListProviders.mockResolvedValue([]);
    mockLegacyGet.mockRejectedValue(new Error('not found'));

    await migrateProviders();

    expect(mockServiceSet).toHaveBeenCalledWith('migration.providersImported', true);
    expect(mockCreateProvider).not.toHaveBeenCalled();
  });

  it('sets flag and returns when model.config is empty array', async () => {
    mockServiceGet.mockReturnValue(undefined);
    mockListProviders.mockResolvedValue([]);
    mockLegacyGet.mockResolvedValue([]);

    await migrateProviders();

    expect(mockServiceSet).toHaveBeenCalledWith('migration.providersImported', true);
    expect(mockCreateProvider).not.toHaveBeenCalled();
  });

  it('sets flag and returns when model.config is null', async () => {
    mockServiceGet.mockReturnValue(undefined);
    mockListProviders.mockResolvedValue([]);
    mockLegacyGet.mockResolvedValue(null);

    await migrateProviders();

    expect(mockServiceSet).toHaveBeenCalledWith('migration.providersImported', true);
    expect(mockCreateProvider).not.toHaveBeenCalled();
  });

  it('transforms camelCase fields to snake_case for backend API', async () => {
    mockServiceGet.mockReturnValue(undefined);
    mockListProviders.mockResolvedValue([]);
    mockLegacyGet.mockResolvedValue([
      {
        id: 'p1',
        platform: 'openai',
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com',
        apiKey: 'sk-test',
        model: ['gpt-4', 'gpt-3.5-turbo'],
        enabled: true,
        contextLimit: 128000,
        modelProtocols: { 'gpt-4': 'openai' },
        modelEnabled: { 'gpt-4': true },
        modelHealth: {
          'gpt-4': { status: 'healthy', lastCheck: 1700000000, latency: 200 },
        },
      },
    ]);
    mockCreateProvider.mockResolvedValue({});

    await migrateProviders();

    expect(mockCreateProvider).toHaveBeenCalledTimes(1);
    const req = mockCreateProvider.mock.calls[0][0];
    expect(req.base_url).toBe('https://api.openai.com');
    expect(req.api_key).toBe('sk-test');
    expect(req.models).toEqual(['gpt-4', 'gpt-3.5-turbo']);
    expect(req.context_limit).toBe(128000);
    expect(req.model_protocols).toEqual({ 'gpt-4': 'openai' });
    expect(req.model_enabled).toEqual({ 'gpt-4': true });
    expect(req.model_health['gpt-4'].last_check).toBe(1700000000);
    expect(req.model_health['gpt-4'].latency).toBe(200);
    expect(req.model_health['gpt-4']).not.toHaveProperty('lastCheck');
    expect(req).not.toHaveProperty('model');
    expect(req).not.toHaveProperty('baseUrl');
    expect(req).not.toHaveProperty('apiKey');
  });

  it('transforms bedrockConfig fields to snake_case', async () => {
    mockServiceGet.mockReturnValue(undefined);
    mockListProviders.mockResolvedValue([]);
    mockLegacyGet.mockResolvedValue([
      {
        id: 'p1',
        platform: 'bedrock',
        name: 'AWS',
        baseUrl: '',
        apiKey: '',
        model: ['claude-sonnet-4-20250514'],
        bedrockConfig: {
          authMethod: 'accessKey',
          region: 'us-west-2',
          accessKeyId: 'AKIA...',
          secretAccessKey: 'secret...',
        },
      },
    ]);
    mockCreateProvider.mockResolvedValue({});

    await migrateProviders();

    const req = mockCreateProvider.mock.calls[0][0];
    expect(req.bedrock_config).toEqual({
      auth_method: 'accessKey',
      region: 'us-west-2',
      access_key_id: 'AKIA...',
      secret_access_key: 'secret...',
      profile: undefined,
    });
  });

  it('continues migration when a single create fails', async () => {
    mockServiceGet.mockReturnValue(undefined);
    mockListProviders.mockResolvedValue([]);
    mockLegacyGet.mockResolvedValue([
      {
        id: 'p1',
        platform: 'openai',
        name: 'First',
        baseUrl: 'https://api.openai.com',
        apiKey: 'sk-1',
        model: ['gpt-4'],
      },
      {
        id: 'p2',
        platform: 'anthropic',
        name: 'Second',
        baseUrl: 'https://api.anthropic.com',
        apiKey: 'sk-2',
        model: ['claude-sonnet-4-20250514'],
      },
    ]);
    mockCreateProvider.mockRejectedValueOnce(new Error('conflict')).mockResolvedValueOnce({});

    await migrateProviders();

    expect(mockCreateProvider).toHaveBeenCalledTimes(2);
    expect(mockServiceSet).toHaveBeenCalledWith('migration.providersImported', true);
  });

  it('defaults enabled to true when omitted', async () => {
    mockServiceGet.mockReturnValue(undefined);
    mockListProviders.mockResolvedValue([]);
    mockLegacyGet.mockResolvedValue([
      {
        id: 'p1',
        platform: 'openai',
        name: 'Test',
        baseUrl: 'https://api.example.com',
        apiKey: 'sk-test',
        model: ['gpt-4'],
      },
    ]);
    mockCreateProvider.mockResolvedValue({});

    await migrateProviders();

    const req = mockCreateProvider.mock.calls[0][0];
    expect(req.enabled).toBe(true);
  });

  it('migrates multiple providers', async () => {
    mockServiceGet.mockReturnValue(undefined);
    mockListProviders.mockResolvedValue([]);
    mockLegacyGet.mockResolvedValue([
      {
        id: 'p1',
        platform: 'openai',
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com',
        apiKey: 'sk-1',
        model: ['gpt-4'],
        enabled: true,
        capabilities: ['vision'],
        contextLimit: 128000,
      },
      {
        id: 'p2',
        platform: 'bedrock',
        name: 'AWS',
        baseUrl: '',
        apiKey: '',
        model: ['claude-sonnet-4-20250514'],
        bedrockConfig: {
          authMethod: 'profile',
          region: 'us-east-1',
          profile: 'default',
        },
      },
    ]);
    mockCreateProvider.mockResolvedValue({});

    await migrateProviders();

    expect(mockCreateProvider).toHaveBeenCalledTimes(2);

    const req1 = mockCreateProvider.mock.calls[0][0];
    expect(req1.capabilities).toEqual(['vision']);
    expect(req1.context_limit).toBe(128000);

    const req2 = mockCreateProvider.mock.calls[1][0];
    expect(req2.bedrock_config).toEqual({
      auth_method: 'profile',
      region: 'us-east-1',
      access_key_id: undefined,
      secret_access_key: undefined,
      profile: 'default',
    });
  });

  it('is idempotent — second call is a no-op when flag is set', async () => {
    mockServiceGet.mockReturnValueOnce(undefined).mockReturnValueOnce(true);
    mockListProviders.mockResolvedValue([]);
    mockLegacyGet.mockResolvedValue([
      {
        id: 'p1',
        platform: 'openai',
        name: 'Test',
        baseUrl: 'https://api.example.com',
        apiKey: 'sk-test',
        model: ['gpt-4'],
      },
    ]);
    mockCreateProvider.mockResolvedValue({});

    await migrateProviders();
    expect(mockCreateProvider).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    mockServiceGet.mockReturnValue(true);

    await migrateProviders();
    expect(mockCreateProvider).not.toHaveBeenCalled();
    expect(mockListProviders).not.toHaveBeenCalled();
  });
});
