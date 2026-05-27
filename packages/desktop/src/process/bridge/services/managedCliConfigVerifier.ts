import type { ManagedRuntimeCliTarget } from '@/common/types/newApiAccount';
import stripJsonComments from 'strip-json-comments';

type JsonRecord = Record<string, unknown>;

export type ConfigVerificationResult = {
  ok: boolean;
  errors: string[];
};

export function maskSecret(value: string | null | undefined): string {
  const raw = value?.trim() ?? '';
  if (raw.length <= 8) return raw ? '********' : '';
  return `${raw.slice(0, 4)}********${raw.slice(-4)}`;
}

function parseJsonRecord(content: string): JsonRecord | null {
  try {
    const parsed = JSON.parse(stripJsonComments(content)) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as JsonRecord) : null;
  } catch {
    return null;
  }
}

function parseYamlRecord(content: string): JsonRecord | null {
  const customProvidersMatch = content.match(/custom_providers:\s*\n([\s\S]*?)(?:\n\w[^:\n]*:|\s*$)/);
  const providerBlock = customProvidersMatch?.[1] ?? '';
  const modelBlockMatch = content.match(/\nmodel:\s*\n([\s\S]*)/);
  const modelBlock = modelBlockMatch?.[1] ?? '';

  const baseUrl = content.match(/base_url:\s*"?([^"\n]+)"?/i)?.[1]?.trim();
  const keyEnv = providerBlock.match(/key_env:\s*"?([^"\n]+)"?/i)?.[1]?.trim();
  const apiMode = content.match(/api_mode:\s*"?([^"\n]+)"?/i)?.[1]?.trim();
  const modelDefault = modelBlock.match(/default:\s*"?([^"\n]+)"?/i)?.[1]?.trim();
  const providerName = providerBlock.match(/name:\s*"?([^"\n]+)"?/i)?.[1]?.trim();

  if (!baseUrl && !keyEnv && !apiMode && !modelDefault && !providerName) return null;
  return {
    custom_providers: [
      {
        name: providerName,
        base_url: baseUrl,
        key_env: keyEnv,
        api_mode: apiMode,
      },
    ],
    model: {
      default: modelDefault,
      base_url: baseUrl,
      api_mode: apiMode,
    },
  };
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : undefined;
}

function matchesBaseUrl(
  actual: string | undefined,
  expected: string | undefined,
  options?: { allowOpenAiCompatibleSuffix?: boolean }
): boolean {
  if (!expected) return true;
  if (!actual) return false;

  const normalizedActual = actual.trim().replace(/\/+$/, '');
  const normalizedExpected = expected.trim().replace(/\/+$/, '');
  if (normalizedActual === normalizedExpected) return true;

  if (options?.allowOpenAiCompatibleSuffix) {
    const normalizedActualRoot = normalizedActual.replace(/\/v1(?:beta)?$/i, '');
    const normalizedExpectedRoot = normalizedExpected.replace(/\/v1(?:beta)?$/i, '');
    return normalizedActualRoot === normalizedExpectedRoot;
  }

  return false;
}

