import type { IProvider, TProviderWithModel } from '@/common/storage';
import type { GeminiModeOption } from '@/renderer/hooks/useModeModeList';
import { useModelProviderList } from '@/renderer/hooks/useModelProviderList';
import { useCallback, useEffect, useState } from 'react';

export interface GeminiModelSelection {
  currentModel?: TProviderWithModel;
  providers: IProvider[];
  geminiModeLookup: Map<string, GeminiModeOption>;
  formatModelLabel: (provider?: { platform?: string }, modelName?: string) => string;
  getDisplayModelName: (modelName?: string) => string;
  getAvailableModels: (provider: IProvider) => string[];
  handleSelectModel: (provider: IProvider, modelName: string) => Promise<void>;
}

export interface UseGeminiModelSelectionOptions {
  initialModel: TProviderWithModel | undefined;
  onSelectModel: (provider: IProvider, modelName: string) => Promise<boolean>;
}

// Centralize model selection logic for reuse across header, send box, and channel settings
export const useGeminiModelSelection = ({ initialModel, onSelectModel }: UseGeminiModelSelectionOptions): GeminiModelSelection => {
  const [currentModel, setCurrentModel] = useState<TProviderWithModel | undefined>(initialModel);

  useEffect(() => {
    setCurrentModel(initialModel);
  }, [initialModel?.id, initialModel?.useModel]);

  const { providers, geminiModeLookup, getAvailableModels, formatModelLabel } = useModelProviderList();

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
      const label = formatModelLabel(currentModel, modelName);
      const maxLength = 20;
      return label.length > maxLength ? `${label.slice(0, maxLength)}...` : label;
    },
    [currentModel, formatModelLabel]
  );

  return {
    currentModel,
    providers,
    geminiModeLookup,
    formatModelLabel,
    getDisplayModelName,
    getAvailableModels,
    handleSelectModel,
  };
};
