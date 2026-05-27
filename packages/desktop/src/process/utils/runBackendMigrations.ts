/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { migrateConfigStorage, migrateLegacyMcpConfigToDb, migrateProviders } from '@/common/config/configMigration';
import { httpRequest } from '@/common/adapter/httpBridge';
import { mcpService } from '@/common/adapter/ipcBridge';
import type { ConfigKeyMap } from '@/common/config/configKeys';
import { BUILTIN_IMAGE_GEN_NAME, type IMcpServer } from '@/common/config/storage';
import { getBuiltinMcpScriptPath, type ProcessConfig as ProcessConfigType } from './initStorage';
import { migrateAssistantsToBackend } from './migrateAssistants';

type ConfigFile = typeof ProcessConfigType;
type MigrationStepResult = boolean;
type McpImportServer = Partial<IMcpServer> & Pick<IMcpServer, 'name' | 'transport'>;
type BackendClientPreferences = Record<string, unknown>;

const LEGACY_BACKEND_CLIENT_PREFERENCE_KEYS = [
  'assistants',
  'migration.assistantEnabledFixed',
  'migration.coworkDefaultSkillsAdded',
  'migration.builtinDefaultSkillsAdded_v2',
  'migration.promptsI18nAdded',
  'migration.assistantsSplitCustom',
] as const;

async function cleanupLegacyClientPreferences(): Promise<void> {
  const payloadEntries = LEGACY_BACKEND_CLIENT_PREFERENCE_KEYS.map((key): [string, null] => [key, null]);
  const payload = Object.fromEntries(payloadEntries);
  await httpRequest<void>('PUT', '/api/settings/client', payload);
}

const CLEANUP_STEPS: Array<{
  name: string;
  run: () => Promise<void>;
}> = [{ name: 'cleanupLegacyClientPreferences', run: async () => cleanupLegacyClientPreferences() }];

async function fetchBackendClientPreferences(): Promise<BackendClientPreferences> {
  try {
    return (await httpRequest<BackendClientPreferences>('GET', '/api/settings/client')) || {};
  } catch {
    return {};
  }
}

export function resolveImageGenerationMigrationConfig(
  backendPrefs: BackendClientPreferences,
  fileConfig?: ConfigKeyMap['tools.imageGenerationModel']
): ConfigKeyMap['tools.imageGenerationModel'] | undefined {
  const backendConfig = backendPrefs['tools.imageGenerationModel'];
  if (backendConfig && typeof backendConfig === 'object') {
    return backendConfig as ConfigKeyMap['tools.imageGenerationModel'];
  }
  return fileConfig;
}

function resolveImageGenerationMigrationConfigSource(
  backendPrefs: BackendClientPreferences,
  fileConfig?: ConfigKeyMap['tools.imageGenerationModel']
): 'backend' | 'file' | 'none' {
  const backendConfig = backendPrefs['tools.imageGenerationModel'];
  if (backendConfig && typeof backendConfig === 'object') {
    return 'backend';
  }
  return fileConfig ? 'file' : 'none';
}

function buildImageGenerationEnv(config?: ConfigKeyMap['tools.imageGenerationModel']): Record<string, string> {
  if (!config) return {};
  const env: Record<string, string> = {};
  if (config.platform) env.AIONUI_IMG_PLATFORM = config.platform;
  if (config.base_url) env.AIONUI_IMG_BASE_URL = config.base_url;
  if (config.api_key) env.AIONUI_IMG_API_KEY = config.api_key;
  if (config.use_model) env.AIONUI_IMG_MODEL = config.use_model;
  return env;
}

function buildBuiltinImageGenerationServer(config?: ConfigKeyMap['tools.imageGenerationModel']): McpImportServer {
  const scriptPath = getBuiltinMcpScriptPath('builtin-mcp-image-gen');
  const env = buildImageGenerationEnv(config);
  const serverConfig = {
    command: 'node',
    args: [scriptPath],
    env,
  };

  return {
    name: BUILTIN_IMAGE_GEN_NAME,
    description: 'Built-in image generation tool powered by AI models. Configure the model in Settings > Tools.',
    enabled: config?.switch === true,
    builtin: true,
    transport: {
      type: 'stdio',
      command: 'node',
      args: [scriptPath],
      env,
    },
    original_json: JSON.stringify({ mcpServers: { [BUILTIN_IMAGE_GEN_NAME]: serverConfig } }, null, 2),
  };
}

function buildDefaultMcpServers(): McpImportServer[] {
  const chromeConfig = {
    command: 'npx',
    args: ['-y', 'chrome-devtools-mcp@latest'],
  };

  return [
    {
      name: 'chrome-devtools',
      description: 'Default MCP server: chrome-devtools',
      enabled: false,
      transport: {
        type: 'stdio',
        command: chromeConfig.command,
        args: chromeConfig.args,
      },
      original_json: JSON.stringify({ mcpServers: { 'chrome-devtools': chromeConfig } }, null, 2),
    },
  ];
}

