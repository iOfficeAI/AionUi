/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IProvider, TProviderWithModel } from '@/common/config/storage';
import { useModelProviderList } from '@/renderer/hooks/agent/useModelProviderList';
import { readAutoModelSettings, resolveAutoModel } from '@/renderer/utils/autoModel';
import { Message } from '@arco-design/web-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type AionrsModelSelection = {
  current_model?: TProviderWithModel;
  /** Conversation is in Auto mode (concrete model still on current_model). */
  autoEnabled: boolean;
  providers: IProvider[];
  getAvailableModels: (provider: IProvider) => string[];
  handleSelectModel: (provider: IProvider, modelName: string) => Promise<void>;
  handleSelectAuto: () => Promise<void>;
  getDisplayModelName: (modelName?: string) => string;
};

export type UseAionrsModelSelectionOptions = {
  initialModel: TProviderWithModel | undefined;
  initialAutoEnabled?: boolean;
  onSelectModel: (
    provider: IProvider,
    modelName: string,
    meta?: { autoEnabled: boolean }
  ) => Promise<boolean>;
};

export const useAionrsModelSelection = ({
  initialModel,
  initialAutoEnabled = false,
  onSelectModel,
}: UseAionrsModelSelectionOptions): AionrsModelSelection => {
  const { t } = useTranslation();
  const [current_model, setCurrentModel] = useState<TProviderWithModel | undefined>(initialModel);
  const [autoEnabled, setAutoEnabled] = useState(initialAutoEnabled);

  useEffect(() => {
    setCurrentModel(initialModel);
  }, [initialModel?.id, initialModel?.use_model]);

  useEffect(() => {
    setAutoEnabled(initialAutoEnabled);
  }, [initialAutoEnabled]);

  const { providers: allProviders, getAvailableModels, formatModelLabel } = useModelProviderList();

  // AionCore does not support Google Auth — filter it out
  const providers = useMemo(
    () => allProviders.filter((p) => !p.platform?.toLowerCase().includes('gemini-with-google-auth')),
    [allProviders]
  );

  const handleSelectModel = useCallback(
    async (provider: IProvider, modelName: string) => {
      const selected = {
        ...(provider as unknown as TProviderWithModel),
        use_model: modelName,
      } as TProviderWithModel;
      const ok = await onSelectModel(provider, modelName, { autoEnabled: false });
      if (ok) {
        setCurrentModel(selected);
        setAutoEnabled(false);
      }
    },
    [onSelectModel]
  );

  const handleSelectAuto = useCallback(async () => {
    try {
      const resolved = resolveAutoModel({
        phase: 'worker',
        settings: readAutoModelSettings(),
        providers,
        getAvailableModels,
      });
      const ok = await onSelectModel(resolved.model as unknown as IProvider, resolved.model.use_model, {
        autoEnabled: true,
      });
      if (ok) {
        setCurrentModel(resolved.model);
        setAutoEnabled(true);
      }
    } catch (error) {
      console.error('Failed to resolve Auto model:', error);
      Message.warning(t('conversation.autoModel.noCandidates', { defaultValue: 'No available models for Auto' }));
    }
  }, [getAvailableModels, onSelectModel, providers, t]);

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
    autoEnabled,
    providers,
    getAvailableModels,
    handleSelectModel,
    handleSelectAuto,
    getDisplayModelName,
  };
};
