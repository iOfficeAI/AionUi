/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import { useCallback } from 'react';

type UsePresetAssistantResolverOptions = {
  /**
   * Backend-merged preset catalog (`GET /api/assistants`). The resolver looks
   * up `presetAgentType`, `enabledSkills`, and `disabledBuiltinSkills` on
   * the chosen assistant record — all of which live on the `Assistant` type,
   * not on any ACP engine-config row.
   */
  assistants: Assistant[];
  localeKey: string;
};

type UsePresetAssistantResolverResult = {
  resolvePresetRulesAndSkills: (
    agentInfo:
      | {
          agent_type: string;
          backend?: string;
          assistant_id?: string;
          preset_assistant_id?: string;
          custom_agent_id?: string;
          context?: string;
        }
      | undefined
  ) => Promise<{ rules?: string }>;
  resolvePresetContext: (
    agentInfo:
      | {
          agent_type: string;
          backend?: string;
          assistant_id?: string;
          preset_assistant_id?: string;
          custom_agent_id?: string;
          context?: string;
        }
      | undefined
  ) => Promise<string | undefined>;
  resolvePresetAgentType: (
    agentInfo:
      | {
          agent_type: string;
          backend?: string;
          assistant_id?: string;
          preset_assistant_id?: string;
          custom_agent_id?: string;
        }
      | undefined
  ) => string;
  resolveEnabledSkills: (
    agentInfo:
      | {
          agent_type: string;
          backend?: string;
          assistant_id?: string;
          preset_assistant_id?: string;
          custom_agent_id?: string;
        }
      | undefined
  ) => string[] | undefined;
  resolveDisabledBuiltinSkills: (
    agentInfo:
      | {
          agent_type: string;
          backend?: string;
          assistant_id?: string;
          preset_assistant_id?: string;
          custom_agent_id?: string;
        }
      | undefined
  ) => string[] | undefined;
};

function resolveAssistantIdentityId(
  agentInfo: { assistant_id?: string; preset_assistant_id?: string; custom_agent_id?: string } | undefined,
  assistants: Assistant[]
): string | undefined {
  const explicitAssistantId = agentInfo?.assistant_id || agentInfo?.preset_assistant_id;
  if (explicitAssistantId) {
    return explicitAssistantId;
  }

  const legacyAssistantId = agentInfo?.custom_agent_id;
  if (!legacyAssistantId) {
    return undefined;
  }

  return assistants.some((assistant) => assistant.id === legacyAssistantId) ? legacyAssistantId : undefined;
}

/**
 * Hook that provides preset assistant resolution callbacks.
 * Resolves rules, context, and agent type for preset assistants.
 * Rule reads are served by the backend, which dispatches per assistant source
 * (builtin manifest / extension bundle / user md file).
 */
export const usePresetAssistantResolver = ({
  assistants,
  localeKey,
}: UsePresetAssistantResolverOptions): UsePresetAssistantResolverResult => {
  const resolvePresetRulesAndSkills = useCallback(
    async (
      agentInfo:
        | {
            agent_type: string;
            backend?: string;
            assistant_id?: string;
            preset_assistant_id?: string;
            custom_agent_id?: string;
            context?: string;
          }
        | undefined
    ): Promise<{ rules?: string }> => {
      if (!agentInfo) return {};
      const assistantId = resolveAssistantIdentityId(agentInfo, assistants);
      if (!assistantId) return { rules: agentInfo.context };

      let rules = '';

      try {
        rules = await ipcBridge.fs.readAssistantRule.invoke({
          assistant_id: assistantId,
          locale: localeKey,
        });
      } catch (error) {
        console.warn(`Failed to load rules for ${assistantId}:`, error);
      }

      return { rules: rules || agentInfo.context };
    },
    [assistants, localeKey]
  );

  const resolvePresetContext = useCallback(
    async (
      agentInfo:
        | {
            agent_type: string;
            backend?: string;
            assistant_id?: string;
            preset_assistant_id?: string;
            custom_agent_id?: string;
            context?: string;
          }
        | undefined
    ): Promise<string | undefined> => {
      const { rules } = await resolvePresetRulesAndSkills(agentInfo);
      return rules;
    },
    [resolvePresetRulesAndSkills]
  );

  const resolvePresetAgentType = useCallback(
    (
      agentInfo:
        | {
            agent_type: string;
            backend?: string;
            assistant_id?: string;
            preset_assistant_id?: string;
            custom_agent_id?: string;
          }
        | undefined
    ): string => {
      if (!agentInfo) return 'gemini';
      const assistantId = resolveAssistantIdentityId(agentInfo, assistants);
      if (!assistantId) return agentInfo.backend || agentInfo.agent_type;
      const assistant = assistants.find((a) => a.id === assistantId);
      return assistant?.preset_agent_type || agentInfo.backend || agentInfo.agent_type || 'gemini';
    },
    [assistants]
  );

  const resolveEnabledSkills = useCallback(
    (
      agentInfo:
        | {
            agent_type: string;
            backend?: string;
            assistant_id?: string;
            preset_assistant_id?: string;
            custom_agent_id?: string;
          }
        | undefined
    ): string[] | undefined => {
      const assistantId = resolveAssistantIdentityId(agentInfo, assistants);
      if (!assistantId) return undefined;
      const assistant = assistants.find((a) => a.id === assistantId);
      // Preserve legacy "undefined means use agent default" semantics by
      // treating an empty list the same as absent. The field is typed as
      // required `string[]`, but legacy/extension assistants can omit it,
      // so guard the optional access.
      if (!assistant?.enabled_skills?.length) return undefined;
      return assistant.enabled_skills;
    },
    [assistants]
  );

  const resolveDisabledBuiltinSkills = useCallback(
    (
      agentInfo:
        | {
            agent_type: string;
            backend?: string;
            assistant_id?: string;
            preset_assistant_id?: string;
            custom_agent_id?: string;
          }
        | undefined
    ): string[] | undefined => {
      const assistantId = resolveAssistantIdentityId(agentInfo, assistants);
      if (!assistantId) return undefined;
      const assistant = assistants.find((a) => a.id === assistantId);
      if (!assistant?.disabled_builtin_skills?.length) return undefined;
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
