/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';

/**
 * Thin pass-through over `ipcBridge.fs.readAssistant{Rule,Skill}`. The backend
 * performs source classification (builtin / user / extension) and serves the
 * appropriate rule md from the backend manifest, extension bundle, or user
 * directory. Callers no longer need to distinguish builtin vs. user here.
 *
 * `enabledSkills` / `disabledBuiltinSkills` are now part of the Assistant
 * record returned by `/api/assistants`; callers should read them directly from
 * there rather than via this helper. The two override hooks on
 * `PresetAssistantResourceDeps` are kept for backwards compatibility with
 * TeamSessionService, which still carries its own lookup path.
 */

export type PresetAssistantResourceDeps = {
  readAssistantRule: (args: { assistantId: string; locale: string }) => Promise<string>;
  readAssistantSkill: (args: { assistantId: string; locale: string }) => Promise<string>;
  getEnabledSkills: (custom_agent_id: string) => Promise<string[] | undefined>;
  getDisabledBuiltinSkills: (custom_agent_id: string) => Promise<string[] | undefined>;
  warn: (message: string, error?: unknown) => void;
};

export type LoadPresetAssistantResourcesOptions = {
  custom_agent_id?: string;
  localeKey: string;
  fallbackRules?: string;
};

export type PresetAssistantResources = {
  rules?: string;
  skills: string;
  enabled_skills?: string[];
  disabledBuiltinSkills?: string[];
};

const defaultDeps: PresetAssistantResourceDeps = {
  readAssistantRule: (args) => ipcBridge.fs.readAssistantRule.invoke(args),
  readAssistantSkill: (args) => ipcBridge.fs.readAssistantSkill.invoke(args),
  getEnabledSkills: async (custom_agent_id) => {
    try {
      const list = await ipcBridge.assistants.list.invoke();
      return list.find((a) => a.id === custom_agent_id)?.enabledSkills;
    } catch {
      return undefined;
    }
  },
  getDisabledBuiltinSkills: async (custom_agent_id) => {
    try {
      const list = await ipcBridge.assistants.list.invoke();
      return list.find((a) => a.id === custom_agent_id)?.disabledBuiltinSkills;
    } catch {
      return undefined;
    }
  },
  warn: (message, error) => {
    console.warn(message, error);
  },
};

export async function loadPresetAssistantResources(
  options: LoadPresetAssistantResourcesOptions,
  deps: PresetAssistantResourceDeps = defaultDeps
): Promise<PresetAssistantResources> {
  const { custom_agent_id, localeKey, fallbackRules } = options;

  if (!custom_agent_id) {
    return {
      rules: fallbackRules,
      skills: '',
      enabled_skills: undefined,
      disabledBuiltinSkills: undefined,
    };
  }

  let rules = '';
  let skills = '';

  try {
    rules = (await deps.readAssistantRule({ assistantId: custom_agent_id, locale: localeKey })) || '';
  } catch (error) {
    deps.warn(`[presetAssistantResources] Failed to load rules for ${custom_agent_id}`, error);
  }

  try {
    skills = (await deps.readAssistantSkill({ assistantId: custom_agent_id, locale: localeKey })) || '';
  } catch (error) {
    deps.warn(`[presetAssistantResources] Failed to load skills for ${custom_agent_id}`, error);
  }

  return {
    rules: rules || fallbackRules,
    skills,
    enabled_skills: await deps.getEnabledSkills(custom_agent_id),
    disabledBuiltinSkills: await deps.getDisabledBuiltinSkills(custom_agent_id),
  };
}
