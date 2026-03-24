/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Skill Bridge — IPC providers for the new skill repository and global config channels.
 *
 * Implements:
 * - `skill.get-global-config`  — returns the full GlobalSkillConfig map
 * - `skill.set-global-enabled` — toggles a skill's global enabled state
 * - `skill.compute-effective`  — computes effective skills for an assistant config
 */

import { ipcBridge } from '@/common';
import { GlobalSkillConfigStore, SkillInjector } from '@process/skills';
import { getSystemDir } from '@process/utils/initStorage';

/**
 * Initialize the skill IPC bridge.
 * Must be called after initStorage has run so that getSystemDir() returns valid paths.
 */
export function initSkillBridge(): void {
  // skill.get-global-config — Return the full GlobalSkillConfig map
  ipcBridge.skill.getGlobalConfig.provider(async () => {
    const { workDir } = getSystemDir();
    const store = GlobalSkillConfigStore.getInstance(workDir);
    return store.load();
  });

  // skill.set-global-enabled — Toggle a skill's global enabled state
  ipcBridge.skill.setGlobalEnabled.provider(async ({ skillName, enabled }) => {
    const { workDir } = getSystemDir();
    const store = GlobalSkillConfigStore.getInstance(workDir);
    await store.updateSetting(skillName, { enabled, enabledAt: Date.now() });
    return { success: true, msg: `Skill "${skillName}" ${enabled ? 'enabled' : 'disabled'}` };
  });

  // skill.compute-effective — Compute effective skills for an assistant config
  ipcBridge.skill.computeEffective.provider(async ({ assistantConfig }) => {
    const { workDir } = getSystemDir();
    const injector = SkillInjector.getInstance();
    return injector.computeEffectiveSkills(assistantConfig, workDir);
  });
}
