/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IProvider, TProviderWithModel } from '@/common/config/storage';
import { configService } from '@/common/config/configService';
import { ipcBridge } from '@/common';
import {
  getManagedCliSelectableModels,
  MANAGED_NEWAPI_PROVIDER_DISPLAY_NAME,
  MANAGED_NEWAPI_PROVIDER_ID,
  resolveManagedRuntimeCliTarget,
} from '@/common/types/agent/managedRuntimeCli';
import { useGoogleAuthModels } from '@/renderer/hooks/agent/useGoogleAuthModels';
import { useProvidersQuery } from '@/renderer/hooks/agent/useModelProviderList';
import { useNewApiAccount } from '@/renderer/hooks/context/NewApiAccountContext';
import { hasAvailableModels } from '../utils/modelUtils';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const buildModelKey = (providerId?: string, modelName?: string) => {
  if (!providerId || !modelName) return null;
  return `${providerId}:${modelName}`;
};

const isModelKeyAvailable = (key: string | null, providers?: IProvider[]) => {
  if (!key || !providers || providers.length === 0) return false;
  return providers.some((provider) => {
    if (!provider.id || !provider.models?.length) return false;
    return provider.models.some((modelName) => buildModelKey(provider.id, modelName) === key);
  });
};

type ProviderAgentKey = 'aionrs' | 'claude' | 'hermes' | 'opencode' | 'openclaw';

const MODEL_STORAGE_KEY: Record<ProviderAgentKey, 'aionrs.defaultModel' | 'acp.config'> = {
  aionrs: 'aionrs.defaultModel',
  claude: 'acp.config',
  hermes: 'acp.config',
  opencode: 'acp.config',
  openclaw: 'acp.config',
};

export type GuidModelSelectionResult = {
  modelList: IProvider[];
  isGoogleAuth: boolean;
  formatGeminiModelLabel: (provider: { platform?: string } | undefined, modelName?: string) => string;
  current_model: TProviderWithModel | undefined;
  setCurrentModel: (model_info: TProviderWithModel) => Promise<void>;
};

