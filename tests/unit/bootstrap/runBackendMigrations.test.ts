import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IMAGE_GEN_ENV_KEYS } from '@/common/config/imageGenerationMcpEnv';
import { BUILTIN_BROWSER_MCP_NAME } from '@/common/config/constants';
import { BUILTIN_IMAGE_GEN_NAME, type IMcpServer, type IProvider } from '@/common/config/storage';
import { resolveImageGenerationMigrationConfig, runBackendMigrations } from '@/process/utils/runBackendMigrations';

const {
  batchImportServersMock,
  configFileGetMock,
  configFileSetMock,
  deleteServerMock,
  httpRequestMock,
  listServersMock,
  testMcpConnectionMock,
  updateServerMock,
} = vi.hoisted(() => ({
  batchImportServersMock: vi.fn(),
  configFileGetMock: vi.fn(),
  configFileSetMock: vi.fn(),
  deleteServerMock: vi.fn(),
  httpRequestMock: vi.fn(),
  listServersMock: vi.fn(),
  testMcpConnectionMock: vi.fn(),
  updateServerMock: vi.fn(),
}));

vi.mock('@/common/adapter/httpBridge', () => ({
  httpRequest: httpRequestMock,
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  mcpService: {
    listServers: { invoke: listServersMock },
    batchImportServers: { invoke: batchImportServersMock },
    deleteServer: { invoke: deleteServerMock },
    updateServer: { invoke: updateServerMock },
    testMcpConnection: { invoke: testMcpConnectionMock },
  },
}));

vi.mock('@/common/config/configMigration', () => ({
  migrateConfigStorage: vi.fn().mockResolvedValue(undefined),
  migrateLegacyMcpConfigToDb: vi.fn().mockResolvedValue(undefined),
  migrateProviders: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/process/utils/initStorage', () => ({
  getBuiltinMcpScriptPath: (name: string) => `/mock/${name}.js`,
}));

vi.mock('@/process/utils/migrateAssistants', () => ({
  migrateAssistantsToBackend: vi.fn().mockResolvedValue(true),
}));

const provider: IProvider = {
  id: 'provider-1',
  platform: 'gemini',
  name: 'Gemini',
  base_url: 'https://generativelanguage.googleapis.com',
  api_key: 'provider-key',
  models: ['gemini-image'],
  enabled: true,
};

const imageEnv = {
  [IMAGE_GEN_ENV_KEYS.providerId]: 'provider-1',
  [IMAGE_GEN_ENV_KEYS.platform]: 'gemini',
  [IMAGE_GEN_ENV_KEYS.baseUrl]: 'https://generativelanguage.googleapis.com',
  [IMAGE_GEN_ENV_KEYS.apiKey]: 'provider-key',
  [IMAGE_GEN_ENV_KEYS.model]: 'gemini-image',
};

const imageServer = (): IMcpServer => ({
  id: 'image-server-id',
  name: BUILTIN_IMAGE_GEN_NAME,
  description: 'Built-in image generation tool powered by AI models. Configure the model in Settings > Tools.',
  enabled: true,
  builtin: true,
  transport: {
    type: 'stdio',
    command: 'node',
    args: ['/mock/builtin-mcp-image-gen.js'],
    env: imageEnv,
  },
  created_at: 1,
  updated_at: 1,
  original_json: JSON.stringify(
    {
      mcpServers: {
        [BUILTIN_IMAGE_GEN_NAME]: {
          command: 'node',
          args: ['/mock/builtin-mcp-image-gen.js'],
          env: imageEnv,
        },
      },
    },
    null,
    2
  ),
});

const configFile = {
  get: configFileGetMock,
  set: configFileSetMock,
};

beforeEach(() => {
  vi.clearAllMocks();
  configFileGetMock.mockResolvedValue(undefined);
  configFileSetMock.mockResolvedValue(undefined);
  batchImportServersMock.mockResolvedValue([]);
  deleteServerMock.mockResolvedValue(undefined);
  updateServerMock.mockImplementation(async ({ id, data }) => ({
    ...imageServer(),
    id,
    ...data,
  }));
  testMcpConnectionMock.mockResolvedValue({ success: false, error: 'Command not found: npx' });
  httpRequestMock.mockImplementation(async (method: string, path: string) => {
    if (method === 'GET' && path === '/api/settings/client') {
      return {
        'tools.imageGenerationModel': {
          id: 'provider-1',
          name: 'Gemini',
          platform: 'gemini',
          use_model: 'gemini-image',
        },
      };
    }
    if (method === 'GET' && path === '/api/providers') {
      return [provider];
    }
    return undefined;
  });
});

describe('resolveImageGenerationMigrationConfig', () => {
  it('uses backend client preference when local config file no longer has the image model', () => {
    const backendConfig = {
      id: 'gemini',
      name: 'Gemini',
      platform: 'gemini',
      base_url: 'https://example.test',
      api_key: 'backend-key',
      use_model: 'gemini-image',
    };

    expect(resolveImageGenerationMigrationConfig({ 'tools.imageGenerationModel': backendConfig }, undefined)).toEqual(
      backendConfig
    );
  });
});

