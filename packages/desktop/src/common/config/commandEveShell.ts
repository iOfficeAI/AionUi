export const COMMAND_EVE_SHELL_ENABLED =
  typeof process === 'undefined' ? true : process.env.AIONUI_UPSTREAM_MODE !== '1';

export const COMMAND_EVE_APP_NAME = 'Command EVE';
export const COMMAND_EVE_DISPLAY_NAME = 'EVE';
export const COMMAND_EVE_TITLE = '⌘ EVE';
export const COMMAND_EVE_VERSION = '1.0.0-alpha.4';
export const COMMAND_EVE_APP_ID = 'com.fynlabs.commandeve';
export const COMMAND_EVE_PROTOCOL_SCHEME = 'command-eve';
export const COMMAND_EVE_ASSISTANT_ID = 'command-eve-chief-of-staff';
export const COMMAND_EVE_ASSISTANT_KEY = `custom:${COMMAND_EVE_ASSISTANT_ID}`;
export const COMMAND_EVE_ASSISTANT_AVATAR = 'command-eve-logo.svg';
export const COMMAND_EVE_DEFAULT_ACP_BACKEND = 'hermes';
export const COMMAND_EVE_DEFAULT_ACP_MODEL_ID = 'custom:command-eve-gemma4-e4b-64k:latest';
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

export function getCommandEveDefaultAcpModelIdForTier(backend: string, tierId?: string | null): string | undefined {
  if (!COMMAND_EVE_SHELL_ENABLED || backend !== COMMAND_EVE_DEFAULT_ACP_BACKEND) {
    return undefined;
  }
  return getCommandEveAcpModelIdForTier(tierId);
}

export function getCommandEveCliSafeName(baseName: string, isPackaged: boolean): string {
  return isPackaged ? baseName : `${baseName}${getCommandEveEnvSuffix()}`;
}
