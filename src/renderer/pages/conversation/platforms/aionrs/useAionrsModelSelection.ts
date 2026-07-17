/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IProvider, TProviderWithModel } from '@/common/config/storage';
import type { AionrsCapabilities } from '@process/agent/aionrs/protocol';
import { useModelProviderList } from '@/renderer/hooks/agent/useModelProviderList';
import { useCallback, useEffect, useMemo, useState } from 'react';

export type AionrsRuntimeModelInfo = NonNullable<AionrsCapabilities['available_models']>[number];

export type AionrsModelSelection = {
  currentModel?: TProviderWithModel;
  currentModelInfo?: AionrsRuntimeModelInfo;
  providers: IProvider[];
  getAvailableModels: (provider: IProvider) => string[];
  handleSelectModel: (provider: IProvider, modelName: string) => Promise<void>;
  getDisplayModelName: (modelName?: string, options?: { truncate?: boolean }) => string;
};

export type UseAionrsModelSelectionOptions = {
  initialModel: TProviderWithModel | undefined;
  onSelectModel: (provider: IProvider, modelName: string) => Promise<boolean>;
  runtimeCapabilities?: AionrsCapabilities | null;
};

const isChatgptProvider = (provider: { platform?: string } | undefined): boolean => provider?.platform === 'chatgpt';

const mergeModelIds = (primary: readonly string[], secondary: readonly string[]): string[] => {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const modelId of [...primary, ...secondary]) {
    if (!modelId || seen.has(modelId)) {
      continue;
    }
    seen.add(modelId);
    merged.push(modelId);
  }

  return merged;
};

export const useAionrsModelSelection = ({
  initialModel,
  onSelectModel,
  runtimeCapabilities,
}: UseAionrsModelSelectionOptions): AionrsModelSelection => {
  const [currentModel, setCurrentModel] = useState<TProviderWithModel | undefined>(initialModel);

  useEffect(() => {
    setCurrentModel(initialModel);
  }, [initialModel?.id, initialModel?.useModel]);

  const { providers: allProviders, getAvailableModels: getConfiguredModels, formatModelLabel } = useModelProviderList();

  const runtimeModels = useMemo(
    () => runtimeCapabilities?.available_models ?? [],
    [runtimeCapabilities?.available_models]
  );
  const runtimeModelMap = useMemo(() => new Map(runtimeModels.map((model) => [model.id, model])), [runtimeModels]);
  const useRuntimeModels = useMemo(() => {
    if (!currentModel?.useModel || runtimeModels.length === 0) {
      return false;
    }

    if (runtimeCapabilities?.current_model === currentModel.useModel) {
      return true;
    }

    return runtimeModelMap.has(currentModel.useModel);
  }, [currentModel?.useModel, runtimeCapabilities?.current_model, runtimeModelMap, runtimeModels.length]);

  // AionCLI does not support Google Auth 鈥?filter it out
  const providers = useMemo(
    () => allProviders.filter((provider) => !provider.platform?.toLowerCase().includes('gemini-with-google-auth')),
    [allProviders]
  );

  const handleSelectModel = useCallback(
    async (provider: IProvider, modelName: string) => {
      const selected = {
        ...(provider as unknown as TProviderWithModel),
        useModel: modelName,
      } as TProviderWithModel;
      const ok = await onSelectModel(provider, modelName);
      if (ok) {
        setCurrentModel(selected);
      }
    },
    [onSelectModel]
  );

  const getAvailableModels = useCallback(
    (provider: IProvider) => {
      const configuredModels = getConfiguredModels(provider);
      if (useRuntimeModels && provider.id === currentModel?.id) {
        const runtimeModelIds = runtimeModels.map((model) => model.id);
        if (isChatgptProvider(currentModel) || isChatgptProvider(provider)) {
          return mergeModelIds(configuredModels, runtimeModelIds);
        }
        return runtimeModelIds;
      }
      return configuredModels;
    },
    [currentModel, getConfiguredModels, runtimeModels, useRuntimeModels]
  );

  const getDisplayModelName = useCallback(
    (modelName?: string, options?: { truncate?: boolean }) => {
      if (!modelName) {
        return '';
      }

      const runtimeLabel = useRuntimeModels ? runtimeModelMap.get(modelName)?.display_name : undefined;
      const label = runtimeLabel || formatModelLabel(currentModel, modelName);

      if (options?.truncate === false) {
        return label;
      }

      const maxLength = 20;
      return label.length > maxLength ? `${label.slice(0, maxLength)}...` : label;
    },
    [currentModel, formatModelLabel, runtimeModelMap, useRuntimeModels]
  );

  const currentModelInfo = useMemo(
    () => (useRuntimeModels && currentModel?.useModel ? runtimeModelMap.get(currentModel.useModel) : undefined),
    [currentModel?.useModel, runtimeModelMap, useRuntimeModels]
  );

  return {
    currentModel,
    currentModelInfo,
    providers,
    getAvailableModels,
    handleSelectModel,
    getDisplayModelName,
  };
};
