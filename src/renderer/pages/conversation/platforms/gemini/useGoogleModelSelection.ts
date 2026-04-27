import type { IProvider, TProviderWithModel } from '@/common/config/storage';
import { useModelProviderList } from '@/renderer/hooks/agent/useModelProviderList';
import { useCallback, useEffect, useState } from 'react';

export interface GoogleModelSelection {
  current_model?: TProviderWithModel;
  providers: IProvider[];
  formatModelLabel: (provider?: { platform?: string }, modelName?: string) => string;
  getDisplayModelName: (modelName?: string) => string;
  getAvailableModels: (provider: IProvider) => string[];
  handleSelectModel: (provider: IProvider, modelName: string) => Promise<void>;
}

export interface UseGoogleModelSelectionOptions {
  initialModel: TProviderWithModel | undefined;
  onSelectModel: (provider: IProvider, modelName: string) => Promise<boolean>;
}

// Centralize model selection logic for reuse across header, send box, and channel settings
export const useGoogleModelSelection = ({
  initialModel,
  onSelectModel,
}: UseGoogleModelSelectionOptions): GoogleModelSelection => {
  const [current_model, setCurrentModel] = useState<TProviderWithModel | undefined>(initialModel);

  useEffect(() => {
    setCurrentModel(initialModel);
  }, [initialModel?.id, initialModel?.useModel]);

  const { providers, getAvailableModels, formatModelLabel } = useModelProviderList();

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

  const getDisplayModelName = useCallback(
    (modelName?: string) => {
      if (!modelName) return '';
      const label = formatModelLabel(current_model, modelName);
      const maxLength = 20;
      return label.length > maxLength ? `${label.slice(0, maxLength)}...` : label;
    },
    [current_model, formatModelLabel]
  );

  return {
    current_model,
    providers,
    formatModelLabel,
    getDisplayModelName,
    getAvailableModels,
    handleSelectModel,
  };
};
