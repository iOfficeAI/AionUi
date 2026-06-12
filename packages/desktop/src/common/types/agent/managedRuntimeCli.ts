import type { IProvider } from '@/common/config/storage';
import type { ManagedRuntimeCliTarget } from '@/common/types/newApiAccount';
import { hasSpecificModelCapability } from '@/common/utils/modelCapabilities';

const CLAUDE_COMPATIBLE_PROTOCOLS = new Set(['anthropic']);
const ANSI_ESCAPE_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, 'g');
const ORPHAN_SGR_SUFFIX_PATTERN = /\[(?:\d{1,3}(?:;\d{1,3})*)m\]?$/i;
const SET_MODEL_PREFIX_PATTERN = /^set model to\s+/i;

// Image generation models should never appear in CLI agent model selectors.
// CLIs (Claude, Codex, OpenCode, etc.) are text-only coding agents that cannot
// use image/video generation models. Matches the same pattern used by
// imageModelAllowlist.ts for the built-in image generation tool.
const IMAGE_GEN_MODEL_PATTERN = /(image|banana|imagine|video)/i;

export const MANAGED_RUNTIME_CLI_TARGETS = ['claude', 'codex', 'hermes', 'opencode', 'openclaw'] as const;
export const MANAGED_NEWAPI_PROVIDER_ID = 'desktop-newapi-managed-provider';
export const MANAGED_NEWAPI_PROVIDER_NAME = 'New API';
export const MANAGED_NEWAPI_PROVIDER_DISPLAY_NAME = 'POUNDING API';
export const MANAGED_RUNTIME_PROVIDER_PREFIX = 'pounding-';
export const MANAGED_RUNTIME_PROVIDER_LEGACY_PREFIXES = ['aionui-'] as const;

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const normalized = sanitizeManagedRuntimeModelValue(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

export function sanitizeManagedRuntimeModelValue(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  const withoutAnsi = trimmed.replace(ANSI_ESCAPE_PATTERN, '').trim();
  const withoutSetModelPrefix = withoutAnsi.replace(SET_MODEL_PREFIX_PATTERN, '').trim();
  const withoutOrphanSuffix = withoutSetModelPrefix.replace(ORPHAN_SGR_SUFFIX_PATTERN, '').trim();

  return withoutOrphanSuffix || undefined;
}

const MANAGED_RUNTIME_CLI_BACKEND_ALIASES: Record<ManagedRuntimeCliTarget, string[]> = {
  claude: ['claude', 'anthropic'],
  codex: ['codex'],
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

function buildManagedRuntimeProviderIdWithPrefix(prefix: string, providerName: string, providerId: string): string {
  const namePart = slugifyPart(providerName || 'provider') || 'provider';
  const idPart = slugifyPart(providerId || 'default') || 'default';
  return `${prefix}${namePart}-${idPart}`.slice(0, 64);
}

export function getManagedRuntimeProviderId(
  providerName = MANAGED_NEWAPI_PROVIDER_NAME,
  providerId = MANAGED_NEWAPI_PROVIDER_ID
): string {
  return buildManagedRuntimeProviderIdWithPrefix(MANAGED_RUNTIME_PROVIDER_PREFIX, providerName, providerId);
}

export function getManagedRuntimeProviderIdAliases(
  providerName = MANAGED_NEWAPI_PROVIDER_NAME,
  providerId = MANAGED_NEWAPI_PROVIDER_ID
): string[] {
  const names = Array.from(new Set([providerName, MANAGED_NEWAPI_PROVIDER_NAME, MANAGED_NEWAPI_PROVIDER_DISPLAY_NAME]));
  const prefixes = [MANAGED_RUNTIME_PROVIDER_PREFIX, ...MANAGED_RUNTIME_PROVIDER_LEGACY_PREFIXES];
  return Array.from(
    new Set(
      prefixes.flatMap((prefix) =>
        names.map((name) => buildManagedRuntimeProviderIdWithPrefix(prefix, name, providerId))
      )
    )
  );
}

export function isManagedRuntimeProviderId(value: string | null | undefined): boolean {
  const normalized = value?.trim();
  if (!normalized) return false;
  return [MANAGED_RUNTIME_PROVIDER_PREFIX, ...MANAGED_RUNTIME_PROVIDER_LEGACY_PREFIXES].some((prefix) =>
    normalized.startsWith(prefix)
  );
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
  const normalizedModelId = sanitizeManagedRuntimeModelValue(managedModelId) || managedModelId.trim();
  switch (cliTarget) {
    case 'claude':
      // Claude's managed runtime is backed by cc-switch slot semantics.
      // The actual provider model id is written into the selected slot's env
      // (and reflected back via current_model_label), but runtime switching
      // itself still accepts slot ids such as `default` / `opus` / `haiku`.
      // Persisting the raw provider model id into `current_model_id` breaks
      // session/new resume and later prompts because the Claude ACP session
      // expects the slot id, not the underlying hosted model name.
      return 'default';
    case 'codex':
      // Codex config.toml uses the raw model name directly (no provider prefix).
      return normalizedModelId;
    case 'hermes':
      return `custom:${normalizedModelId}`;
    case 'opencode':
    case 'openclaw':
      return `${getManagedRuntimeProviderId()}/${normalizedModelId}`;
    default:
      return normalizedModelId;
  }
}

export function resolveManagedModelIdFromRuntime(
  cliTarget: ManagedRuntimeCliTarget,
  runtimeModelId: string | null | undefined
): string | undefined {
  const normalizedModelId = sanitizeManagedRuntimeModelValue(runtimeModelId);
  if (!normalizedModelId) return undefined;

  switch (cliTarget) {
    case 'codex':
      // Codex config.toml model field is the raw model name.
      return normalizedModelId;
    case 'hermes':
      return normalizedModelId.startsWith('custom:')
        ? normalizedModelId.slice('custom:'.length) || undefined
        : undefined;
    case 'opencode':
    case 'openclaw': {
      const matchedPrefix = getManagedRuntimeProviderIdAliases()
        .map((providerId) => `${providerId}/`)
        .find((prefix) => normalizedModelId.startsWith(prefix));
      return matchedPrefix ? normalizedModelId.slice(matchedPrefix.length) || undefined : normalizedModelId;
    }
    case 'claude':
      if (['default', 'opus', 'sonnet', 'haiku'].includes(normalizedModelId)) return undefined;
      return normalizedModelId;
    default:
      return normalizedModelId;
  }
}

export function getManagedRuntimeModelDisplayLabel(modelId: string | null | undefined): string | undefined {
  const normalized = sanitizeManagedRuntimeModelValue(modelId);
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

export function normalizeManagedRuntimeModelLabel(
  cliTarget: ManagedRuntimeCliTarget,
  runtimeModelLabel: string | null | undefined
): string | undefined {
  const normalizedLabel = sanitizeManagedRuntimeModelValue(runtimeModelLabel);
  if (!normalizedLabel) return undefined;

  const resolvedModelId = resolveManagedModelIdFromRuntime(cliTarget, normalizedLabel);
  if (resolvedModelId) return resolvedModelId;

  const managedPrefixPattern = /^(?:new api|pounding api)\s*\/\s*/i;
  if (managedPrefixPattern.test(normalizedLabel)) {
    return normalizedLabel.replace(managedPrefixPattern, '').trim() || undefined;
  }

  return getManagedRuntimeModelDisplayLabel(normalizedLabel) || undefined;
}

function inferManagedModelProtocol(provider: IProvider, modelId: string): string | undefined {
  const explicitProtocol = provider.model_protocols?.[modelId]?.trim().toLowerCase();
  if (explicitProtocol) return explicitProtocol;

  const normalizedModelId = modelId.trim().toLowerCase();
  if (normalizedModelId.startsWith('claude') || normalizedModelId.startsWith('anthropic')) return 'anthropic';
  if (normalizedModelId.startsWith('gemini') || normalizedModelId.startsWith('models/gemini')) return 'gemini';
  return 'openai';
}

function isManagedCliModelCompatible(
  provider: IProvider,
  modelId: string,
  cliTarget?: ManagedRuntimeCliTarget
): boolean {
  // All CLIs can use all models from the managed provider.
  // POUNDING API provides Anthropic-compatible endpoints for Claude,
  // OpenAI-compatible for others, and the CLI handles protocol translation.
  return true;
}

export function getManagedCliSelectableModels(
  provider: IProvider | null | undefined,
  cliTarget?: ManagedRuntimeCliTarget
): string[] {
  if (!provider) return [];

  const allModels = uniqueNonEmpty(provider.models || []);

  const candidateModels = allModels.filter((modelId) => {
    if (provider.model_enabled?.[modelId] === false) return false;
    // Exclude image/video generation models — CLIs are text-only coding agents
    if (IMAGE_GEN_MODEL_PATTERN.test(modelId)) return false;
    if (!isManagedCliModelCompatible(provider, modelId, cliTarget)) return false;
    const excluded = hasSpecificModelCapability(provider, modelId, 'excludeFromPrimary');
    if (excluded === true) return false;
    const functionCalling = hasSpecificModelCapability(provider, modelId, 'function_calling');
    return functionCalling !== false;
  });

  if (candidateModels.length > 0) return candidateModels;

  // Relaxed fallback: drop function_calling + excludeFromPrimary filters, keep
  // protocol compatibility check so Claude still prefers anthropic models when
  // available.
  const relaxedModels = allModels.filter(
    (modelId) =>
      provider.model_enabled?.[modelId] !== false && isManagedCliModelCompatible(provider, modelId, cliTarget)
  );
  if (relaxedModels.length > 0) return relaxedModels;

  // Ultimate fallback: drop ALL compatibility filters so every CLI gets at
  // least one selectable model. Without this, a user whose account only has
  // OpenAI-protocol models would see zero options for Claude/Hermes/etc.
  return allModels.filter((modelId) => provider.model_enabled?.[modelId] !== false);
}
