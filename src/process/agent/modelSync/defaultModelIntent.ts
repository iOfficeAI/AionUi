/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DefaultModelIntent, IConfigStorageRefer, IProvider, TProviderWithModel } from '@/common/config/storage';
import type { AcpBackend, AgentBackend } from '@/common/types/acpTypes';
import { DEFAULT_CODEX_MODELS } from '@/common/types/codex/codexModels';
import { ConfigStorage } from '@/common/config/storage';
import { ProcessConfig } from '@process/utils/initStorage';
import type { BackendModelPreference } from './types';

type ConfigReader = {
  get<K extends keyof IConfigStorageRefer>(key: K): Promise<IConfigStorageRefer[K]>;
};

function toProviderWithModel(provider: IProvider, modelId: string): TProviderWithModel {
  return {
    ...provider,
    useModel: modelId,
  };
}

async function getEnabledProvidersFromRendererConfig(): Promise<IProvider[]> {
  const providers = await ConfigStorage.get('model.config');
  return Array.isArray(providers) ? providers.filter((provider) => provider.enabled !== false) : [];
}

async function getEnabledProvidersFromProcessConfig(config: ConfigReader = ProcessConfig): Promise<IProvider[]> {
  const providers = await config.get('model.config');
  return Array.isArray(providers) ? providers.filter((provider) => provider.enabled !== false) : [];
}

function findProviderByIntent(providers: IProvider[], intent: DefaultModelIntent): IProvider | undefined {
  return providers.find((provider) => {
    if (provider.id !== intent.providerId) return false;
    return provider.model?.includes(intent.modelId);
  });
}

function inferIntentFromLegacyValue(
  providers: IProvider[],
  value: string | { id: string; useModel: string } | undefined,
  source: DefaultModelIntent['source']
): DefaultModelIntent | null {
  if (!value) return null;

  if (typeof value === 'object' && 'id' in value && 'useModel' in value) {
    const provider = providers.find((item) => item.id === value.id && item.model?.includes(value.useModel));
    return provider
      ? {
          providerId: value.id,
          modelId: value.useModel,
          providerPlatform: provider.platform,
          providerName: provider.name,
          source,
          updatedAt: Date.now(),
        }
      : null;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const provider = providers.find((item) => item.model?.includes(value));
    if (!provider) return null;
    return {
      providerId: provider.id,
      modelId: value,
      providerPlatform: provider.platform,
      providerName: provider.name,
      source,
      updatedAt: Date.now(),
    };
  }

  return null;
}

async function inferUnifiedIntentFromProcessLegacyDefaults(
  config: ConfigReader = ProcessConfig
): Promise<DefaultModelIntent | null> {
  const providers = await getEnabledProvidersFromProcessConfig(config);
  const geminiLegacy = await config.get('gemini.defaultModel');
  const geminiIntent = inferIntentFromLegacyValue(providers, geminiLegacy, 'migration');
  if (geminiIntent) {
    return geminiIntent;
  }

  const aionrsLegacy = await config.get('aionrs.defaultModel');
  return inferIntentFromLegacyValue(providers, aionrsLegacy, 'migration');
}

export async function getDefaultModelIntent(): Promise<DefaultModelIntent | null> {
  const [intent, providers] = await Promise.all([
    ConfigStorage.get('agent.defaultModelIntent'),
    getEnabledProvidersFromRendererConfig(),
  ]);

  if (intent && typeof intent === 'object' && 'providerId' in intent && 'modelId' in intent) {
    return intent as DefaultModelIntent;
  }

  const geminiLegacy = await ConfigStorage.get('gemini.defaultModel');
  return inferIntentFromLegacyValue(providers, geminiLegacy, 'migration');
}

export async function getProcessDefaultModelIntent(): Promise<DefaultModelIntent | null> {
  const [intent] = await Promise.all([ProcessConfig.get('agent.defaultModelIntent')]);

  if (intent && typeof intent === 'object' && 'providerId' in intent && 'modelId' in intent) {
    return intent as DefaultModelIntent;
  }

  return inferUnifiedIntentFromProcessLegacyDefaults();
}

export async function resolveProcessUnifiedIntentForMigration(
  config: ConfigReader = ProcessConfig
): Promise<DefaultModelIntent | null> {
  const existing = await config.get('agent.defaultModelIntent');
  if (existing && typeof existing === 'object' && 'providerId' in existing && 'modelId' in existing) {
    return existing as DefaultModelIntent;
  }

  return inferUnifiedIntentFromProcessLegacyDefaults(config);
}

export async function resolveProviderModelFromIntent(intent: DefaultModelIntent): Promise<TProviderWithModel | null> {
  const providers = await getEnabledProvidersFromRendererConfig();
  const provider = findProviderByIntent(providers, intent);
  if (!provider) return null;
  return toProviderWithModel(provider, intent.modelId);
}

