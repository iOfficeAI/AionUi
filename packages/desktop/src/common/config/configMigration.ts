import { ipcBridge } from '@/common';
import { httpRequest } from '@/common/adapter/httpBridge';
import type { CreateProviderRequest } from '@/common/types/provider/providerApi';

import type { ConfigKey, ConfigKeyMap } from './configKeys';
import type { IConfigStorageRefer, IMcpServer } from './storage';
import { BUILTIN_IMAGE_GEN_ID, BUILTIN_IMAGE_GEN_LEGACY_NAMES, BUILTIN_IMAGE_GEN_NAME } from './storage';

export type ConfigFile = {
  get<K extends keyof IConfigStorageRefer>(key: K): Promise<IConfigStorageRefer[K]>;
  set<K extends keyof IConfigStorageRefer>(key: K, value: IConfigStorageRefer[K]): Promise<unknown>;
};

const LEGACY_MCP_CONFIG_KEY = 'mcp.config' as const;

type LegacyMcpConfigFile = ConfigFile & {
  get(key: typeof LEGACY_MCP_CONFIG_KEY): Promise<unknown>;
  set(key: typeof LEGACY_MCP_CONFIG_KEY, value: unknown): Promise<unknown>;
};

const ALL_LEGACY_KEYS: ConfigKey[] = [
  'codex.config',
  'acp.config',
  'acp.promptTimeout',
  'acp.agentIdleTimeout',
  'acp.cachedInitializeResult',
  'acp.cached_config_options',
  'acp.cachedModes',
  'language',
  'theme',
  'colorScheme',
  'ui.zoomFactor',
  'webui.desktop.enabled',
  'webui.desktop.allowRemote',
  'webui.desktop.port',
  'customCss',
  'css.themes',
  'css.activeThemeId',
  'aionrs.config',
  'aionrs.defaultModel',
  'tools.imageGenerationModel',
  'tools.speechToText',
  'workspace.pasteConfirm',
  'upload.saveToWorkspace',
  'guid.lastSelectedAgent',
  'skillsMarket.enabled',
  'pet.enabled',
  'pet.size',
  'pet.dnd',
  'pet.confirmEnabled',
  'system.closeToTray',
  'system.notificationEnabled',
  'system.cronNotificationEnabled',
  'system.keepAwake',
  'system.autoPreviewOfficeFiles',
  'assistant.telegram.defaultModel',
  'assistant.telegram.agent',
  'assistant.lark.defaultModel',
  'assistant.lark.agent',
  'assistant.dingtalk.defaultModel',
  'assistant.dingtalk.agent',
  'assistant.weixin.defaultModel',
  'assistant.weixin.agent',
  'assistant.wecom.defaultModel',
  'assistant.wecom.agent',
];

export async function migrateConfigStorage(configFile: ConfigFile): Promise<void> {
  const entries: Record<string, unknown> = {};

  const legacyEntries = await Promise.all(
    ALL_LEGACY_KEYS.map(async (key) => {
      try {
        const value = await configFile.get(key as keyof IConfigStorageRefer);
        return [key, value] as const;
      } catch {
        return [key, undefined] as const;
      }
    })
  );

  for (const [key, value] of legacyEntries) {
    if (value !== undefined && value !== null) {
      entries[key] = value;
    }
  }

  if (Object.keys(entries).length === 0) {
    console.info('[Migration] configStorage migration skipped — no legacy keys found');
    return;
  }

  // Merge strategy: only write keys that don't already exist in the backend DB.
  // This prevents overwriting user's runtime changes on repeated migrations.
  const existing = await fetchExistingClientKeys();
  const newEntries: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entries)) {
    if (!(key in existing)) {
      newEntries[key] = value;
    }
  }

  if (Object.keys(newEntries).length > 0) {
    await setBackendClientPreferences(newEntries);
    console.info(
      '[Migration] configStorage migration completed, migrated %d/%d keys (skipped %d existing)',
      Object.keys(newEntries).length,
      Object.keys(entries).length,
      Object.keys(entries).length - Object.keys(newEntries).length
    );
  } else {
    console.info(
      '[Migration] configStorage migration skipped — all %d keys already exist in backend',
      Object.keys(entries).length
    );
  }
}

