import type { IProvider } from '@/common/config/storage';
import type { ManagedRuntimeCliTarget } from '@/common/types/newApiAccount';
import { hasSpecificModelCapability } from '@/common/utils/modelCapabilities';

export const MANAGED_RUNTIME_CLI_TARGETS = ['claude', 'hermes', 'opencode', 'openclaw'] as const;
export const MANAGED_NEWAPI_PROVIDER_ID = 'desktop-newapi-managed-provider';
export const MANAGED_NEWAPI_PROVIDER_NAME = 'New API';

const MANAGED_RUNTIME_CLI_BACKEND_ALIASES: Record<ManagedRuntimeCliTarget, string[]> = {
  claude: ['claude', 'anthropic'],
  hermes: ['hermes'],
  opencode: ['opencode'],
  openclaw: ['openclaw', 'openclaw-gateway'],
};

function slugifyPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

export function getManagedRuntimeProviderId(
  providerName = MANAGED_NEWAPI_PROVIDER_NAME,
  providerId = MANAGED_NEWAPI_PROVIDER_ID
): string {
  const namePart = slugifyPart(providerName || 'provider') || 'provider';
  const idPart = slugifyPart(providerId || 'default') || 'default';
  return `aionui-${namePart}-${idPart}`.slice(0, 64);
}

export function resolveManagedRuntimeCliTarget(value: string | null | undefined): ManagedRuntimeCliTarget | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  return (MANAGED_RUNTIME_CLI_TARGETS as readonly ManagedRuntimeCliTarget[]).find((target) =>
    MANAGED_RUNTIME_CLI_BACKEND_ALIASES[target].includes(normalized)
  );
}

export function getManagedRuntimeCliBackendAliases(target: ManagedRuntimeCliTarget): string[] {
  return MANAGED_RUNTIME_CLI_BACKEND_ALIASES[target];
}

export function buildManagedRuntimeModelId(cliTarget: ManagedRuntimeCliTarget, managedModelId: string): string {
  const normalizedModelId = managedModelId.trim();
  switch (cliTarget) {
    case 'hermes':
      return `custom:${normalizedModelId}`;
    case 'opencode':
    case 'openclaw':
      return `${getManagedRuntimeProviderId()}/${normalizedModelId}`;
    case 'claude':
    default:
      return normalizedModelId;
  }
}

export function resolveManagedModelIdFromRuntime(
  cliTarget: ManagedRuntimeCliTarget,
  runtimeModelId: string | null | undefined
): string | undefined {
  const normalizedModelId = runtimeModelId?.trim();
  if (!normalizedModelId) return undefined;

  switch (cliTarget) {
    case 'hermes':
      return normalizedModelId.startsWith('custom:')
        ? normalizedModelId.slice('custom:'.length) || undefined
        : undefined;
    case 'opencode':
    case 'openclaw': {
      const prefix = `${getManagedRuntimeProviderId()}/`;
      return normalizedModelId.startsWith(prefix)
        ? normalizedModelId.slice(prefix.length) || undefined
        : normalizedModelId;
    }
    case 'claude':
      if (['default', 'opus', 'sonnet', 'haiku'].includes(normalizedModelId)) return undefined;
      return normalizedModelId;
    default:
      return normalizedModelId;
  }
}

export function getManagedRuntimeModelDisplayLabel(modelId: string | null | undefined): string | undefined {
  const normalized = modelId?.trim();
  if (!normalized) return undefined;
  if (normalized.startsWith('custom:')) {
    return normalized.slice('custom:'.length) || undefined;
  }
  const slashIndex = normalized.lastIndexOf('/');
  if (slashIndex >= 0) {
    return normalized.slice(slashIndex + 1) || undefined;
  }
  return normalized;
}

export function getManagedCliSelectableModels(provider: IProvider | null | undefined): string[] {
  if (!provider) return [];

  const candidateModels = (provider.models || []).filter((modelId) => {
    if (provider.model_enabled?.[modelId] === false) return false;
    const excluded = hasSpecificModelCapability(provider, modelId, 'excludeFromPrimary');
    if (excluded === true) return false;
    const functionCalling = hasSpecificModelCapability(provider, modelId, 'function_calling');
    return functionCalling !== false;
  });

  if (candidateModels.length > 0) return candidateModels;
  return (provider.models || []).filter((modelId) => provider.model_enabled?.[modelId] !== false);
}
