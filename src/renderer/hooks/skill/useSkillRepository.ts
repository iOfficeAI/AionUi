/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { GlobalSkillConfig } from '@process/skills/types';
import { useCallback, useState } from 'react';
import useSWR from 'swr';

/**
 * Lightweight skill list item as returned by the IPC `list-available-skills` channel.
 */
export type SkillListItem = {
  name: string;
  description: string;
  location: string;
  isCustom: boolean;
};

/**
 * useSkillRepository — renderer-side wrapper around the skill IPC channels.
 *
 * Provides:
 * - `skills`: list of all installed skills (SWR-cached)
 * - `globalConfig`: persisted global enable/disable map (SWR-cached)
 * - `setGlobalEnabled`: toggle a skill's global enabled state
 * - `refresh`: force-revalidate both caches
 * - `loading`: true while either fetch is in flight
 */
export function useSkillRepository() {
  const [saving, setSaving] = useState(false);

  const {
    data: skills = [],
    isLoading: skillsLoading,
    mutate: mutateSkills,
  } = useSWR<SkillListItem[]>('skill.listAvailable', () => ipcBridge.fs.listAvailableSkills.invoke(), {
    revalidateOnFocus: false,
  });

  const {
    data: globalConfig = {},
    isLoading: configLoading,
    mutate: mutateConfig,
  } = useSWR<GlobalSkillConfig>('skill.globalConfig', () => ipcBridge.skill.getGlobalConfig.invoke(), {
    revalidateOnFocus: false,
  });

  const loading = skillsLoading || configLoading;

  const refresh = useCallback(async () => {
    await Promise.all([mutateSkills(), mutateConfig()]);
  }, [mutateSkills, mutateConfig]);

  /**
   * Toggle a skill's global enabled state and optimistically update the cache.
   */
  const setGlobalEnabled = useCallback(
    async (skillName: string, enabled: boolean) => {
      setSaving(true);
      try {
        await ipcBridge.skill.setGlobalEnabled.invoke({ skillName, enabled });
        await mutateConfig();
      } finally {
        setSaving(false);
      }
    },
    [mutateConfig]
  );

  return {
    skills,
    globalConfig,
    loading,
    saving,
    refresh,
    setGlobalEnabled,
  };
}
