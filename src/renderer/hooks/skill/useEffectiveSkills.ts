/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { AssistantSkillConfig, EffectiveSkills } from '@process/skills/types';
import useSWR from 'swr';

/**
 * useEffectiveSkills — compute the final skill set for a specific assistant.
 *
 * Fetches the effective skill list from the main process via IPC,
 * given the assistant's per-assistant override config.
 *
 * Returns `null` while loading or when `assistantConfig` is not provided.
 */
export function useEffectiveSkills(assistantConfig: AssistantSkillConfig | null | undefined) {
  const key = assistantConfig
    ? ['skill.computeEffective', JSON.stringify(assistantConfig.added), JSON.stringify(assistantConfig.blocked)]
    : null;

  const { data, isLoading, mutate } = useSWR<EffectiveSkills>(
    key,
    () => {
      if (!assistantConfig) return Promise.resolve({ skills: [], sources: {} });
      return ipcBridge.skill.computeEffective.invoke({ assistantConfig });
    },
    { revalidateOnFocus: false }
  );

  return {
    effectiveSkills: data ?? null,
    loading: isLoading,
    refresh: mutate,
  };
}
