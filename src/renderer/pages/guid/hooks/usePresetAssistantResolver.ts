/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { AcpBackend, AcpBackendConfig } from '../types';
import { useCallback } from 'react';

type UsePresetAssistantResolverOptions = {
  customAgents: AcpBackendConfig[];
  localeKey: string;
};

type UsePresetAssistantResolverResult = {
  resolvePresetRulesAndSkills: (
    agentInfo: { backend: AcpBackend; customAgentId?: string; context?: string } | undefined
  ) => Promise<{ rules?: string; skills?: string }>;
  resolvePresetContext: (
    agentInfo: { backend: AcpBackend; customAgentId?: string; context?: string } | undefined
  ) => Promise<string | undefined>;
  resolvePresetAgentType: (agentInfo: { backend: AcpBackend; customAgentId?: string } | undefined) => string;
  resolveEnabledSkills: (
    agentInfo: { backend: AcpBackend; customAgentId?: string } | undefined
  ) => string[] | undefined;
  resolveDisabledBuiltinSkills: (
    agentInfo: { backend: AcpBackend; customAgentId?: string } | undefined
  ) => string[] | undefined;
};

/**
 * Hook that provides preset assistant resolution callbacks.
 * Resolves rules, skills, context, and agent type for preset assistants.
 * Rule/skill read requests are served by the backend, which dispatches per
 * assistant source (builtin manifest / extension bundle / user md file).
 */
export const usePresetAssistantResolver = ({
  customAgents,
  localeKey,
}: UsePresetAssistantResolverOptions): UsePresetAssistantResolverResult => {
  const resolvePresetRulesAndSkills = useCallback(
    async (
      agentInfo: { backend: AcpBackend; customAgentId?: string; context?: string } | undefined
    ): Promise<{ rules?: string; skills?: string }> => {
      if (!agentInfo) return {};
      const customAgentId = agentInfo.customAgentId;
      if (!customAgentId) return { rules: agentInfo.context };

      let rules = '';
      let skills = '';

      try {
        rules = await ipcBridge.fs.readAssistantRule.invoke({
          assistantId: customAgentId,
          locale: localeKey,
        });
      } catch (error) {
        console.warn(`Failed to load rules for ${customAgentId}:`, error);
      }

      try {
        skills = await ipcBridge.fs.readAssistantSkill.invoke({
          assistantId: customAgentId,
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
      agentInfo: { backend: AcpBackend; customAgentId?: string; context?: string } | undefined
    ): Promise<string | undefined> => {
      const { rules } = await resolvePresetRulesAndSkills(agentInfo);
      return rules;
    },
    [resolvePresetRulesAndSkills]
  );

  const resolvePresetAgentType = useCallback(
    (agentInfo: { backend: AcpBackend; customAgentId?: string } | undefined): string => {
      if (!agentInfo) return 'gemini';
      if (!agentInfo.customAgentId) return agentInfo.backend as string;
      const customAgent = customAgents.find((agent) => agent.id === agentInfo.customAgentId);
      return customAgent?.presetAgentType || 'gemini';
    },
    [customAgents]
  );

  const resolveEnabledSkills = useCallback(
    (agentInfo: { backend: AcpBackend; customAgentId?: string } | undefined): string[] | undefined => {
      if (!agentInfo || !agentInfo.customAgentId) return undefined;
      const customAgent = customAgents.find((agent) => agent.id === agentInfo.customAgentId);
      return customAgent?.enabledSkills;
    },
    [customAgents]
  );

  const resolveDisabledBuiltinSkills = useCallback(
    (agentInfo: { backend: AcpBackend; customAgentId?: string } | undefined): string[] | undefined => {
      if (!agentInfo || !agentInfo.customAgentId) return undefined;
      const customAgent = customAgents.find((agent) => agent.id === agentInfo.customAgentId);
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