export const useGuidModelSelection = (agentKey: ProviderAgentKey = 'aionrs'): GuidModelSelectionResult => {
  const { isGoogleAuth } = useGoogleAuthModels();
  const { data: modelConfig } = useProvidersQuery();
  const { isLoggedIn: isManagedNewApiLoggedIn } = useNewApiAccount();

  const managedProvider = useMemo(
    () => modelConfig?.find((provider) => provider.id === MANAGED_NEWAPI_PROVIDER_ID),
    [modelConfig]
  );
  const managedModels = useMemo(() => getManagedCliSelectableModels(managedProvider), [managedProvider]);
  const useManagedCliModels = agentKey !== 'aionrs' && isManagedNewApiLoggedIn && managedModels.length > 0;

  const modelList = useMemo(() => {
    if (useManagedCliModels) {
      return [
        {
          id: MANAGED_NEWAPI_PROVIDER_ID,
          name: MANAGED_NEWAPI_PROVIDER_DISPLAY_NAME,
          platform: 'new-api',
          base_url: managedProvider?.base_url || '',
          api_key: '',
          model: managedModels,
          models: managedModels,
          enabled: true,
          model_enabled: Object.fromEntries(managedModels.map((modelId) => [modelId, true])),
          model_health: managedProvider?.model_health,
        } as IProvider,
      ];
    }

    const allProviders: IProvider[] = (modelConfig || []).filter((platform) => !!platform.models.length);
    return allProviders.filter(hasAvailableModels);
  }, [
    agentKey,
    managedModels,
    managedProvider?.base_url,
    managedProvider?.model_health,
    modelConfig,
    useManagedCliModels,
  ]);

  const formatGeminiModelLabel = useCallback((_provider: { platform?: string } | undefined, modelName?: string) => {
    if (!modelName) return '';
    return modelName;
  }, []);

  const [current_model, _setCurrentModel] = useState<TProviderWithModel>();
  const selectedModelKeyRef = useRef<string | null>(null);
  const prevAgentKeyRef = useRef<ProviderAgentKey | null>(null);

  const storageKey = MODEL_STORAGE_KEY[agentKey];

  const setCurrentModel = useCallback(
    async (model_info: TProviderWithModel) => {
      selectedModelKeyRef.current = buildModelKey(model_info.id, model_info.use_model);

      if (agentKey === 'aionrs') {
        await configService.set(storageKey, { id: model_info.id, use_model: model_info.use_model }).catch((error) => {
          console.error('Failed to save default model:', error);
        });
      } else {
        const cliTarget = resolveManagedRuntimeCliTarget(agentKey);
        if (cliTarget && useManagedCliModels && model_info.use_model) {
          const nextPrefs = {
            ...configService.get('newApi.desktop.cliModelPrefs'),
            [cliTarget]: model_info.use_model,
          };
          await configService.set('newApi.desktop.cliModelPrefs', nextPrefs).catch((error) => {
            console.error('Failed to save managed CLI model preference:', error);
          });
          await ipcBridge.newApiAccount.reconcileModel
            .invoke({ cliTarget, modelId: model_info.use_model })
            .catch((error) => {
              console.error('Failed to reconcile managed CLI model:', error);
            });
        }
      }

      _setCurrentModel(model_info);
    },
    [agentKey, storageKey, useManagedCliModels]
  );

  useEffect(() => {
    const setDefaultModel = async () => {
      if (!modelList || modelList.length === 0) return;

      const agentChanged = prevAgentKeyRef.current !== null && prevAgentKeyRef.current !== agentKey;
      prevAgentKeyRef.current = agentKey;
      if (agentChanged) {
        selectedModelKeyRef.current = null;
      }

      const currentKey = selectedModelKeyRef.current || buildModelKey(current_model?.id, current_model?.use_model);
      if (!agentChanged && isModelKeyAvailable(currentKey, modelList)) {
        if (!selectedModelKeyRef.current && currentKey) {
          selectedModelKeyRef.current = currentKey;
        }
        return;
      }

      let defaultModel: IProvider | undefined;
      let resolvedUseModel = '';

      if (agentKey === 'aionrs') {
        const savedModel = configService.get(storageKey);
        const isNewFormat = savedModel && typeof savedModel === 'object' && 'id' in savedModel;

        if (isNewFormat) {
          const { id, use_model } = savedModel as { id?: string; use_model?: string };
          const exactMatch = modelList.find((m) => m.id === id);
          if (exactMatch && use_model && exactMatch.models.includes(use_model)) {
            defaultModel = exactMatch;
            resolvedUseModel = use_model;
          }
        } else if (typeof savedModel === 'string') {
          defaultModel = modelList.find((m) => m.models.includes(savedModel)) || modelList[0];
          resolvedUseModel = defaultModel?.models.includes(savedModel) ? savedModel : '';
        }
      } else {
        defaultModel = modelList[0];
        const managedPrefs = configService.get('newApi.desktop.cliModelPrefs');
        const cliTarget = resolveManagedRuntimeCliTarget(agentKey);
        const preferredManagedModel = cliTarget ? managedPrefs?.[cliTarget]?.trim() : '';
        resolvedUseModel =
          (preferredManagedModel && managedModels.includes(preferredManagedModel) ? preferredManagedModel : '') ||
          managedModels[0] ||
          '';
      }

      defaultModel = defaultModel || modelList[0];
      resolvedUseModel = resolvedUseModel || defaultModel?.models?.[0] || '';
      if (!defaultModel || !resolvedUseModel) return;

      selectedModelKeyRef.current = buildModelKey(defaultModel.id, resolvedUseModel);
      _setCurrentModel({
        ...defaultModel,
        use_model: resolvedUseModel,
      });
    };

    void setDefaultModel();
  }, [agentKey, current_model?.id, current_model?.use_model, managedModels, modelList, storageKey]);

  return {
    modelList,
    isGoogleAuth,
    formatGeminiModelLabel,
    current_model,
    setCurrentModel,
  };
};
