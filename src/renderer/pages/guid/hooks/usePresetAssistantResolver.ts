/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { ASSISTANT_PRESETS } from '@/common/config/presets/assistantPresets';
import type { AcpBackendConfig } from '../types';
import { useCallback } from 'react';

type UsePresetAssistantResolverOptions = {
  customAgents: AcpBackendConfig[];
  localeKey: string;
};

type UsePresetAssistantResolverResult = {
  resolvePresetRulesAndSkills: (
    agentInfo: { agent_type: string; backend?: string; custom_agent_id?: string; context?: string } | undefined
  ) => Promise<{ rules?: string; skills?: string }>;
  resolvePresetContext: (
    agentInfo: { agent_type: string; backend?: string; custom_agent_id?: string; context?: string } | undefined
  ) => Promise<string | undefined>;
  resolvePresetAgentType: (
    agentInfo: { agent_type: string; backend?: string; custom_agent_id?: string } | undefined
  ) => string;
  resolveEnabledSkills: (
    agentInfo: { agent_type: string; backend?: string; custom_agent_id?: string } | undefined
  ) => string[] | undefined;
  resolveDisabledBuiltinSkills: (
    agentInfo: { agent_type: string; backend?: string; custom_agent_id?: string } | undefined
  ) => string[] | undefined;
};

/**
 * Hook that provides preset assistant resolution callbacks.
 * Resolves rules, skills, context, and agent type for preset assistants.
 */
export const usePresetAssistantResolver = ({
  customAgents,
  localeKey,
}: UsePresetAssistantResolverOptions): UsePresetAssistantResolverResult => {
  const resolvePresetRulesAndSkills = useCallback(
    async (
      agentInfo: { agent_type: string; backend?: string; custom_agent_id?: string; context?: string } | undefined
    ): Promise<{ rules?: string; skills?: string }> => {
      if (!agentInfo) return {};
      const custom_agent_id = agentInfo.custom_agent_id;
      if (!custom_agent_id) return { rules: agentInfo.context };

      let rules = '';
      let skills = '';

      try {
        rules = await ipcBridge.fs.readAssistantRule.invoke({
          assistantId: custom_agent_id,
          locale: localeKey,
        });
      } catch (error) {
        console.warn(`Failed to load rules for ${custom_agent_id}:`, error);
      }

      try {
        skills = await ipcBridge.fs.readAssistantSkill.invoke({
          assistantId: custom_agent_id,
          locale: localeKey,
        });
      } catch (_error) {
        // skills may not exist, this is normal
      }

      // Fallback for builtin assistants
      if (custom_agent_id.startsWith('builtin-')) {
        const presetId = custom_agent_id.replace('builtin-', '');
        const preset = ASSISTANT_PRESETS.find((p) => p.id === presetId);
        if (preset) {
          if (!rules && preset.ruleFiles) {
            try {
              const ruleFile = preset.ruleFiles[localeKey] || preset.ruleFiles['en-US'];
              if (ruleFile) {
                rules = await ipcBridge.fs.readBuiltinRule.invoke({ file_name: ruleFile });
              }
            } catch (e) {
              console.warn(`Failed to load builtin rules for ${custom_agent_id}:`, e);
            }
          }
          if (!skills && preset.skillFiles) {
            try {
              const skillFile = preset.skillFiles[localeKey] || preset.skillFiles['en-US'];
              if (skillFile) {
                skills = await ipcBridge.fs.readBuiltinSkill.invoke({ file_name: skillFile });
              }
            } catch (_e) {
              // skills fallback failure is ok
            }
          }
        }
      }

      return { rules: rules || agentInfo.context, skills };
    },
    [localeKey]
  );

  const resolvePresetContext = useCallback(
    async (
      agentInfo: { agent_type: string; backend?: string; custom_agent_id?: string; context?: string } | undefined
    ): Promise<string | undefined> => {
      const { rules } = await resolvePresetRulesAndSkills(agentInfo);
      return rules;
    },
    [resolvePresetRulesAndSkills]
  );

  const resolvePresetAgentType = useCallback(
    (agentInfo: { agent_type: string; backend?: string; custom_agent_id?: string } | undefined): string => {
      if (!agentInfo) return 'gemini';
      if (!agentInfo.custom_agent_id) return agentInfo.backend || agentInfo.agent_type;
      const customAgent = customAgents.find((agent) => agent.id === agentInfo.custom_agent_id);
      return customAgent?.presetAgentType || 'gemini';
    },
    [customAgents]
  );

  const resolveEnabledSkills = useCallback(
    (
      agentInfo: { agent_type: string; backend?: string; custom_agent_id?: string } | undefined
    ): string[] | undefined => {
      if (!agentInfo || !agentInfo.custom_agent_id) return undefined;
      const customAgent = customAgents.find((agent) => agent.id === agentInfo.custom_agent_id);
      return customAgent?.enabled_skills;
    },
    [customAgents]
  );

  const resolveDisabledBuiltinSkills = useCallback(
    (
      agentInfo: { agent_type: string; backend?: string; custom_agent_id?: string } | undefined
    ): string[] | undefined => {
      if (!agentInfo || !agentInfo.custom_agent_id) return undefined;
      const customAgent = customAgents.find((agent) => agent.id === agentInfo.custom_agent_id);
      return customAgent?.disabledBuiltinSkills;
    },
    [customAgents]
  );

  return {
    resolvePresetRulesAndSkills,
    resolvePresetContext,
    resolvePresetAgentType,
    resolveEnabledSkills,
    resolveDisabledBuiltinSkills,
  };
};
