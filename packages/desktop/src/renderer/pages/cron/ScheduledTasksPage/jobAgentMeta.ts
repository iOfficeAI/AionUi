/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICronJob } from '@/common/adapter/ipcBridge';
import { getAgentLogo } from '@renderer/utils/model/agentLogo';
import { resolveAssistantAvatar } from '@renderer/utils/model/assistantAvatar';
import type { AgentMetadata } from '@renderer/utils/model/agentTypes';
import type { Assistant } from '@/common/types/agent/assistantTypes';

function normalizeAgentBackend(agent: string | undefined): string | undefined {
  if (!agent) return undefined;
  return agent.replace(/^cli:/, '').replace(/^preset:/, '');
}

/**
 * Resolve the display name and logo for a cron job's agent.
 *
 * ACP jobs store the literal string "acp" in `agent_type`; the real vendor id
 * (claude/gemini/codex/…) and the human-readable label live in `agent_config`.
 * Non-ACP agents (aionrs, remote, nanobot, openclaw-gateway, …) use
 * `agent_type` directly — aionrs in particular reuses `agent_config.backend`
 * for provider_id, so we must not fall back to it there.
 */
export function getJobAgentMeta(
  job: ICronJob,
  cliAgents: AgentMetadata[],
  presetAssistants: Assistant[]
): { name?: string; logo?: string | null; emoji?: string } {
  const rawType = normalizeAgentBackend(job.metadata.agent_type);
  if (!rawType) return {};

  const config = job.metadata.agent_config;
  if (config?.is_preset && config.custom_agent_id) {
    const assistant = presetAssistants.find((item) => item.id === config.custom_agent_id);
    const displayName = assistant?.name || config.name || rawType;
    const avatar = resolveAssistantAvatar(assistant?.avatar);
    if (avatar.kind === 'image') {
      return { name: displayName, logo: avatar.value };
    }
    if (avatar.kind === 'emoji') {
      return { name: displayName, emoji: avatar.value };
    }

    const presetBackend = config.preset_agent_type || (rawType === 'acp' ? config.backend : rawType);
    return {
      name: displayName,
      logo: getAgentLogo(presetBackend),
    };
  }

  if (rawType === 'acp') {
    const backend = config?.backend;
    const detected = backend ? cliAgents.find((a) => (a.backend || a.agent_type) === backend) : undefined;
    return {
      name: detected?.name || config?.name || backend || rawType,
      logo: getAgentLogo(backend),
    };
  }

  const detected = cliAgents.find((a) => (a.backend || a.agent_type) === rawType);
  return {
    name: detected?.name || rawType,
    logo: getAgentLogo(rawType),
  };
}
