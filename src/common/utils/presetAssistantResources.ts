/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { ASSISTANT_PRESETS } from '@/common/config/presets/assistantPresets';
import { ConfigStorage } from '@/common/config/storage';

export type PresetAssistantResourceDeps = {
  readAssistantRule: (args: { assistantId: string; locale: string }) => Promise<string>;
  readAssistantSkill: (args: { assistantId: string; locale: string }) => Promise<string>;
  readBuiltinRule: (args: { fileName: string }) => Promise<string>;
  readBuiltinSkill: (args: { fileName: string }) => Promise<string>;
  getEnabledSkills: (customAgentId: string) => Promise<string[] | undefined>;
  getDisabledBuiltinSkills: (customAgentId: string) => Promise<string[] | undefined>;
  warn: (message: string, error?: unknown) => void;
};

export type LoadPresetAssistantResourcesOptions = {
  customAgentId?: string;
  localeKey: string;
  fallbackRules?: string;
};

export type PresetAssistantResources = {
  rules?: string;
  skills: string;
  enabledSkills?: string[];
  disabledBuiltinSkills?: string[];
};

const defaultDeps: PresetAssistantResourceDeps = {
  readAssistantRule: (args) => ipcBridge.fs.readAssistantRule.invoke(args),
  readAssistantSkill: (args) => ipcBridge.fs.readAssistantSkill.invoke(args),
  readBuiltinRule: (args) => ipcBridge.fs.readBuiltinRule.invoke(args),
  readBuiltinSkill: (args) => ipcBridge.fs.readBuiltinSkill.invoke(args),
  getEnabledSkills: async (customAgentId) => {
    const [presets, customs] = await Promise.all([
      ConfigStorage.get('assistants'),
      ConfigStorage.get('acp.customAgents'),
    ]);
    const assistant =
      presets?.find((agent) => agent.id === customAgentId) ?? customs?.find((agent) => agent.id === customAgentId);
    return assistant?.enabledSkills;
  },
  getDisabledBuiltinSkills: async (customAgentId) => {
    const [presets, customs] = await Promise.all([
      ConfigStorage.get('assistants'),
      ConfigStorage.get('acp.customAgents'),
    ]);
    const assistant =
      presets?.find((agent) => agent.id === customAgentId) ?? customs?.find((agent) => agent.id === customAgentId);
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
  const { customAgentId, localeKey, fallbackRules } = options;

  if (!customAgentId) {
    return {
      rules: fallbackRules,
      skills: '',
      enabledSkills: undefined,
      disabledBuiltinSkills: undefined,
    };
  }

  let rules = '';
  let skills = '';

  try {
    rules = (await deps.readAssistantRule({ assistantId: customAgentId, locale: localeKey })) || '';
  } catch (error) {
    deps.warn(`[presetAssistantResources] Failed to load rules for ${customAgentId}`, error);
  }

  try {
    skills = (await deps.readAssistantSkill({ assistantId: customAgentId, locale: localeKey })) || '';
  } catch (error) {
    deps.warn(`[presetAssistantResources] Failed to load skills for ${customAgentId}`, error);
  }

  if (customAgentId.startsWith('builtin-')) {
    const presetId = customAgentId.replace('builtin-', '');
    const preset = ASSISTANT_PRESETS.find((item) => item.id === presetId);

    if (preset) {
      if (!rules && preset.ruleFiles) {
        try {
          const ruleFile = preset.ruleFiles[localeKey] || preset.ruleFiles['en-US'];
          if (ruleFile) {
            rules = (await deps.readBuiltinRule({ fileName: ruleFile })) || '';
          }
        } catch (error) {
          deps.warn(`[presetAssistantResources] Failed to load builtin rules for ${customAgentId}`, error);
        }
      }

      if (!skills && preset.skillFiles) {
        try {
          const skillFile = preset.skillFiles[localeKey] || preset.skillFiles['en-US'];
          if (skillFile) {
            skills = (await deps.readBuiltinSkill({ fileName: skillFile })) || '';
          }
        } catch (error) {
          deps.warn(`[presetAssistantResources] Failed to load builtin skills for ${customAgentId}`, error);
        }
      }
    }
  }

  return {
    rules: rules || fallbackRules,
    skills,
    enabledSkills: await deps.getEnabledSkills(customAgentId),
    disabledBuiltinSkills: await deps.getDisabledBuiltinSkills(customAgentId),
  };
}
