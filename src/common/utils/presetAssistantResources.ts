/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { ASSISTANT_PRESETS } from '@/common/config/presets/assistantPresets';
import { configService } from '@/common/config/configService';

export type PresetAssistantResourceDeps = {
  readAssistantRule: (args: { assistantId: string; locale: string }) => Promise<string>;
  readAssistantSkill: (args: { assistantId: string; locale: string }) => Promise<string>;
  readBuiltinRule: (args: { file_name: string }) => Promise<string>;
  readBuiltinSkill: (args: { file_name: string }) => Promise<string>;
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
  readBuiltinRule: (args) => ipcBridge.fs.readBuiltinRule.invoke(args),
  readBuiltinSkill: (args) => ipcBridge.fs.readBuiltinSkill.invoke(args),
  getEnabledSkills: async (custom_agent_id) => {
    const [presets, customs] = await Promise.all([
      configService.get('assistants'),
      configService.get('acp.customAgents'),
    ]);
    const assistant =
      presets?.find((agent) => agent.id === custom_agent_id) ?? customs?.find((agent) => agent.id === custom_agent_id);
    return assistant?.enabled_skills;
  },
  getDisabledBuiltinSkills: async (custom_agent_id) => {
    const [presets, customs] = await Promise.all([
      configService.get('assistants'),
      configService.get('acp.customAgents'),
    ]);
    const assistant =
      presets?.find((agent) => agent.id === custom_agent_id) ?? customs?.find((agent) => agent.id === custom_agent_id);
    return assistant?.disabledBuiltinSkills;
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

  if (custom_agent_id.startsWith('builtin-')) {
    const presetId = custom_agent_id.replace('builtin-', '');
    const preset = ASSISTANT_PRESETS.find((item) => item.id === presetId);

    if (preset) {
      if (!rules && preset.ruleFiles) {
        try {
          const ruleFile = preset.ruleFiles[localeKey] || preset.ruleFiles['en-US'];
          if (ruleFile) {
            rules = (await deps.readBuiltinRule({ file_name: ruleFile })) || '';
          }
        } catch (error) {
          deps.warn(`[presetAssistantResources] Failed to load builtin rules for ${custom_agent_id}`, error);
        }
      }

      if (!skills && preset.skillFiles) {
        try {
          const skillFile = preset.skillFiles[localeKey] || preset.skillFiles['en-US'];
          if (skillFile) {
            skills = (await deps.readBuiltinSkill({ file_name: skillFile })) || '';
          }
        } catch (error) {
          deps.warn(`[presetAssistantResources] Failed to load builtin skills for ${custom_agent_id}`, error);
        }
      }
    }
  }

  return {
    rules: rules || fallbackRules,
    skills,
    enabled_skills: await deps.getEnabledSkills(custom_agent_id),
    disabledBuiltinSkills: await deps.getDisabledBuiltinSkills(custom_agent_id),
  };
}