export async function migrateLegacyMcpConfigToDb(configFile: ConfigFile): Promise<void> {
  const legacyConfigFile = configFile as LegacyMcpConfigFile;
  const backendPrefs = await fetchExistingClientKeys();
  const backendLegacy = backendPrefs[LEGACY_MCP_CONFIG_KEY];
  const fileLegacy = await legacyConfigFile.get(LEGACY_MCP_CONFIG_KEY).catch((): undefined => undefined);
  const legacyServers = Array.isArray(backendLegacy) ? backendLegacy : Array.isArray(fileLegacy) ? fileLegacy : [];

  if (legacyServers.length === 0) {
    console.info('[Migration] legacy MCP migration skipped — no legacy servers found');
    return;
  }

  const existing = await ipcBridge.mcpService.listServers.invoke();
  const existingNames = new Set((existing ?? []).map((server) => server.name));
  const importableServers = legacyServers.filter(isImportableMcpServer).map(normalizeLegacyMcpServer);
  const missing = importableServers.filter((server) => !existingNames.has(server.name));

  console.info(
    '[Migration] legacy MCP migration found %d servers, importing %d missing, skipping %d existing',
    legacyServers.length,
    missing.length,
    legacyServers.length - missing.length
  );

  if (missing.length > 0) {
    await ipcBridge.mcpService.batchImportServers.invoke({ servers: missing });
  }

  await setBackendClientPreferences({ [LEGACY_MCP_CONFIG_KEY]: null });
  await legacyConfigFile.set(LEGACY_MCP_CONFIG_KEY, []);
}

function isImportableMcpServer(
  server: unknown
): server is Partial<IMcpServer> & Pick<IMcpServer, 'name' | 'transport'> {
  if (!server || typeof server !== 'object') return false;
  const candidate = server as Partial<IMcpServer>;
  return typeof candidate.name === 'string' && candidate.name.length > 0 && Boolean(candidate.transport);
}

function normalizeLegacyMcpServer(
  server: Partial<IMcpServer> & Pick<IMcpServer, 'name' | 'transport'>
): Partial<IMcpServer> & Pick<IMcpServer, 'name' | 'transport'> {
  const isLegacyImageGen =
    server.builtin === true &&
    (server.id === BUILTIN_IMAGE_GEN_ID ||
      server.name === BUILTIN_IMAGE_GEN_NAME ||
      BUILTIN_IMAGE_GEN_LEGACY_NAMES.includes(server.name as (typeof BUILTIN_IMAGE_GEN_LEGACY_NAMES)[number]));

  if (!isLegacyImageGen) return server;

  return {
    ...server,
    name: BUILTIN_IMAGE_GEN_NAME,
    builtin: true,
  };
}

// ---------------------------------------------------------------------------
// Provider migration — reads legacy `model.config` from local config file
// and writes each entry to the backend via `POST /api/providers`.
// ---------------------------------------------------------------------------

type LegacyModelHealth = Record<
  string,
  {
    status: 'unknown' | 'healthy' | 'unhealthy';
    lastCheck?: number;
    latency?: number;
    error?: string;
  }
>;

type LegacyBedrockConfig = {
  authMethod: 'accessKey' | 'profile';
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  profile?: string;
};

type LegacyProvider = {
  id: string;
  platform: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string[];
  enabled?: boolean;
  capabilities?: CreateProviderRequest['capabilities'];
  contextLimit?: number;
  modelProtocols?: Record<string, string>;
  modelEnabled?: Record<string, boolean>;
  modelHealth?: LegacyModelHealth;
  bedrockConfig?: LegacyBedrockConfig;
};

function transformModelHealth(health: LegacyModelHealth): CreateProviderRequest['model_health'] {
  const result: NonNullable<CreateProviderRequest['model_health']> = {};
  for (const [key, value] of Object.entries(health)) {
    result[key] = {
      status: value.status,
      last_check: value.lastCheck,
      latency: value.latency,
      error: value.error,
    };
  }
  return result;
}

/**
 * Local config file key that records "the legacy → backend provider migration
 * has already completed once on this machine". Once set, {@link migrateProviders}
 * is a no-op for the remaining lifetime of this install — even if the user
 * later deletes a provider through the UI (the deletion goes to the backend
 * DB; the legacy `model.config` on disk is left intact for downgrade safety
 * and must NOT be replayed). See ELECTRON-1KT.
 */
const PROVIDERS_MIGRATION_FLAG = 'migration.providersMigrated_v1' as const;

