/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IProvider, TProviderWithModel } from '@/common/storage';
import { ConfigStorage } from '@/common/storage';
import { uuid } from '@/common/utils';
import { useGeminiGoogleAuthModels } from '@/renderer/hooks/useGeminiGoogleAuthModels';
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

export type GuidModelSelectionResult = {
  modelList: IProvider[];
  isGoogleAuth: boolean;
  geminiModeOptions: ReturnType<typeof useGeminiGoogleAuthModels>['geminiModeOptions'];
  geminiModeLookup: Map<string, ReturnType<typeof useGeminiGoogleAuthModels>['geminiModeOptions'][number]>;
  formatGeminiModelLabel: (provider: { platform?: string } | undefined, modelName?: string) => string;
  currentModel: TProviderWithModel | undefined;
  setCurrentModel: (modelInfo: TProviderWithModel) => Promise<void>;
};

/**
 * Hook that manages Gemini model list and selection state for the Guid page.
 */
export const useGuidModelSelection = (): GuidModelSelectionResult => {
  const { geminiModeOptions, isGoogleAuth } = useGeminiGoogleAuthModels();
  const { data: modelConfig } = useSWR('model.config.welcome', () => {
    return ipcBridge.mode.getModelConfig.invoke().then((data) => {
      return (data || []).filter((platform) => !!platform.model.length);
    });
  });

  const geminiModelValues = useMemo(() => geminiModeOptions.map((option) => option.value), [geminiModeOptions]);

  const modelList = useMemo(() => {
    let allProviders: IProvider[] = [];

    if (isGoogleAuth) {
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
  }, [geminiModelValues, isGoogleAuth, modelConfig]);

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

  const setCurrentModel = useCallback(async (modelInfo: TProviderWithModel) => {
    selectedModelKeyRef.current = buildModelKey(modelInfo.id, modelInfo.useModel);
    await ConfigStorage.set('gemini.defaultModel', { id: modelInfo.id, useModel: modelInfo.useModel }).catch((error) => {
      console.error('Failed to save default model:', error);
    });
    _setCurrentModel(modelInfo);
  }, []);

  // Set default model when modelList changes
  useEffect(() => {
    const setDefaultModel = async () => {
      if (!modelList || modelList.length === 0) {
        return;
      }
      const currentKey = selectedModelKeyRef.current || buildModelKey(currentModel?.id, currentModel?.useModel);
      if (isModelKeyAvailable(currentKey, modelList)) {
        if (!selectedModelKeyRef.current && currentKey) {
          selectedModelKeyRef.current = currentKey;
        }
        return;
      }
      const savedModel = await ConfigStorage.get('gemini.defaultModel');

      const isNewFormat = savedModel && typeof savedModel === 'object' && 'id' in savedModel;

      let defaultModel: IProvider | undefined;
      let resolvedUseModel: string;

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

      if (!defaultModel || !resolvedUseModel) return;

      await setCurrentModel({
        ...defaultModel,
        useModel: resolvedUseModel,
      });
    };

    setDefaultModel().catch((error) => {
      console.error('Failed to set default model:', error);
    });
  }, [modelList]);
  return {
    modelList,
    isGoogleAuth,
    geminiModeOptions,
    geminiModeLookup,
    formatGeminiModelLabel,
    currentModel,
    setCurrentModel,
  };
};
