/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICronJob } from '@/common/adapter/ipcBridge';
import type { AgentLogoMap } from '@renderer/utils/model/agentLogo';
import { resolveAgentLogo } from '@renderer/utils/model/agentLogo';
import { resolveAssistantAvatar } from '@renderer/utils/model/assistantAvatar';
import { assistantRuntimeKey, type Assistant } from '@/common/types/agent/assistantTypes';

function normalizeAgentBackend(agent: string | undefined): string | undefined {
  if (!agent) return undefined;
  return agent.replace(/^cli:/, '').replace(/^preset:/, '');
}

function resolveCronAssistantId(config: ICronJob['metadata']['agent_config']): string | undefined {
  return config?.assistant_id;
}

/**
 * Resolve the display name and logo for a cron job's agent.
 *
 * Assistant-backed jobs display from the assistant catalog. Non-assistant
 * legacy jobs fall back to the derived runtime type.
 */
export function getJobAgentMeta(
  job: ICronJob,
  presetAssistants: Assistant[],
  logos: AgentLogoMap
): { name?: string; logo?: string | null; emoji?: string } {
  const config = job.metadata.agent_config;
  const assistantId = resolveCronAssistantId(config);
  if (assistantId) {
    const assistant = presetAssistants.find((item) => item.id === assistantId);
    if (!assistant) {
      return {};
    }

    const rawType = normalizeAgentBackend(job.metadata.agent_type);
    const displayName = assistant.name || rawType;
    const avatar = resolveAssistantAvatar(assistant.avatar);
    if (avatar.kind === 'image') {
      return { name: displayName, logo: avatar.value };
    }
    if (avatar.kind === 'emoji') {
      return { name: displayName, emoji: avatar.value };
    }

    const presetBackend = assistantRuntimeKey(assistant) || rawType;
    return {
      name: displayName,
      logo: resolveAgentLogo(logos, { backend: presetBackend }),
    };
  }

  const rawType = normalizeAgentBackend(job.metadata.agent_type);
  if (!rawType) return {};
  const logoBackend = rawType;

  if (rawType === 'acp') {
    return {
      name: config?.name || rawType,
      logo: resolveAgentLogo(logos, { backend: logoBackend }),
    };
  }

  return {
    name: config?.name || rawType,
    logo: resolveAgentLogo(logos, { backend: logoBackend }),
  };
}
