/**
 * Parse and merge OpenCode `GET /provider` + `GET /provider/auth` payloads.
 *
 * Handles both SDK shapes for `connected` (string[] per v2 SDK) and full
 * Provider objects (per API_REFERENCE §9 prose).
 */

import type {
  OpenCodeProvider,
  OpenCodeProviderAuthMethod,
  OpenCodeProviderAuthMethodsResponse,
  OpenCodeProviderCatalogView,
  OpenCodeProviderListResponse,
  OpenCodeProviderModel,
  OpenCodeProviderView,
} from './opencodeProviderTypes';

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function parseProvider(raw: unknown): OpenCodeProvider | null {
  const o = asRecord(raw);
  if (!o || typeof o.id !== 'string') return null;
  const modelsRaw = o.models;
  let models: Record<string, OpenCodeProviderModel> | undefined;
  if (modelsRaw && typeof modelsRaw === 'object' && !Array.isArray(modelsRaw)) {
    models = modelsRaw as Record<string, OpenCodeProviderModel>;
  }
  // The SDK v2 `Provider` shape carries only `id / name / source / env / key /
  // options / models`. Older AionUi hand-mirrored types also tracked `api`
  // and `npm` on the provider object; we drop those at the parser boundary
  // because no consumer reads them downstream.
  return {
    id: o.id,
    name: typeof o.name === 'string' ? o.name : o.id,
    source: o.source as OpenCodeProvider['source'],
    env: Array.isArray(o.env) ? o.env.filter((e): e is string => typeof e === 'string') : undefined,
    key: typeof o.key === 'string' ? o.key : undefined,
    options: asRecord(o.options) ?? undefined,
    models,
  };
}

function parseConnectedIds(connected: unknown): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(connected)) return out;
  for (const item of connected) {
    if (typeof item === 'string') {
      out.add(item);
    } else {
      const p = parseProvider(item);
      if (p) out.add(p.id);
    }
  }
  return out;
}

function parseAuthMethods(raw: unknown): OpenCodeProviderAuthMethodsResponse {
  const o = asRecord(raw);
  if (!o) return {};
  const out: OpenCodeProviderAuthMethodsResponse = {};
  for (const [providerId, methods] of Object.entries(o)) {
    if (!Array.isArray(methods)) continue;
    out[providerId] = methods
      .map((m): OpenCodeProviderAuthMethod | null => {
        const rec = asRecord(m);
        if (!rec || (rec.type !== 'oauth' && rec.type !== 'api')) return null;
        const method: OpenCodeProviderAuthMethod = {
          type: rec.type,
          label: typeof rec.label === 'string' ? rec.label : rec.type,
        };
        if (Array.isArray(rec.prompts)) {
          method.prompts = rec.prompts as OpenCodeProviderAuthMethod['prompts'];
        }
        return method;
      })
      .filter((m): m is OpenCodeProviderAuthMethod => m !== null);
  }
  return out;
}

function modelList(provider: OpenCodeProvider): OpenCodeProviderModel[] {
  if (!provider.models) return [];
  return Object.values(provider.models).toSorted((a, b) => a.name.localeCompare(b.name));
}

export function parseProviderListResponse(raw: unknown): OpenCodeProviderListResponse | null {
  const o = asRecord(raw);
  if (!o || !Array.isArray(o.all)) return null;
  const all = o.all.map(parseProvider).filter((p): p is OpenCodeProvider => p !== null);
  const defaultMap = asRecord(o.default) as Record<string, string> | undefined;
  const connected = Array.isArray(o.connected) ? o.connected : [];
  return { all, default: defaultMap, connected };
}

export function buildProviderCatalogView(catalogRaw: unknown, authMethodsRaw: unknown): OpenCodeProviderCatalogView {
  const catalog = parseProviderListResponse(catalogRaw);
  const authMethods = parseAuthMethods(authMethodsRaw);
  if (!catalog) {
    return { providers: [], connectedCount: 0 };
  }

  const connectedIds = parseConnectedIds(catalog.connected);
  const defaultProviderId = catalog.default?.providerID ?? catalog.default?.providerId ?? catalog.default?.provider_id;
  const defaultModelId = catalog.default?.modelID ?? catalog.default?.modelId ?? catalog.default?.model_id;

  const providers: OpenCodeProviderView[] = catalog.all
    .map((provider) => {
      const methods = authMethods[provider.id] ?? [];
      return {
        provider,
        connected: connectedIds.has(provider.id),
        authMethods: methods,
        models: modelList(provider),
        isDefaultProvider: Boolean(defaultProviderId && provider.id === defaultProviderId),
      } satisfies OpenCodeProviderView;
    })
    .toSorted((a, b) => {
      if (a.connected !== b.connected) return a.connected ? -1 : 1;
      if (a.isDefaultProvider !== b.isDefaultProvider) return a.isDefaultProvider ? -1 : 1;
      return a.provider.name.localeCompare(b.provider.name);
    });

  return {
    providers,
    defaultProviderId,
    defaultModelId,
    connectedCount: connectedIds.size,
  };
}

export function oauthMethodIndex(methods: OpenCodeProviderAuthMethod[]): number {
  return methods.findIndex((m) => m.type === 'oauth');
}

export function apiMethodPresent(methods: OpenCodeProviderAuthMethod[]): boolean {
  return methods.some((m) => m.type === 'api');
}

export function formatContextTokens(n?: number): string {
  if (!n || n <= 0) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

export function promptVisible(
  prompt: NonNullable<OpenCodeProviderAuthMethod['prompts']>[number],
  inputs: Record<string, string>
): boolean {
  if (!prompt.when) return true;
  const current = inputs[prompt.when.key] ?? '';
  return prompt.when.op === 'eq' ? current === prompt.when.value : current !== prompt.when.value;
}
