/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IProvider, TProviderWithModel } from '@/common/config/storage';
import { useModelProviderList } from '@/renderer/hooks/agent/useModelProviderList';
import { readAutoModelSettings, resolveAutoModel, type AutoModelPhase } from '@/renderer/utils/autoModel';
import { Message } from '@arco-design/web-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type AionrsModelSelection = {
  current_model?: TProviderWithModel;
  /** Conversation is in Auto mode (concrete model still on current_model). */
  autoEnabled: boolean;
  /** Last Auto phase used for pill display (Phase 2). */
  autoPhase?: AutoModelPhase;
  providers: IProvider[];
  getAvailableModels: (provider: IProvider) => string[];
  handleSelectModel: (provider: IProvider, modelName: string) => Promise<void>;
  handleSelectAuto: () => Promise<void>;
  /** Sync local selection after per-turn Auto routing. */
  syncAutoResolved: (model: TProviderWithModel, phase: AutoModelPhase) => void;
  getDisplayModelName: (modelName?: string) => string;
};

export type UseAionrsModelSelectionOptions = {
  initialModel: TProviderWithModel | undefined;
  initialAutoEnabled?: boolean;
  initialAutoPhase?: AutoModelPhase;
  onSelectModel: (provider: IProvider, modelName: string, meta?: { autoEnabled: boolean }) => Promise<boolean>;
};

export const useAionrsModelSelection = ({
  initialModel,
  initialAutoEnabled = false,
  initialAutoPhase,
  onSelectModel,
}: UseAionrsModelSelectionOptions): AionrsModelSelection => {
  const { t } = useTranslation();
  const [current_model, setCurrentModel] = useState<TProviderWithModel | undefined>(initialModel);
  const [autoEnabled, setAutoEnabled] = useState(initialAutoEnabled);
  const [autoPhase, setAutoPhase] = useState<AutoModelPhase | undefined>(initialAutoPhase);

  useEffect(() => {
    setCurrentModel(initialModel);
  }, [initialModel?.id, initialModel?.use_model]);

  useEffect(() => {
    setAutoEnabled(initialAutoEnabled);
  }, [initialAutoEnabled]);

  useEffect(() => {
    setAutoPhase(initialAutoPhase);
  }, [initialAutoPhase]);

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
        setAutoPhase(undefined);
      }
    },
    [onSelectModel]
  );

  const handleSelectAuto = useCallback(async () => {
    try {
      // Sticky pick uses worker as the default concrete model; Phase 2 send path
      // re-resolves planner/worker per turn.
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
        setAutoPhase('worker');
      }
    } catch (error) {
      console.error('Failed to resolve Auto model:', error);
      Message.warning(t('conversation.autoModel.noCandidates', { defaultValue: 'No available models for Auto' }));
    }
  }, [getAvailableModels, onSelectModel, providers, t]);

  const syncAutoResolved = useCallback((model: TProviderWithModel, phase: AutoModelPhase) => {
    setCurrentModel(model);
    setAutoEnabled(true);
    setAutoPhase(phase);
  }, []);

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
    autoPhase,
    providers,
    getAvailableModels,
    handleSelectModel,
    handleSelectAuto,
    syncAutoResolved,
    getDisplayModelName,
  };
};
