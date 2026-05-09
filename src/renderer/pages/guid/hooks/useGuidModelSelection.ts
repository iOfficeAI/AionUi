/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IProvider, TProviderWithModel } from '@/common/config/storage';
import { ConfigStorage } from '@/common/config/storage';
import { uuid } from '@/common/utils';
import { useGeminiGoogleAuthModels } from '@/renderer/hooks/agent/useGeminiGoogleAuthModels';
import {
  isDefaultModelIntent,
  resolveModelFromIntent,
  toDefaultModelIntent,
} from '../utils/defaultModelIntent';
import { hasAvailableModels } from '../utils/modelUtils';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';

/**
 * Build a unique key for a provider/model pair.
 */
const buildModelKey = (providerId?: string, modelName?: string) => {
  if (!providerId || !modelName) return null;
  return `${providerId}:${modelName}`;
};

const buildIntentSyncKey = (intent?: { providerId?: string; modelId?: string } | null) => {
  if (!intent?.providerId || !intent?.modelId) return null;
  return `${intent.providerId}:${intent.modelId}`;
};

/**
 * Check if a model key still exists in the provider list.
 */
const isModelKeyAvailable = (key: string | null, providers?: IProvider[]) => {
  if (!key || !providers || providers.length === 0) return false;
  return providers.some((provider) => {
    if (!provider.id || !provider.model?.length) return false;
    return provider.model.some((modelName) => buildModelKey(provider.id, modelName) === key);
  });
};

/** Provider-based agent keys that share the model list UI */
type ProviderAgentKey = 'gemini' | 'aionrs';

/** Map agent key → storage key for persisting default model */
const MODEL_STORAGE_KEY: Record<ProviderAgentKey, 'gemini.defaultModel' | 'aionrs.defaultModel'> = {
  gemini: 'gemini.defaultModel',
  aionrs: 'aionrs.defaultModel',
};

export type GuidModelSelectionResult = {
  modelList: IProvider[];
  isGoogleAuth: boolean;
  geminiModeOptions: ReturnType<typeof useGeminiGoogleAuthModels>['geminiModeOptions'];
  geminiModeLookup: Map<string, ReturnType<typeof useGeminiGoogleAuthModels>['geminiModeOptions'][number]>;
  formatGeminiModelLabel: (provider: { platform?: string } | undefined, modelName?: string) => string;
  currentModel: TProviderWithModel | undefined;
  setCurrentModel: (modelInfo: TProviderWithModel) => Promise<void>;
  awaitPendingModelSync: () => Promise<void>;
};

/**
 * Hook that manages Gemini model list and selection state for the Guid page.
 * @param agentKey - current provider-based agent ('gemini' | 'aionrs'), defaults to 'gemini'
 */
