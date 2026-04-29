import { ipcBridge } from '@/common';
import { httpRequest } from '@/common/adapter/httpBridge';
import type { CreateProviderRequest } from '@/common/types/providerApi';

import type { ConfigKey, ConfigKeyMap } from './configKeys';
import { ConfigStorage, type IConfigStorageRefer } from './storage';

const MIGRATION_FLAG: ConfigKey = 'migration.configStorageImported';

const ALL_LEGACY_KEYS: ConfigKey[] = [
  'codex.config',
  'acp.config',
  'acp.promptTimeout',
  'acp.agentIdleTimeout',
  'acp.customAgents',
  'acp.cachedInitializeResult',
  'acp.cachedModels',
  'acp.cached_config_options',
  'acp.cachedModes',
  'mcp.config',
  'mcp.agentInstallStatus',
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

export async function migrateConfigStorage(): Promise<void> {
  if (await isBackendMigrationComplete(MIGRATION_FLAG)) {
    return;
  }

  const entries: Record<string, unknown> = {};

  const legacyEntries = await Promise.all(
    ALL_LEGACY_KEYS.map(async (key) => {
      try {
        const value = await ConfigStorage.get(key as keyof IConfigStorageRefer);
        return [key, value] as const;
      } catch {
        // key may not exist in old storage, skip
        return [key, undefined] as const;
      }
    })
  );

  for (const [key, value] of legacyEntries) {
    if (value !== undefined && value !== null) {
      entries[key] = value;
    }
  }

  entries[MIGRATION_FLAG] = true;
  await setBackendClientPreferences(entries);
  console.info('[Migration] configStorage migration completed, migrated %d keys', Object.keys(entries).length - 1);
}

// ---------------------------------------------------------------------------
// Provider migration — reads legacy `model.config` from old ConfigStorage
// and writes each entry to the backend via `POST /api/providers`.
// ---------------------------------------------------------------------------

const PROVIDERS_MIGRATION_FLAG: ConfigKey = 'migration.providersImported';

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

export async function migrateProviders(): Promise<void> {
  if (await isBackendMigrationComplete(PROVIDERS_MIGRATION_FLAG)) {
    return;
  }

  const existing = await ipcBridge.mode.listProviders.invoke();
  if (existing && existing.length > 0) {
    console.info('[Migration] providers migration skipped — backend already has %d providers', existing.length);
    await setBackendClientPreferences({ [PROVIDERS_MIGRATION_FLAG]: true });
    return;
  }

  let legacyProviders: LegacyProvider[];
  try {
    legacyProviders = (await ConfigStorage.get(
      'model.config' as keyof IConfigStorageRefer
    )) as unknown as LegacyProvider[];
  } catch (err) {
    console.info('[Migration] providers migration skipped — no model.config in legacy storage', err);
    await setBackendClientPreferences({ [PROVIDERS_MIGRATION_FLAG]: true });
    return;
  }

  if (!legacyProviders || !Array.isArray(legacyProviders) || legacyProviders.length === 0) {
    console.info('[Migration] providers migration skipped — model.config is empty or invalid');
    await setBackendClientPreferences({ [PROVIDERS_MIGRATION_FLAG]: true });
    return;
  }

  console.info('[Migration] found %d legacy providers to migrate', legacyProviders.length);

  const requests = legacyProviders.map((legacy) => ({
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
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      migrated += 1;
      return;
    }
    console.warn('[Migration] failed to create provider %s:', requests[index].legacy.id, result.reason);
  });

  await setBackendClientPreferences({ [PROVIDERS_MIGRATION_FLAG]: true });
  console.info('[Migration] providers migration completed, migrated %d/%d providers', migrated, legacyProviders.length);
}

type BackendClientPreferences = Partial<{ [K in ConfigKey]: ConfigKeyMap[K] }>;

async function getBackendClientPreferences(): Promise<BackendClientPreferences> {
  return (await httpRequest<Record<string, unknown>>('GET', '/api/settings/client')) as BackendClientPreferences;
}

async function setBackendClientPreferences(entries: BackendClientPreferences): Promise<void> {
  await httpRequest<void>('PUT', '/api/settings/client', entries);
}

async function isBackendMigrationComplete(flag: ConfigKey): Promise<boolean> {
  const settings = await getBackendClientPreferences();
  return settings[flag] === true;
}
