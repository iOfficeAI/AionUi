import React from 'react';
import { Robot } from '@icon-park/react';
import { getAgentLogo } from '@renderer/utils/model/agentLogo';
import { resolveAssistantAvatar } from '@renderer/utils/model/assistantAvatar';
import type { AgentMetadata } from '@renderer/utils/model/agentTypes';
import type { Assistant } from '@/common/types/agent/assistantTypes';
import {
  isDeprecatedRuntimeAgentType,
  resolveSupportedConversationType,
} from '@/renderer/utils/model/agentTypeSupportPolicy';

/**
 * Team leader selector entry derived from the unified assistant catalog.
 */
export type TeamAgentOption = {
  id: string;
  name: string;
  /** Execution backend (claude, gemini, qwen, …). */
  backend?: string;
  /** Top-level runtime type used to resolve conversation kind. */
  agent_type?: string;
  /** Icon / avatar token — an SVG filename, emoji, or key into
   *  `CUSTOM_AVATAR_IMAGE_MAP`. */
  icon?: string;
  /** Whether this assistant can currently be used in team mode. */
  team_capable?: boolean;
  /** Why this assistant cannot currently be used in team mode. */
  team_block_reason?: string;
};

export function cliAgentToOption(agent: AgentMetadata): TeamAgentOption {
  return {
    id: agent.id,
    name: agent.name,
    backend: agent.backend || agent.agent_type,
    agent_type: agent.agent_type,
    icon: agent.icon,
    team_capable: agent.team_capable,
  };
}

export function assistantToOption(assistant: Assistant): TeamAgentOption {
  return {
    id: assistant.id,
    name: assistant.name,
    backend: assistant.preset_agent_type,
    agent_type: assistant.preset_agent_type,
    icon: assistant.avatar,
    team_capable: assistant.team_selectable,
    team_block_reason: assistant.team_block_reason,
  };
}

export function agentKey(agent: TeamAgentOption): string {
  return agent.id;
}

export function agentFromKey(key: string, allAgents: TeamAgentOption[]): TeamAgentOption | undefined {
  return allAgents.find((a) => agentKey(a) === key);
}

export function resolveTeamAgentType(agent: TeamAgentOption | undefined, fallback: string): string {
  return agent?.backend || fallback;
}

/** Filter agents to only those supported in team mode */
export function filterTeamSupportedAgents(agents: TeamAgentOption[]): TeamAgentOption[] {
  return agents.filter((a) => !isDeprecatedRuntimeAgentType(a.agent_type));
}

export function resolveConversationType(backend: string): 'acp' | 'aionrs' {
  return resolveSupportedConversationType(backend);
}

export const AgentOptionLabel: React.FC<{ agent: TeamAgentOption }> = ({ agent }) => {
  const logo = getAgentLogo(agent.backend);
  const avatar = resolveAssistantAvatar(agent.icon);
  return (
    <div className='flex items-center gap-8px'>
      {avatar.kind === 'image' ? (
        <img src={avatar.value} alt={agent.name} style={{ width: 16, height: 16, objectFit: 'contain' }} />
      ) : avatar.kind === 'emoji' ? (
        <span style={{ fontSize: 14, lineHeight: '16px' }}>{avatar.value}</span>
      ) : logo ? (
        <img src={logo} alt={agent.name} style={{ width: 16, height: 16, objectFit: 'contain' }} />
      ) : (
        <Robot size='16' />
      )}
      <span>{agent.name}</span>
    </div>
  );
};
