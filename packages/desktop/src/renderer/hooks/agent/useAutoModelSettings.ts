/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IProvider } from '@/common/config/storage';
import { useConfig } from '@/renderer/hooks/config/useConfig';
import {
  AUTO_MODEL_CONFIG_KEY,
  defaultAutoModelSettings,
  normalizeAutoModelSettings,
  type AutoModelPreference,
  type AutoModelSettings,
  type AutoModelSlotBinding,
  type AutoModelSlots,
} from '@/renderer/utils/autoModel';
import { useCallback, useMemo } from 'react';

export const useAutoModelSettings = () => {
  const [raw, setRaw] = useConfig(AUTO_MODEL_CONFIG_KEY);
  const settings = useMemo(() => normalizeAutoModelSettings(raw ?? defaultAutoModelSettings()), [raw]);

  const setSettings = useCallback(
    async (next: AutoModelSettings) => {
      await setRaw(normalizeAutoModelSettings(next));
    },
    [setRaw]
  );

  const setPreference = useCallback(
    async (preference: AutoModelPreference) => {
      await setSettings({ ...settings, preference });
    },
    [setSettings, settings]
  );

  const setSlot = useCallback(
    async (slot: keyof AutoModelSlots, binding: AutoModelSlotBinding) => {
      await setSettings({
        ...settings,
        slots: { ...settings.slots, [slot]: binding },
      });
    },
    [setSettings, settings]
  );

  return { settings, setSettings, setPreference, setSlot };
};

export const listSlotModelOptions = (
  providers: IProvider[],
  getAvailableModels: (provider: IProvider) => string[]
): Array<{ provider: IProvider; modelName: string; value: string }> => {
  const options: Array<{ provider: IProvider; modelName: string; value: string }> = [];
  for (const provider of providers) {
    if (provider.enabled === false) continue;
    for (const modelName of getAvailableModels(provider)) {
      options.push({
        provider,
        modelName,
        value: `${provider.id}::${modelName}`,
      });
    }
  }
  return options;
};