export const useGuidModelSelection = (agentKey: ProviderAgentKey = 'gemini'): GuidModelSelectionResult => {
  const { geminiModeOptions, isGoogleAuth } = useGeminiGoogleAuthModels();
  const { data: modelConfig } = useSWR('model.config.welcome', () => {
    return ipcBridge.mode.getModelConfig.invoke().then((data) => {
      return (data || []).filter((platform) => !!platform.model.length);
    });
  });

  const geminiModelValues = useMemo(() => geminiModeOptions.map((option) => option.value), [geminiModeOptions]);

  const modelList = useMemo(() => {
    let allProviders: IProvider[] = [];

    // Only expose the Gemini Google Auth provider when the current agent is
    // 'gemini'. Other provider-based agents (e.g. aionrs) do not support
    // Google login, so surfacing this provider would make the default-model
    // fallback pick a Gemini auto model by mistake.
    if (isGoogleAuth && agentKey === 'gemini') {
      const geminiProvider: IProvider = {
        id: uuid(),
        name: 'Gemini Google Auth',
        platform: 'gemini-with-google-auth',
        baseUrl: '',
        apiKey: '',
        model: geminiModelValues,
        capabilities: [{ type: 'text' }, { type: 'vision' }, { type: 'function_calling' }],
      };
      allProviders = [geminiProvider, ...(modelConfig || [])];
    } else {
      allProviders = modelConfig || [];
    }

    return allProviders.filter(hasAvailableModels);
  }, [agentKey, geminiModelValues, isGoogleAuth, modelConfig]);

  const geminiModeLookup = useMemo(() => {
    const lookup = new Map<string, (typeof geminiModeOptions)[number]>();
    geminiModeOptions.forEach((option) => lookup.set(option.value, option));
    return lookup;
  }, [geminiModeOptions]);

  const formatGeminiModelLabel = useCallback(
    (provider: { platform?: string } | undefined, modelName?: string) => {
      if (!modelName) return '';
      const isGoogleProvider = provider?.platform?.toLowerCase().includes('gemini-with-google-auth');
      if (isGoogleProvider) {
        return geminiModeLookup.get(modelName)?.label || modelName;
      }
      return modelName;
    },
    [geminiModeLookup]
  );

  const [currentModel, _setCurrentModel] = useState<TProviderWithModel>();
  const selectedModelKeyRef = useRef<string | null>(null);
  const prevStorageKeyRef = useRef<string | null>(null);
  const pendingModelSyncRef = useRef<Promise<void> | null>(null);
  const lastSyncedIntentKeyRef = useRef<string | null>(null);

  const storageKey = MODEL_STORAGE_KEY[agentKey];

  const awaitPendingModelSync = useCallback(async () => {
    const pendingSync = pendingModelSyncRef.current;
    if (pendingSync) {
      await pendingSync;
    }
  }, []);

  const syncDefaultModelIntent = useCallback(async (intent: ReturnType<typeof toDefaultModelIntent>) => {
    const intentKey = buildIntentSyncKey(intent);
    if (!intentKey) {
      return;
    }

    const pendingSync = pendingModelSyncRef.current;
    if (lastSyncedIntentKeyRef.current === intentKey && !pendingSync) {
      return;
    }

    const syncTask = ipcBridge.mode
      .syncDefaultModelBackends.invoke({ intent, backends: ['openclaw-gateway', 'claude', 'hermes', 'opencode'] })
      .then(() => {
        lastSyncedIntentKeyRef.current = intentKey;
      })
      .catch((error) => {
        console.error('Failed to sync default model intent:', error);
      });

    pendingModelSyncRef.current = syncTask;
    void syncTask.finally(() => {
      if (pendingModelSyncRef.current === syncTask) {
        pendingModelSyncRef.current = null;
      }
    });
  }, []);

  const applyCurrentModel = useCallback(
    async (modelInfo: TProviderWithModel, persistIntent: boolean) => {
      selectedModelKeyRef.current = buildModelKey(modelInfo.id, modelInfo.useModel);
      const primaryWrites: Promise<unknown>[] = [
        ConfigStorage.set(storageKey, { id: modelInfo.id, useModel: modelInfo.useModel }).catch((error) => {
          console.error('Failed to save default model:', error);
        }),
      ];

      let intent: ReturnType<typeof toDefaultModelIntent> | null = null;
      if (persistIntent) {
        intent = toDefaultModelIntent(modelInfo);
        primaryWrites.push(
          ConfigStorage.set('agent.defaultModelIntent', intent).catch((error) => {
            console.error('Failed to save default model intent:', error);
          })
        );
      }

      await Promise.all(primaryWrites);
      _setCurrentModel(modelInfo);

      if (!persistIntent || !intent) {
        return;
      }

      void syncDefaultModelIntent(intent);
    },
    [storageKey, syncDefaultModelIntent]
  );

  const setCurrentModel = useCallback(
    async (modelInfo: TProviderWithModel) => {
      await applyCurrentModel(modelInfo, true);
    },
    [applyCurrentModel]
  );

  // Set default model when modelList or agent changes
  useEffect(() => {
    const setDefaultModel = async () => {
      if (!modelList || modelList.length === 0) {
        return;
      }
      // When agent switches, reset selection so we reload from the new storage key
      const agentChanged = prevStorageKeyRef.current !== null && prevStorageKeyRef.current !== storageKey;
      prevStorageKeyRef.current = storageKey;
      if (agentChanged) {
        selectedModelKeyRef.current = null;
      }

      const currentKey = selectedModelKeyRef.current || buildModelKey(currentModel?.id, currentModel?.useModel);
      if (!agentChanged && isModelKeyAvailable(currentKey, modelList)) {
        if (!selectedModelKeyRef.current && currentKey) {
          selectedModelKeyRef.current = currentKey;
        }
        return;
      }
      const savedIntent = await ConfigStorage.get('agent.defaultModelIntent');
      const intentMatch = isDefaultModelIntent(savedIntent) ? resolveModelFromIntent(modelList, savedIntent) : null;

      let defaultModel: IProvider | undefined;
      let resolvedUseModel = '';

      if (intentMatch) {
        defaultModel = intentMatch.provider;
        resolvedUseModel = intentMatch.useModel;
      } else {
        const savedModel = await ConfigStorage.get(storageKey);

        const isNewFormat = savedModel && typeof savedModel === 'object' && 'id' in savedModel;

        if (isNewFormat) {
          const { id, useModel } = savedModel;
          const exactMatch = modelList.find((m) => m.id === id);
          if (exactMatch && exactMatch.model.includes(useModel)) {
            defaultModel = exactMatch;
            resolvedUseModel = useModel;
          } else {
            defaultModel = modelList[0];
            resolvedUseModel = defaultModel?.model[0] ?? '';
          }
        } else if (typeof savedModel === 'string') {
          defaultModel = modelList.find((m) => m.model.includes(savedModel)) || modelList[0];
          resolvedUseModel = defaultModel?.model.includes(savedModel) ? savedModel : (defaultModel?.model[0] ?? '');
        } else {
          defaultModel = modelList[0];
          resolvedUseModel = defaultModel?.model[0] ?? '';
        }
      }

      if (!defaultModel || !resolvedUseModel) return;

      await applyCurrentModel(
        {
          ...defaultModel,
          useModel: resolvedUseModel,
        },
        false
      );

      if (intentMatch && isDefaultModelIntent(savedIntent)) {
        await syncDefaultModelIntent(savedIntent);
      }
    };

    setDefaultModel().catch((error) => {
      console.error('Failed to set default model:', error);
    });
  }, [applyCurrentModel, currentModel?.id, currentModel?.useModel, modelList, storageKey, syncDefaultModelIntent]);
  return {
    modelList,
    isGoogleAuth,
    geminiModeOptions,
    geminiModeLookup,
    formatGeminiModelLabel,
    currentModel,
    setCurrentModel,
    awaitPendingModelSync,
  };
};