async function ensureBootstrapMcpServersInDb(configFile: ConfigFile): Promise<void> {
  const [backendPrefs, fileImageConfig] = await Promise.all([
    fetchBackendClientPreferences(),
    configFile.get('tools.imageGenerationModel').catch((): undefined => undefined),
  ]);
  const imageConfig = resolveImageGenerationMigrationConfig(backendPrefs, fileImageConfig);
  const imageConfigSource = resolveImageGenerationMigrationConfigSource(backendPrefs, fileImageConfig);
  const existing = await mcpService.listServers.invoke();
  const existingByName = new Map((existing ?? []).map((server) => [server.name, server]));
  const imageServer = buildBuiltinImageGenerationServer(imageConfig);
  const defaultServers = buildDefaultMcpServers();
  const missing = [...defaultServers, imageServer].filter((server) => !existingByName.has(server.name));
  let imageServerToSync: IMcpServer | undefined;

  if (missing.length > 0) {
    const imported = await mcpService.batchImportServers.invoke({ servers: missing });
    imageServerToSync = imported.find((server) => server.name === BUILTIN_IMAGE_GEN_NAME && server.enabled);
  }

  const existingImageServer = existingByName.get(BUILTIN_IMAGE_GEN_NAME);
  if (existingImageServer && existingImageServer.transport.type === 'stdio' && imageServer.transport.type === 'stdio') {
    const updatedImageServer = await mcpService.updateServer.invoke({
      id: existingImageServer.id,
      data: {
        transport: imageServer.transport,
        original_json: imageServer.original_json,
      },
    });
    if (updatedImageServer.enabled) {
      imageServerToSync = updatedImageServer;
    }
  }

  if (imageServerToSync) {
    await mcpService.syncMcpToAgents.invoke({ servers: [imageServerToSync.id] });
  }

  if (imageConfig?.switch === true) {
    const { switch: _switch, ...rest } = imageConfig;
    await configFile.set('tools.imageGenerationModel', rest as ConfigKeyMap['tools.imageGenerationModel']);
  }

  console.info(
    '[Migration] MCP bootstrap completed, imported %d missing defaults, updated image server: %s, image config source: %s, image enabled: %s, synced image server: %s',
    missing.length,
    existingImageServer ? 'yes' : 'no',
    imageConfigSource,
    imageConfig?.switch === true ? 'yes' : 'no',
    imageServerToSync ? 'yes' : 'no'
  );
}

const MIGRATION_STEPS: Array<{
  name: string;
  run: (configFile: ConfigFile) => Promise<MigrationStepResult>;
}> = [
  {
    name: 'migrateLegacyMcpConfigToDb',
    run: async (configFile) => (await migrateLegacyMcpConfigToDb(configFile), true),
  },
  {
    name: 'ensureBootstrapMcpServersInDb',
    run: async (configFile) => (await ensureBootstrapMcpServersInDb(configFile), true),
  },
  { name: 'migrateConfigStorage', run: async (configFile) => (await migrateConfigStorage(configFile), true) },
  { name: 'migrateProviders', run: async (configFile) => (await migrateProviders(configFile), true) },
  { name: 'migrateAssistantsToBackend', run: async (configFile) => migrateAssistantsToBackend(configFile) },
];

export async function runBackendMigrations(configFile: ConfigFile): Promise<void> {
  await CLEANUP_STEPS.reduce<Promise<void>>(async (previous, step) => {
    await previous;
    const start = Date.now();
    try {
      await step.run();
      console.info(`[AionUi] Backend migration step completed: ${step.name} (${Date.now() - start}ms)`);
    } catch (error) {
      console.error(`[AionUi] Backend migration step failed: ${step.name} (${Date.now() - start}ms)`, error);
    }
  }, Promise.resolve());

  await MIGRATION_STEPS.reduce<Promise<void>>(async (previous, step) => {
    await previous;
    const start = Date.now();
    try {
      const completed = await step.run(configFile);
      const elapsed = Date.now() - start;
      if (!completed) {
        console.warn(`[AionUi] Backend migration step incomplete: ${step.name} (${elapsed}ms)`);
        return;
      }
      console.info(`[AionUi] Backend migration step completed: ${step.name} (${elapsed}ms)`);
    } catch (error) {
      const elapsed = Date.now() - start;
      console.error(`[AionUi] Backend migration step failed: ${step.name} (${elapsed}ms)`, error);
    }
  }, Promise.resolve());
}
