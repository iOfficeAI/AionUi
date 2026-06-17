/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICronJob } from '@/common/adapter/ipcBridge';
import type { AgentLogoMap } from '@renderer/utils/model/agentLogo';
import { resolveAgentLogo } from '@renderer/utils/model/agentLogo';
import { resolveAssistantAvatar } from '@renderer/utils/model/assistantAvatar';
import type { Assistant } from '@/common/types/agent/assistantTypes';

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
 * ACP jobs store the literal string "acp" in `agent_type`; the real vendor id
 * (claude/gemini/codex/…) and the human-readable label live in `agent_config`.
 * Non-ACP agents (aionrs, remote, nanobot, openclaw-gateway, …) use
 * `agent_type` directly — aionrs in particular reuses `agent_config.backend`
 * for provider_id, so we must not fall back to it there.
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

    const presetBackend = assistant.preset_agent_type || rawType;
    return {
      name: displayName,
      logo: resolveAgentLogo(logos, { backend: presetBackend }),
    };
  }

  const rawType = normalizeAgentBackend(job.metadata.agent_type);
  if (!rawType) return {};

  if (rawType === 'acp') {
    const backend = config?.backend;
    return {
      name: config?.name || backend || rawType,
      logo: resolveAgentLogo(logos, { backend }),
    };
  }

  return {
    name: config?.name || rawType,
    logo: resolveAgentLogo(logos, { backend: rawType }),
  };
}
