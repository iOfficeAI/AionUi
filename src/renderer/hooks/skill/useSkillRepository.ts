/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { GlobalSkillConfig, SkillEntry } from '@process/skills/types';
import { useCallback, useState } from 'react';
import useSWR from 'swr';

export type { SkillEntry };

/**
 * useSkillRepository — renderer-side wrapper around the skill IPC channels.
 *
 * Provides:
 * - `skills`: list of all registered skills from SkillRepository (SWR-cached)
 * - `globalConfig`: persisted global enable/disable map (SWR-cached)
 * - `setGlobalEnabled`: toggle a skill's global enabled state
 * - `addSkill`: import a skill from a local path
 * - `removeSkill`: remove a skill by name
 * - `refresh`: force-revalidate both caches
 * - `loading`: true while either fetch is in flight
 */
export function useSkillRepository() {
  const [saving, setSaving] = useState(false);

  const {
    data: skills = [],
    isLoading: skillsLoading,
    mutate: mutateSkills,
  } = useSWR<SkillEntry[]>('skill.repositoryList', () => ipcBridge.skill.repositoryList.invoke(undefined), {
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

  /** Toggle a skill's global enabled state and optimistically update the cache. */
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
    [mutateConfig],
  );

  /** Import a skill into the repository from a local folder path. */
  const addSkill = useCallback(
    async (skillPath: string) => {
      await ipcBridge.skill.repositoryAdd.invoke({ skillPath, mode: 'custom' });
      await mutateSkills();
    },
    [mutateSkills],
  );

  /** Remove a skill from the repository by name. */
  const removeSkill = useCallback(
    async (name: string) => {
      await ipcBridge.skill.repositoryRemove.invoke({ name });
      await mutateSkills();
    },
    [mutateSkills],
  );

  return {
    skills,
    globalConfig,
    loading,
    saving,
    refresh,
    setGlobalEnabled,
    addSkill,
    removeSkill,
  };
}
