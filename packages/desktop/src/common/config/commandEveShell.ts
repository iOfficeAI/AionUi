import type { TProviderWithModel } from './storage';
import type { AcpModelInfo } from '../types/platform/acpTypes';

export const COMMAND_EVE_SHELL_ENABLED =
  typeof process === 'undefined' ? true : process.env.AIONUI_UPSTREAM_MODE !== '1';

export const COMMAND_EVE_APP_NAME = 'Command EVE';
export const COMMAND_EVE_DISPLAY_NAME = 'EVE';
export const COMMAND_EVE_TITLE = '⌘ EVE';
export const COMMAND_EVE_VERSION = '1.0.0-alpha.7';
export const COMMAND_EVE_APP_ID = 'com.fynlabs.commandeve';
export const COMMAND_EVE_PROTOCOL_SCHEME = 'command-eve';
export const COMMAND_EVE_ASSISTANT_ID = 'command-eve-chief-of-staff';
export const COMMAND_EVE_ASSISTANT_KEY = `custom:${COMMAND_EVE_ASSISTANT_ID}`;
export const COMMAND_EVE_ASSISTANT_AVATAR = 'command-eve-logo.svg';
export const COMMAND_EVE_DEFAULT_ACP_BACKEND = 'hermes';
export const COMMAND_EVE_DEFAULT_ACP_MODEL_ID = 'custom:command-eve-gemma4-e4b-64k:latest';
export const COMMAND_EVE_LOCAL_RUNTIME_PROVIDER_ID = 'command-eve-local-runtime';
export const COMMAND_EVE_LOCAL_RUNTIME_PROVIDER_NAME = 'Command EVE Local Runtime';
export const COMMAND_EVE_EGRESS_PROXY_OPENAI_BASE_URL = 'http://127.0.0.1:25811/v1';
export const COMMAND_EVE_LOCAL_MODEL_TIERS = [
  {
    id: 'gemma-4-e4b-local-default',
    label: 'Gemma 4 E4B',
    modelId: 'custom:command-eve-gemma4-e4b-64k:latest',
    modelRef: 'gemma4:e4b',
    contextLength: 65_536,
    diskGb: 10,
    memoryGb: 16,
    state: 'default',
  },
  {
    id: 'gemma-4-12b-local-planning',
    label: 'Gemma 4 12B',
    modelId: 'custom:command-eve-gemma4-12b-64k:latest',
    modelRef: 'gemma4:12b',
    contextLength: 65_536,
    diskGb: 20,
    memoryGb: 16,
    state: 'opt_in',
  },
  {
    id: 'gemma-4-31b-local-pro',
    label: 'Gemma 4 31B',
    modelId: 'custom:command-eve-gemma4-31b-64k:latest',
    modelRef: 'gemma4:31b',
    contextLength: 65_536,
    diskGb: 45,
    memoryGb: 64,
    state: 'pro',
  },
] as const;
export type CommandEveLocalModelTier = (typeof COMMAND_EVE_LOCAL_MODEL_TIERS)[number];
export type CommandEveLocalModelTierId = CommandEveLocalModelTier['id'];
export const COMMAND_EVE_DEFAULT_LOCAL_MODEL_TIER_ID: CommandEveLocalModelTierId = COMMAND_EVE_LOCAL_MODEL_TIERS[0].id;
export const COMMAND_EVE_DATA_DIR_NAME = 'command-eve';
export const COMMAND_EVE_CONFIG_DIR_NAME = 'config';
export const COMMAND_EVE_TEMP_DIR_NAME = 'command-eve';
export const COMMAND_EVE_CLI_DATA_SYMLINK = '.command-eve';
export const COMMAND_EVE_CLI_CONFIG_SYMLINK = '.command-eve-config';
export const COMMAND_EVE_CDP_REGISTRY_FILE = '.command-eve-cdp-registry.json';

export const COMMAND_EVE_AGENT_FALLBACK_ORDER = ['hermes'] as const;