export async function resolveProcessProviderModelFromIntent(
  intent: DefaultModelIntent
): Promise<TProviderWithModel | null> {
  const providers = await getEnabledProvidersFromProcessConfig();
  const provider = findProviderByIntent(providers, intent);
  if (!provider) return null;
  return toProviderWithModel(provider, intent.modelId);
}

async function resolveLegacyAcpModelId(backend: string, useProcessConfig: boolean): Promise<string | undefined> {
  const storage = useProcessConfig ? ProcessConfig : ConfigStorage;
  const acpConfig = await storage.get('acp.config');
  const preferredModelId = (acpConfig?.[backend as AcpBackend] as { preferredModelId?: string } | undefined)
    ?.preferredModelId;
  if (typeof preferredModelId === 'string' && preferredModelId.trim().length > 0) {
    return preferredModelId;
  }

  const cachedModels = await storage.get('acp.cachedModels');
  const cachedModelId = cachedModels?.[backend]?.currentModelId;
  if (typeof cachedModelId === 'string' && cachedModelId.trim().length > 0) {
    return cachedModelId;
  }

  if (backend === 'codex' && DEFAULT_CODEX_MODELS.length > 0) {
    return DEFAULT_CODEX_MODELS[0]?.id;
  }

  return undefined;
}

function resolveIntentPreferenceSource(intent: DefaultModelIntent): BackendModelPreference['source'] {
  return intent.source === 'migration' ? 'legacy-backend-config' : 'default-model-intent';
}

export async function resolveBackendModelPreference(backend: AgentBackend): Promise<BackendModelPreference> {
  const intent = await getDefaultModelIntent();

  if (backend === 'gemini' || backend === 'aionrs') {
    if (intent) {
      const providerModel = await resolveProviderModelFromIntent(intent);
      if (providerModel) {
        return {
          backend,
          currentModelId: providerModel.useModel,
          providerModel,
          source: resolveIntentPreferenceSource(intent),
        };
      }
    }

    if (backend === 'gemini') {
      const providers = await getEnabledProvidersFromRendererConfig();
      const legacy = await ConfigStorage.get('gemini.defaultModel');
      const inferred = inferIntentFromLegacyValue(providers, legacy, 'migration');
      const providerModel = inferred ? await resolveProviderModelFromIntent(inferred) : null;
      return {
        backend,
        currentModelId: providerModel?.useModel,
        providerModel: providerModel ?? undefined,
        source: providerModel ? 'legacy-backend-config' : 'fallback',
      };
    }

    const saved = await ConfigStorage.get('aionrs.defaultModel');
    const providers = await getEnabledProvidersFromRendererConfig();
    const inferred = inferIntentFromLegacyValue(providers, saved, 'migration');
    const providerModel = inferred ? await resolveProviderModelFromIntent(inferred) : null;
    return {
      backend,
      currentModelId: providerModel?.useModel,
      providerModel: providerModel ?? undefined,
      source: providerModel ? 'legacy-backend-config' : 'fallback',
    };
  }

  const currentModelId = await resolveLegacyAcpModelId(backend, false);
  return {
    backend,
    currentModelId,
    source: currentModelId ? 'legacy-backend-config' : 'fallback',
  };
}

export async function resolveProcessBackendModelPreference(backend: AgentBackend): Promise<BackendModelPreference> {
  const intent = await getProcessDefaultModelIntent();

  if (backend === 'gemini' || backend === 'aionrs') {
    if (intent) {
      const providerModel = await resolveProcessProviderModelFromIntent(intent);
      if (providerModel) {
        return {
          backend,
          currentModelId: providerModel.useModel,
          providerModel,
          source: resolveIntentPreferenceSource(intent),
        };
      }
    }

    if (backend === 'gemini') {
      const providers = await getEnabledProvidersFromProcessConfig();
      const legacy = await ProcessConfig.get('gemini.defaultModel');
      const inferred = inferIntentFromLegacyValue(providers, legacy, 'migration');
      const providerModel = inferred ? await resolveProcessProviderModelFromIntent(inferred) : null;
      return {
        backend,
        currentModelId: providerModel?.useModel,
        providerModel: providerModel ?? undefined,
        source: providerModel ? 'legacy-backend-config' : 'fallback',
      };
    }

    const saved = await ProcessConfig.get('aionrs.defaultModel');
    const providers = await getEnabledProvidersFromProcessConfig();
    const inferred = inferIntentFromLegacyValue(providers, saved, 'migration');
    const providerModel = inferred ? await resolveProcessProviderModelFromIntent(inferred) : null;
    return {
      backend,
      currentModelId: providerModel?.useModel,
      providerModel: providerModel ?? undefined,
      source: providerModel ? 'legacy-backend-config' : 'fallback',
    };
  }

  const currentModelId = await resolveLegacyAcpModelId(backend, true);
  return {
    backend,
    currentModelId,
    source: currentModelId ? 'legacy-backend-config' : 'fallback',
  };
}