export async function migrateProviders(configFile: ConfigFile): Promise<void> {
  // Idempotency guard: once the flag is set, never replay legacy providers.
  // Without this, deletions made by the user post-migration would be silently
  // undone on every launch as the legacy `model.config` is still on disk
  // (kept on purpose so the user can downgrade to a pre-backend Electron build).
  let alreadyMigrated = false;
  try {
    alreadyMigrated = Boolean(await configFile.get(PROVIDERS_MIGRATION_FLAG));
  } catch {
    // Flag missing or read failed — proceed as if first run; we'll set the
    // flag at the end of a successful pass.
  }
  if (alreadyMigrated) {
    console.info('[Migration] providers migration skipped — completion flag already set');
    return;
  }

  let legacyProviders: LegacyProvider[];
  try {
    legacyProviders = (await configFile.get(
      'model.config' as keyof IConfigStorageRefer
    )) as unknown as LegacyProvider[];
  } catch (err) {
    console.info('[Migration] providers migration skipped — no model.config in config file', err);
    // Nothing to migrate ever again on this machine — flag it so future launches
    // skip the read entirely and we don't risk a stray legacy file appearing later
    // (e.g. via a settings restore from backup) re-injecting deleted providers.
    await markProvidersMigrationDone(configFile);
    return;
  }

  if (!legacyProviders || !Array.isArray(legacyProviders) || legacyProviders.length === 0) {
    console.info('[Migration] providers migration skipped — model.config is empty or invalid');
    await markProvidersMigrationDone(configFile);
    return;
  }

  const existing = await ipcBridge.mode.listProviders.invoke();
  const existingIds = new Set((existing ?? []).map((p: { id: string }) => p.id));

  const newProviders = legacyProviders.filter((p) => !existingIds.has(p.id));
  if (newProviders.length === 0) {
    console.info(
      '[Migration] providers migration skipped — all %d legacy providers already exist in backend',
      legacyProviders.length
    );
    // Backend already has every legacy id — migration is effectively done.
    await markProvidersMigrationDone(configFile);
    return;
  }

  console.info(
    '[Migration] found %d new legacy providers to migrate (skipping %d existing)',
    newProviders.length,
    legacyProviders.length - newProviders.length
  );

  const requests = newProviders.map((legacy) => ({
    legacy,
    req: {
      id: legacy.id,
      platform: legacy.platform,
      name: legacy.name,
      base_url: legacy.baseUrl,
      api_key: legacy.apiKey,
      models: legacy.model,
      enabled: legacy.enabled ?? true,
      capabilities: legacy.capabilities,
      context_limit: legacy.contextLimit,
      model_protocols: legacy.modelProtocols,
      model_enabled: legacy.modelEnabled,
      model_health: legacy.modelHealth ? transformModelHealth(legacy.modelHealth) : undefined,
      bedrock_config: legacy.bedrockConfig
        ? {
            auth_method: legacy.bedrockConfig.authMethod,
            region: legacy.bedrockConfig.region,
            access_key_id: legacy.bedrockConfig.accessKeyId,
            secret_access_key: legacy.bedrockConfig.secretAccessKey,
            profile: legacy.bedrockConfig.profile,
          }
        : undefined,
    } satisfies CreateProviderRequest,
  }));

  const results = await Promise.allSettled(requests.map(({ req }) => ipcBridge.mode.createProvider.invoke(req)));
  let migrated = 0;
  let failed = 0;
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      migrated += 1;
      return;
    }
    failed += 1;
    console.warn('[Migration] failed to create provider %s:', requests[index].legacy.id, result.reason);
  });

  console.info('[Migration] providers migration completed, migrated %d/%d providers', migrated, newProviders.length);

  // Only set the completion flag on a fully clean pass. A partial failure
  // (e.g. backend returned 5xx for one provider) leaves the flag unset so the
  // next launch retries just the still-missing rows; that retry is safe
  // because the existing-by-id filter above already skips any provider the
  // backend has accepted in the meantime.
  if (failed === 0) {
    await markProvidersMigrationDone(configFile);
  }
}

async function markProvidersMigrationDone(configFile: ConfigFile): Promise<void> {
  try {
    await configFile.set(PROVIDERS_MIGRATION_FLAG, true);
  } catch (err) {
    // Failure to persist the flag is non-fatal — worst case the migration
    // re-runs next launch and the existing-by-id filter makes it a no-op.
    console.warn('[Migration] failed to persist providers migration flag', err);
  }
}

type BackendClientPreferences = Partial<{ [K in ConfigKey]: ConfigKeyMap[K] | null }> & Record<string, unknown>;

async function fetchExistingClientKeys(): Promise<Record<string, unknown>> {
  try {
    return (await httpRequest<Record<string, unknown>>('GET', '/api/settings/client')) || {};
  } catch {
    return {};
  }
}

async function setBackendClientPreferences(entries: BackendClientPreferences): Promise<void> {
  await httpRequest<void>('PUT', '/api/settings/client', entries);
}
