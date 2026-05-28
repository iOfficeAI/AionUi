/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { migrateConfigStorage, migrateLegacyMcpConfigToDb, migrateProviders } from '@/common/config/configMigration';
import { httpRequest } from '@/common/adapter/httpBridge';
import { mcpService } from '@/common/adapter/ipcBridge';
import type { ConfigKeyMap } from '@/common/config/configKeys';
import {
  removeImageGenerationEnvKeys,
  resolveImageGenerationMcpEnv,
  type ImageGenerationMcpEnvResolveResult,
} from '@/common/config/imageGenerationMcpEnv';
import { BUILTIN_IMAGE_GEN_NAME, type IMcpServer, type IProvider } from '@/common/config/storage';
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

async function fetchProviders(): Promise<IProvider[]> {
  try {
    return (await httpRequest<IProvider[]>('GET', '/api/providers')) || [];
  } catch (error) {
    console.warn('[Migration] MCP bootstrap could not load providers for image generation env resolution', error);
    return [];
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

function logImageGenerationEnvResolution(
  result: ImageGenerationMcpEnvResolveResult,
  context: 'bootstrap' | 'update'
): void {
  if (result.ok === true) {
    console.info(
      '[Migration] image MCP env resolved via %s during %s, provider id: %s, platform: %s, model: %s, api key present: %s',
      result.source,
      context,
      result.provider.id,
      result.provider.platform,
      result.model,
      result.provider.api_key ? 'yes' : 'no'
    );
    return;
  }

  console.warn(
    '[Migration] image MCP env resolution failed during %s, reason: %s, message: %s, candidates: %s',
    context,
    result.reason,
    result.message,
    result.candidates?.join(',') || 'none'
  );
}

function buildBuiltinImageGenerationServer(
  resolution: ImageGenerationMcpEnvResolveResult,
  config?: ConfigKeyMap['tools.imageGenerationModel']
): McpImportServer {
  const scriptPath = getBuiltinMcpScriptPath('builtin-mcp-image-gen');
  const env = resolution.ok ? resolution.env : {};
  const serverConfig = {
    command: 'node',
    args: [scriptPath],
    env,
  };

  return {
    name: BUILTIN_IMAGE_GEN_NAME,
    description: 'Built-in image generation tool powered by AI models. Configure the model in Settings > Tools.',
    enabled: config?.switch === true && resolution.ok,
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

function areStringArraysEqual(left?: string[], right?: string[]): boolean {
  const leftValue = left || [];
  const rightValue = right || [];
  return leftValue.length === rightValue.length && leftValue.every((item, index) => item === rightValue[index]);
}

function areStringRecordsEqual(left?: Record<string, string>, right?: Record<string, string>): boolean {
  const leftValue = left || {};
  const rightValue = right || {};
  const leftKeys = Object.keys(leftValue).sort();
  const rightKeys = Object.keys(rightValue).sort();
  return areStringArraysEqual(leftKeys, rightKeys) && leftKeys.every((key) => leftValue[key] === rightValue[key]);
}

function isSameStdioTransport(left: IMcpServer['transport'], right: IMcpServer['transport']): boolean {
  return (
    left.type === 'stdio' &&
    right.type === 'stdio' &&
    left.command === right.command &&
    areStringArraysEqual(left.args, right.args) &&
    areStringRecordsEqual(left.env, right.env)
  );
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
  const [backendPrefs, fileImageConfig, providers] = await Promise.all([
    fetchBackendClientPreferences(),
    configFile.get('tools.imageGenerationModel').catch((): undefined => undefined),
    fetchProviders(),
  ]);
  const imageConfig = resolveImageGenerationMigrationConfig(backendPrefs, fileImageConfig);
  const imageConfigSource = resolveImageGenerationMigrationConfigSource(backendPrefs, fileImageConfig);
  const existing = await mcpService.listServers.invoke();
  const existingByName = new Map((existing ?? []).map((server) => [server.name, server]));
  const existingImageServer = existingByName.get(BUILTIN_IMAGE_GEN_NAME);
  const existingImageEnv =
    existingImageServer?.transport.type === 'stdio' ? existingImageServer.transport.env : undefined;
  const imageEnvResolution = resolveImageGenerationMcpEnv(imageConfig, providers, existingImageEnv);
  logImageGenerationEnvResolution(imageEnvResolution, 'bootstrap');
  const imageServer = buildBuiltinImageGenerationServer(imageEnvResolution, imageConfig);
  const defaultServers = buildDefaultMcpServers();
  const missing = [...defaultServers, imageServer].filter((server) => !existingByName.has(server.name));
  let imageServerToSync: IMcpServer | undefined;
  let imageServerUpdated = false;

  if (missing.length > 0) {
    const imported = await mcpService.batchImportServers.invoke({ servers: missing });
    imageServerToSync = imported.find((server) => server.name === BUILTIN_IMAGE_GEN_NAME && server.enabled);
  }

  if (
    imageEnvResolution.ok === true &&
    existingImageServer &&
    existingImageServer.transport.type === 'stdio' &&
    imageServer.transport.type === 'stdio'
  ) {
    const mergedEnv = {
      ...removeImageGenerationEnvKeys(existingImageServer.transport.env || {}),
      ...imageEnvResolution.env,
    };
    const updatedTransport = {
      ...imageServer.transport,
      env: mergedEnv,
    };
    const original_json = JSON.stringify(
      {
        mcpServers: {
          [BUILTIN_IMAGE_GEN_NAME]: {
            command: updatedTransport.command,
            args: updatedTransport.args || [],
            env: mergedEnv,
          },
        },
      },
      null,
      2
    );
    const imageTransportChanged = !isSameStdioTransport(existingImageServer.transport, updatedTransport);
    const imageOriginalJsonChanged = existingImageServer.original_json !== original_json;
    const imageServerChanged = imageTransportChanged || imageOriginalJsonChanged;
    const willSyncImageServer = imageTransportChanged && existingImageServer.enabled;
    console.info(
      '[Migration] image MCP bootstrap decision, server id: %s, transport changed: %s, json changed: %s, will update: %s, will sync: %s',
      existingImageServer.id,
      imageTransportChanged ? 'yes' : 'no',
      imageOriginalJsonChanged ? 'yes' : 'no',
      imageServerChanged ? 'yes' : 'no',
      willSyncImageServer ? 'yes' : 'no'
    );
    if (imageServerChanged) {
      const updatedImageServer = await mcpService.updateServer.invoke({
        id: existingImageServer.id,
        data: {
          transport: updatedTransport,
          original_json,
        },
      });
      imageServerUpdated = true;
      if (imageTransportChanged && updatedImageServer.enabled) {
        imageServerToSync = updatedImageServer;
      }
    }
  } else if (existingImageServer && imageEnvResolution.ok === false) {
    console.warn(
      '[Migration] skipped image MCP env update because provider could not be resolved, server id: %s, reason: %s',
      existingImageServer.id,
      imageEnvResolution.reason
    );
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
    imageServerUpdated ? 'yes' : 'no',
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
  { name: 'migrateConfigStorage', run: async (configFile) => (await migrateConfigStorage(configFile), true) },
  { name: 'migrateProviders', run: async (configFile) => (await migrateProviders(configFile), true) },
  {
    name: 'ensureBootstrapMcpServersInDb',
    run: async (configFile) => (await ensureBootstrapMcpServersInDb(configFile), true),
  },
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