export function verifyConfigByTarget(
  cliTarget: ManagedRuntimeCliTarget,
  content: string,
  extraContent?: string,
  expectedBaseUrl?: string,
  _configPath?: string
): ConfigVerificationResult {
  const errors: string[] = [];
  const expected = expectedBaseUrl?.trim();

  switch (cliTarget) {
    case 'claude': {
      const parsed = parseJsonRecord(content);
      const env = getRecord(parsed?.env);
      const baseUrl = getString(env?.ANTHROPIC_BASE_URL);
      const apiKey = getString(env?.ANTHROPIC_API_KEY) || getString(env?.ANTHROPIC_AUTH_TOKEN);
      if (!parsed) {
        errors.push('invalid Claude settings.json');
        break;
      }
      if (!matchesBaseUrl(baseUrl, expected)) {
        errors.push(`expected Claude base URL ${expected}`);
      }
      if (!baseUrl) errors.push('missing Claude ANTHROPIC_BASE_URL');
      if (!apiKey) errors.push('missing Claude API key');
      break;
    }
    case 'hermes': {
      const parsed = parseYamlRecord(content);
      const providers = Array.isArray(parsed?.custom_providers) ? parsed.custom_providers : [];
      const provider = providers[0];
      const providerRecord = getRecord(provider);
      const modelRecord = getRecord(parsed?.model);
      const baseUrl = getString(modelRecord?.base_url) || getString(providerRecord?.base_url);
      const apiMode = getString(modelRecord?.api_mode) || getString(providerRecord?.api_mode);
      const keyEnv = getString(providerRecord?.key_env);
      if (!parsed) {
        errors.push('invalid Hermes config.yaml');
        break;
      }
      if (!matchesBaseUrl(baseUrl, expected, { allowOpenAiCompatibleSuffix: true })) {
        errors.push(`expected Hermes base URL ${expected}`);
      }
      if (!baseUrl) errors.push('missing Hermes base URL');
      if (!apiMode) errors.push('missing Hermes api_mode');
      if (!keyEnv) errors.push('missing Hermes key_env');
      if (!extraContent?.includes('AIONUI_HERMES_API_KEY=')) {
        errors.push('missing Hermes API key in .env');
      }
      break;
    }
    case 'opencode': {
      const parsed = parseJsonRecord(content);
      const provider = getRecord(parsed?.provider);
      if (!parsed) {
        errors.push('invalid OpenCode config');
        break;
      }
      const providerEntries = provider
        ? Object.values(provider)
            .map((entry) => getRecord(entry))
            .filter(Boolean)
        : [];
      const managedOptions = providerEntries
        .map((entry) => getRecord(entry?.options))
        .filter(Boolean)
        .find(
          (options) =>
            matchesBaseUrl(getString(options?.baseURL), expected, { allowOpenAiCompatibleSuffix: true }) ||
            Boolean(getString(options?.apiKey))
        );
      const baseUrl = getString(managedOptions?.baseURL);
      const apiKey = getString(managedOptions?.apiKey);
      if (!matchesBaseUrl(baseUrl, expected, { allowOpenAiCompatibleSuffix: true })) {
        errors.push(`expected OpenCode base URL ${expected}`);
      }
      if (!baseUrl) errors.push('missing OpenCode baseURL');
      if (!apiKey) errors.push('missing OpenCode apiKey');
      break;
    }
    case 'openclaw': {
      const parsed = parseJsonRecord(content);
      const models = getRecord(parsed?.models);
      const providers = getRecord(models?.providers);
      if (!parsed) {
        errors.push('invalid OpenClaw config');
        break;
      }
      const providerEntries = providers
        ? Object.values(providers)
            .map((entry) => getRecord(entry))
            .filter(Boolean)
        : [];
      const providerRecord = providerEntries.find((entry) => {
        const baseUrl = getString(entry?.baseUrl);
        const apiKey = getString(entry?.apiKey);
        return matchesBaseUrl(baseUrl, expected, { allowOpenAiCompatibleSuffix: true }) || Boolean(apiKey);
      });
      const baseUrl = getString(providerRecord?.baseUrl);
      const apiKey = getString(providerRecord?.apiKey);
      const api = getString(providerRecord?.api);
      if (!matchesBaseUrl(baseUrl, expected, { allowOpenAiCompatibleSuffix: true })) {
        errors.push(`expected OpenClaw base URL ${expected}`);
      }
      if (!baseUrl) errors.push('missing OpenClaw baseUrl');
      if (!apiKey) errors.push('missing OpenClaw apiKey');
      if (!api) errors.push('missing OpenClaw api');
      break;
    }
    default:
      break;
  }

  return { ok: errors.length === 0, errors };
}