describe('runBackendMigrations', () => {
  it('removes the redundant generic chrome-devtools server created by older releases', async () => {
    listServersMock.mockResolvedValue([
      {
        id: 'builtin-chrome-id',
        name: 'chrome-devtools',
        description: 'Default MCP server: chrome-devtools',
        enabled: false,
        builtin: true,
        transport: { type: 'stdio', command: 'npx', args: ['-y', 'chrome-devtools-mcp@latest'] },
        created_at: 1,
        updated_at: 1,
        original_json: '{}',
      },
    ]);

    await runBackendMigrations(configFile as never);

    expect(deleteServerMock).toHaveBeenCalledWith({ id: 'builtin-chrome-id' });
    expect(batchImportServersMock).toHaveBeenCalledWith({
      servers: expect.not.arrayContaining([expect.objectContaining({ name: 'chrome-devtools' })]),
    });
  });

  it('preserves a customized chrome-devtools server even if an older release marked it built-in', async () => {
    listServersMock.mockResolvedValue([
      {
        id: 'custom-chrome-id',
        name: 'chrome-devtools',
        description: 'My external Chrome',
        enabled: true,
        builtin: true,
        transport: { type: 'stdio', command: 'custom-command', args: [] },
        created_at: 1,
        updated_at: 1,
        original_json: '{}',
      },
    ]);

    await runBackendMigrations(configFile as never);

    expect(deleteServerMock).not.toHaveBeenCalledWith({ id: 'custom-chrome-id' });
    expect(updateServerMock).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'custom-chrome-id' }));
  });

  it('renames the legacy built-in browser server without importing a duplicate', async () => {
    listServersMock.mockResolvedValue([
      {
        id: 'legacy-browser-id',
        name: 'aionui-browser',
        description: 'Legacy browser',
        enabled: false,
        builtin: true,
        transport: { type: 'stdio', command: 'node', args: ['/old/browser.js'] },
        created_at: 1,
        updated_at: 1,
        original_json: '{}',
      },
    ]);
    updateServerMock.mockImplementation(async ({ id, data }) => ({
      id,
      enabled: false,
      created_at: 1,
      updated_at: 1,
      ...data,
    }));

    await runBackendMigrations(configFile as never);

    expect(updateServerMock).toHaveBeenCalledWith({
      id: 'legacy-browser-id',
      data: expect.objectContaining({ name: BUILTIN_BROWSER_MCP_NAME }),
    });
    expect(batchImportServersMock).toHaveBeenCalledWith({
      servers: expect.not.arrayContaining([expect.objectContaining({ name: BUILTIN_BROWSER_MCP_NAME })]),
    });
    expect(deleteServerMock).not.toHaveBeenCalled();
  });

  it('removes a legacy built-in browser record when the renamed server already exists', async () => {
    listServersMock.mockResolvedValue([
      {
        id: 'current-browser-id',
        name: BUILTIN_BROWSER_MCP_NAME,
        description: 'Current browser',
        enabled: true,
        builtin: true,
        transport: { type: 'stdio', command: 'node', args: ['/mock/builtin-mcp-browser.js'] },
        created_at: 1,
        updated_at: 1,
        original_json: JSON.stringify(
          {
            mcpServers: {
              [BUILTIN_BROWSER_MCP_NAME]: {
                command: 'node',
                args: ['/mock/builtin-mcp-browser.js'],
              },
            },
          },
          null,
          2
        ),
      },
      {
        id: 'legacy-browser-id',
        name: 'aionui-browser',
        description: 'Legacy browser',
        enabled: true,
        builtin: true,
        transport: { type: 'stdio', command: 'node', args: ['/old/browser.js'] },
        created_at: 1,
        updated_at: 1,
        original_json: '{}',
      },
    ]);

    await runBackendMigrations(configFile as never);

    expect(deleteServerMock).toHaveBeenCalledWith({ id: 'legacy-browser-id' });
  });

  it('does not write image generation business config back to local config storage', async () => {
    listServersMock.mockResolvedValue([imageServer()]);
    configFileGetMock.mockImplementation(async (key: string) => {
      if (key === 'tools.imageGenerationModel') {
        return {
          id: 'provider-1',
          name: 'Gemini',
          platform: 'gemini',
          use_model: 'gemini-image',
          switch: true,
        };
      }
      return undefined;
    });
    httpRequestMock.mockImplementation(async (method: string, path: string) => {
      if (method === 'GET' && path === '/api/settings/client') {
        return {};
      }
      if (method === 'GET' && path === '/api/providers') {
        return [provider];
      }
      return undefined;
    });

    await runBackendMigrations(configFile as never);

    expect(configFileSetMock).not.toHaveBeenCalledWith('tools.imageGenerationModel', expect.anything());
  });

  it('does not sync the built-in image MCP server when bootstrap makes no effective change', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    listServersMock.mockResolvedValue([imageServer()]);

    await runBackendMigrations(configFile as never);

    expect(updateServerMock).not.toHaveBeenCalled();
    expect(testMcpConnectionMock).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(
      '[Migration] image MCP bootstrap decision, server id: %s, transport changed: %s, json changed: %s, will update: %s',
      'image-server-id',
      'no',
      'no',
      'no'
    );
  });

  it('does not sync agents when only the stored image MCP JSON representation differs', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    listServersMock.mockResolvedValue([
      {
        ...imageServer(),
        original_json: '{"legacy":true}',
      },
    ]);

    await runBackendMigrations(configFile as never);

    expect(updateServerMock).toHaveBeenCalledOnce();
    expect(testMcpConnectionMock).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(
      '[Migration] image MCP bootstrap decision, server id: %s, transport changed: %s, json changed: %s, will update: %s',
      'image-server-id',
      'no',
      'yes',
      'yes'
    );
  });
});
