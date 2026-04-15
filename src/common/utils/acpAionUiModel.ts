import type { IProvider } from '@/common/config/storage';
import type { AcpModelInfo } from '@/common/types/acpTypes';

export const AIONUI_MODEL_REF_PREFIX = 'aionui:';

type AionUiModelOption = {
  id: string;
  label: string;
  provider: IProvider;
  modelId: string;
};

export type AionUiModelSelection = {
  modelRef: string;
  label: string;
  provider: IProvider;
  modelId: string;
};

export function isAionUiModelRef(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.startsWith(AIONUI_MODEL_REF_PREFIX);
}

export function encodeAionUiModelRef(providerId: string, modelId: string): string {
  return `${AIONUI_MODEL_REF_PREFIX}${encodeURIComponent(providerId)}:${encodeURIComponent(modelId)}`;
}

export function decodeAionUiModelRef(value: string | null | undefined): { providerId: string; modelId: string } | null {
  if (!isAionUiModelRef(value)) return null;
  const payload = value.slice(AIONUI_MODEL_REF_PREFIX.length);
  const separatorIndex = payload.indexOf(':');
  if (separatorIndex <= 0) return null;

  try {
    return {
      providerId: decodeURIComponent(payload.slice(0, separatorIndex)),
      modelId: decodeURIComponent(payload.slice(separatorIndex + 1)),
    };
  } catch {
    return null;
  }
}

function getProviderModels(provider: IProvider): string[] {
  if (provider.enabled === false || !Array.isArray(provider.model)) return [];
  return provider.model.filter((modelId) => provider.modelEnabled?.[modelId] !== false);
}

function buildOptionLabel(provider: IProvider, modelId: string): string {
  return `${provider.name} / ${modelId}`;
}

export function listAionUiModelOptions(providers: IProvider[] | null | undefined): AionUiModelOption[] {
  if (!Array.isArray(providers)) return [];

  return providers.flatMap((provider) =>
    getProviderModels(provider).map((modelId) => ({
      id: encodeAionUiModelRef(provider.id, modelId),
      label: buildOptionLabel(provider, modelId),
      provider,
      modelId,
    }))
  );
}

export function getAionUiModelDisplayLabel(value: string | null | undefined, providers?: IProvider[] | null): string {
  const decoded = decodeAionUiModelRef(value);
  if (!decoded) return value || '';

  const provider = Array.isArray(providers) ? providers.find((item) => item.id === decoded.providerId) : undefined;
  return provider ? buildOptionLabel(provider, decoded.modelId) : decoded.modelId;
}

export function buildAionUiAcpModelInfo(
  providers: IProvider[] | null | undefined,
  currentRef?: string | null
): AcpModelInfo | null {
  const options = listAionUiModelOptions(providers);
  if (options.length === 0) return null;

  const selected = options.find((option) => option.id === currentRef) || options[0];
  return {
    source: 'models',
    currentModelId: selected.id,
    currentModelLabel: selected.label,
    availableModels: options.map((option) => ({ id: option.id, label: option.label })),
    canSwitch: options.length > 1,
  };
}

export function resolveAionUiModelSelection(
  providers: IProvider[] | null | undefined,
  currentRef?: string | null
): AionUiModelSelection | null {
  const options = listAionUiModelOptions(providers);
  if (options.length === 0) return null;

  const selected = options.find((option) => option.id === currentRef) || options[0];
  return {
    modelRef: selected.id,
    label: selected.label,
    provider: selected.provider,
    modelId: selected.modelId,
  };
}

export function buildAionUiCurrentModelInfo(label: string, modelRef: string): AcpModelInfo {
  return {
    source: 'models',
    currentModelId: modelRef,
    currentModelLabel: label,
    availableModels: [],
    canSwitch: false,
  };
}

export function inferAionUiModelProtocol(provider: IProvider, modelId: string): string {
  const explicitProtocol = provider.modelProtocols?.[modelId]?.toLowerCase();
  if (explicitProtocol) return explicitProtocol;

  const platform = provider.platform?.toLowerCase() || '';
  if (platform.includes('anthropic') || platform.includes('claude')) return 'anthropic';
  if (platform.includes('gemini')) return 'gemini';
  if (platform.includes('bedrock')) return 'bedrock';
  return 'openai';
}

export function buildAionUiModelEnv(selection: AionUiModelSelection): Record<string, string> {
  const { provider, modelId, modelRef } = selection;
  const protocol = inferAionUiModelProtocol(provider, modelId);
  const env: Record<string, string> = {
    AIONUI_MODEL_REF: modelRef,
    AIONUI_MODEL_ID: modelId,
    AIONUI_MODEL_NAME: modelId,
    AIONUI_MODEL_LABEL: selection.label,
    AIONUI_PROVIDER_ID: provider.id,
    AIONUI_PROVIDER_NAME: provider.name,
    AIONUI_PROVIDER_PLATFORM: provider.platform,
    AIONUI_MODEL_PROTOCOL: protocol,
  };

  if (provider.baseUrl) {
    env.AIONUI_BASE_URL = provider.baseUrl;
  }
  if (provider.apiKey) {
    env.AIONUI_API_KEY = provider.apiKey;
  }

  if (protocol === 'anthropic') {
    if (provider.apiKey) env.ANTHROPIC_API_KEY = provider.apiKey;
    if (provider.baseUrl) env.ANTHROPIC_BASE_URL = provider.baseUrl;
    env.ANTHROPIC_MODEL = modelId;
    return env;
  }

  if (protocol === 'gemini') {
    if (provider.apiKey) {
      env.GEMINI_API_KEY = provider.apiKey;
      env.GOOGLE_API_KEY = provider.apiKey;
    }
    if (provider.baseUrl) {
      env.GEMINI_BASE_URL = provider.baseUrl;
      env.GOOGLE_GENERATIVE_AI_BASE_URL = provider.baseUrl;
    }
    env.GEMINI_MODEL = modelId;
    return env;
  }

  if (provider.apiKey) env.OPENAI_API_KEY = provider.apiKey;
  if (provider.baseUrl) env.OPENAI_BASE_URL = provider.baseUrl;
  env.OPENAI_MODEL = modelId;
  return env;
}
