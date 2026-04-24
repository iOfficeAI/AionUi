/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { Assistant } from '@/common/types/assistantTypes';
import type { AcpBackend } from '../types';
import { useCallback } from 'react';

type UsePresetAssistantResolverOptions = {
  /**
   * Backend-merged preset catalog (`GET /api/assistants`). The resolver looks
   * up `presetAgentType`, `enabledSkills`, and `disabledBuiltinSkills` on
   * the chosen assistant record — all of which live on the `Assistant` type,
   * not on the ACP engine-config `AcpBackendConfig`.
   */
  assistants: Assistant[];
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
 * Rule/skill read requests are served by the backend, which dispatches per
 * assistant source (builtin manifest / extension bundle / user md file).
 */
export const usePresetAssistantResolver = ({
  assistants,
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
      const assistant = assistants.find((a) => a.id === agentInfo.custom_agent_id);
      return assistant?.preset_agent_type || 'gemini';
    },
    [assistants]
  );

  const resolveEnabledSkills = useCallback(
    (
      agentInfo: { agent_type: string; backend?: string; custom_agent_id?: string } | undefined
    ): string[] | undefined => {
      if (!agentInfo || !agentInfo.custom_agent_id) return undefined;
      const assistant = assistants.find((a) => a.id === agentInfo.custom_agent_id);
      // Preserve legacy "undefined means use agent default" semantics by
      // treating an empty list the same as absent.
      if (!assistant || assistant.enabled_skills.length === 0) return undefined;
      return assistant.enabled_skills;
    },
    [assistants]
  );

  const resolveDisabledBuiltinSkills = useCallback(
    (
      agentInfo: { agent_type: string; backend?: string; custom_agent_id?: string } | undefined
    ): string[] | undefined => {
      if (!agentInfo || !agentInfo.custom_agent_id) return undefined;
      const assistant = assistants.find((a) => a.id === agentInfo.custom_agent_id);
      if (!assistant || assistant.disabled_builtin_skills.length === 0) return undefined;
      return assistant.disabled_builtin_skills;
    },
    [assistants]
  );

  return {
    resolvePresetRulesAndSkills,
    resolvePresetContext,
    resolvePresetAgentType,
    resolveEnabledSkills,
    resolveDisabledBuiltinSkills,
  };
};
