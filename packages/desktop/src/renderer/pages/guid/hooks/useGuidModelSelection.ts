/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IProvider, TProviderWithModel } from '@/common/config/storage';
import { useGoogleAuthModels } from '@/renderer/hooks/agent/useGoogleAuthModels';
import { useProvidersQuery } from '@/renderer/hooks/agent/useModelProviderList';
import { hasAvailableModels, getAvailableModels } from '../utils/modelUtils';
import { readAutoModelSettings, resolveAutoModel } from '@/renderer/utils/autoModel';
import { Message } from '@arco-design/web-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

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
    if (!provider.id || !provider.models?.length) return false;
    return provider.models.some((modelName) => buildModelKey(provider.id, modelName) === key);
  });
};

/** Provider-based agent keys that share the model list UI */
type ProviderAgentKey = 'aionrs';

export type GuidModelSelectionResult = {
  modelList: IProvider[];
  isGoogleAuth: boolean;
  formatGeminiModelLabel: (provider: { platform?: string } | undefined, modelName?: string) => string;
  current_model: TProviderWithModel | undefined;
  autoEnabled: boolean;
  setCurrentModel: (model_info: TProviderWithModel, options?: { persistPreference?: boolean }) => Promise<void>;
  selectAutoModel: () => Promise<void>;
  resetCurrentModel: (options?: { persistPreference?: boolean }) => Promise<void>;
};

/**
 * Hook that manages the provider-backed model selection state for the Guid page.
 * Assistant-driven defaults are applied by the caller; this hook only owns the
 * transient in-page selection.
 * @param agentKey - current provider-based agent (currently only 'aionrs')
 */
export const useGuidModelSelection = (agentKey: ProviderAgentKey = 'aionrs'): GuidModelSelectionResult => {
  const { t } = useTranslation();
  const { isGoogleAuth } = useGoogleAuthModels();
  const { data: modelConfig } = useProvidersQuery();

  const modelList = useMemo(() => {
    const allProviders: IProvider[] = (modelConfig || []).filter((platform) => !!platform.models.length);
    return allProviders.filter(hasAvailableModels);
  }, [modelConfig]);

  const formatGeminiModelLabel = useCallback((_provider: { platform?: string } | undefined, modelName?: string) => {
    if (!modelName) return '';
    return modelName;
  }, []);

  const [current_model, _setCurrentModel] = useState<TProviderWithModel>();
  const [autoEnabled, setAutoEnabled] = useState(false);
  const selectedModelKeyRef = useRef<string | null>(null);

  const setCurrentModel = useCallback(
    async (model_info: TProviderWithModel, _options?: { persistPreference?: boolean }) => {
      selectedModelKeyRef.current = buildModelKey(model_info.id, model_info.use_model);
      _setCurrentModel(model_info);
      setAutoEnabled(false);
    },
    []
  );

  const selectAutoModel = useCallback(async () => {
    try {
      const resolved = resolveAutoModel({
        phase: 'planner',
        settings: readAutoModelSettings(),
        providers: modelList,
        getAvailableModels,
      });
      selectedModelKeyRef.current = buildModelKey(resolved.model.id, resolved.model.use_model);
      _setCurrentModel(resolved.model);
      setAutoEnabled(true);
    } catch (error) {
      console.error('Failed to resolve Auto model:', error);
      Message.warning(t('conversation.autoModel.noCandidates', { defaultValue: 'No available models for Auto' }));
    }
  }, [modelList, t]);

  const resetCurrentModel = useCallback(
    async (options?: { persistPreference?: boolean }) => {
      if (!modelList || modelList.length === 0) {
        return;
      }

      selectedModelKeyRef.current = null;
      setAutoEnabled(false);

      const defaultModel = modelList[0];
      const resolvedUseModel = defaultModel?.models[0] ?? '';

      if (!defaultModel || !resolvedUseModel) return;

      await setCurrentModel(
        {
          ...defaultModel,
          use_model: resolvedUseModel,
        },
        options
      );
    },
    [modelList, setCurrentModel]
  );

  // Set default model when modelList or agent changes
  useEffect(() => {
    const setDefaultModel = async () => {
      if (!modelList || modelList.length === 0) {
        return;
      }
      if (autoEnabled) {
        return;
      }
      const currentKey = selectedModelKeyRef.current || buildModelKey(current_model?.id, current_model?.use_model);
      if (isModelKeyAvailable(currentKey, modelList)) {
        if (!selectedModelKeyRef.current && currentKey) {
          selectedModelKeyRef.current = currentKey;
        }
        return;
      }
      await resetCurrentModel();
    };

    setDefaultModel().catch((error) => {
      console.error('Failed to set default model:', error);
    });
  }, [agentKey, autoEnabled, current_model?.id, current_model?.use_model, modelList, resetCurrentModel]);
  return {
    modelList,
    isGoogleAuth,
    formatGeminiModelLabel,
    current_model,
    autoEnabled,
    setCurrentModel,
    selectAutoModel,
    resetCurrentModel,
  };
};