export function getCommandEveEnvSuffix(): string {
  return process.env.AIONUI_MULTI_INSTANCE === '1' ? '-dev-2' : '-dev';
}

export function getCommandEveAppName(isPackaged: boolean): string {
  return isPackaged ? COMMAND_EVE_APP_NAME : `${COMMAND_EVE_APP_NAME}${getCommandEveEnvSuffix()}`;
}

export function getCommandEveDefaultAcpModelId(backend: string): string | undefined {
  if (!COMMAND_EVE_SHELL_ENABLED || backend !== COMMAND_EVE_DEFAULT_ACP_BACKEND) {
    return undefined;
  }
  return COMMAND_EVE_DEFAULT_ACP_MODEL_ID;
}

export function normalizeCommandEveLocalModelTierId(tierId?: string | null): CommandEveLocalModelTierId {
  const matched = COMMAND_EVE_LOCAL_MODEL_TIERS.find((tier) => tier.id === tierId);
  return matched?.id ?? COMMAND_EVE_DEFAULT_LOCAL_MODEL_TIER_ID;
}

export function getCommandEveLocalModelTier(tierId?: string | null): CommandEveLocalModelTier {
  const normalized = normalizeCommandEveLocalModelTierId(tierId);
  return COMMAND_EVE_LOCAL_MODEL_TIERS.find((tier) => tier.id === normalized) ?? COMMAND_EVE_LOCAL_MODEL_TIERS[0];
}

export function getCommandEveAcpModelIdForTier(tierId?: string | null): string {
  return getCommandEveLocalModelTier(tierId).modelId;
}

export function getCommandEveLocalAcpModelInfo(
  backend?: string | null,
  currentModelId?: string | null
): AcpModelInfo | undefined {
  if (!COMMAND_EVE_SHELL_ENABLED || backend !== COMMAND_EVE_DEFAULT_ACP_BACKEND) {
    return undefined;
  }

  const available_models = COMMAND_EVE_LOCAL_MODEL_TIERS.map((tier) => ({
    id: tier.modelId,
    label: tier.label,
  }));
  const resolvedModelId =
    currentModelId && available_models.some((model) => model.id === currentModelId)
      ? currentModelId
      : COMMAND_EVE_DEFAULT_ACP_MODEL_ID;
  const selected = available_models.find((model) => model.id === resolvedModelId) ?? available_models[0];

  return {
    current_model_id: selected?.id ?? null,
    current_model_label: selected?.label ?? null,
    available_models,
  };
}

export function getCommandEveLocalAcpModelInfoForTier(
  backend: string | undefined,
  tierId?: string | null
): AcpModelInfo | undefined {
  const modelId = backend ? getCommandEveDefaultAcpModelIdForTier(backend, tierId) : undefined;
  return getCommandEveLocalAcpModelInfo(backend, modelId);
}

export function getCommandEveDefaultAcpModelIdForTier(backend: string, tierId?: string | null): string | undefined {
  if (!COMMAND_EVE_SHELL_ENABLED || backend !== COMMAND_EVE_DEFAULT_ACP_BACKEND) {
    return undefined;
  }
  return getCommandEveAcpModelIdForTier(tierId);
}

export function getCommandEveLocalRuntimeProvider(tierId?: string | null): TProviderWithModel {
  const tier = getCommandEveLocalModelTier(tierId);
  return {
    id: COMMAND_EVE_LOCAL_RUNTIME_PROVIDER_ID,
    platform: 'custom',
    name: COMMAND_EVE_LOCAL_RUNTIME_PROVIDER_NAME,
    base_url: COMMAND_EVE_EGRESS_PROXY_OPENAI_BASE_URL,
    api_key: 'command-eve-local-loopback',
    use_model: tier.modelId,
    context_limit: tier.contextLength,
    capabilities: [{ type: 'text' }, { type: 'function_calling' }],
  };
}

export function getCommandEveCliSafeName(baseName: string, isPackaged: boolean): string {
  return isPackaged ? baseName : `${baseName}${getCommandEveEnvSuffix()}`;
}
