import React from 'react';
import { Robot } from '@icon-park/react';
import { getAgentLogo } from '@renderer/utils/model/agentLogo';
import { CUSTOM_AVATAR_IMAGE_MAP } from '@renderer/pages/guid/constants';
import type { AgentMetadata } from '@renderer/utils/model/agentTypes';
import type { Assistant } from '@/common/types/assistantTypes';
import type { AcpInitializeResult } from '@/common/types/acpTypes';
import { isTeamCapableBackend } from '@/common/types/teamTypes';

/**
 * Team leader selector entry — unified view over CLI agents and preset
 * assistants. Both sources share the dropdown but have different native
 * shapes; this type is what the dropdown code actually reads.
 */
export type TeamAgentOption = {
  id: string;
  name: string;
  /** Execution backend (claude, gemini, qwen, …). For assistants this is
   *  `preset_agent_type`; for CLI agents it's `backend`. */
  backend?: string;
  /** Icon / avatar token — an SVG filename, emoji, or key into
   *  `CUSTOM_AVATAR_IMAGE_MAP`. */
  icon?: string;
};

export function cliAgentToOption(agent: AgentMetadata): TeamAgentOption {
  return { id: agent.id, name: agent.name, backend: agent.backend, icon: agent.icon };
}

export function assistantToOption(assistant: Assistant): TeamAgentOption {
  return {
    id: assistant.id,
    name: assistant.name,
    backend: assistant.preset_agent_type,
    icon: assistant.avatar,
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
export function filterTeamSupportedAgents(
  agents: TeamAgentOption[],
  cachedInitResults: Record<string, AcpInitializeResult> | null | undefined
): TeamAgentOption[] {
  return agents.filter((a) => isTeamCapableBackend(a.backend, cachedInitResults));
}

export function resolveConversationType(
  backend: string
): 'acp' | 'aionrs' | 'codex' | 'openclaw-gateway' | 'nanobot' | 'remote' {
  if (backend === 'aionrs') return 'aionrs';
  if (backend === 'codex') return 'acp';
  if (backend === 'openclaw-gateway') return 'openclaw-gateway';
  if (backend === 'nanobot') return 'nanobot';
  if (backend === 'remote') return 'remote';
  return 'acp';
}

export const AgentOptionLabel: React.FC<{ agent: TeamAgentOption }> = ({ agent }) => {
  const logo = getAgentLogo(agent.backend);
  const avatarImage = agent.icon ? CUSTOM_AVATAR_IMAGE_MAP[agent.icon] : undefined;
  const isEmoji = agent.icon && !avatarImage && !agent.icon.endsWith('.svg');
  return (
    <div className='flex items-center gap-8px'>
      {avatarImage ? (
        <img src={avatarImage} alt={agent.name} style={{ width: 16, height: 16, objectFit: 'contain' }} />
      ) : isEmoji ? (
        <span style={{ fontSize: 14, lineHeight: '16px' }}>{agent.icon}</span>
      ) : logo ? (
        <img src={logo} alt={agent.name} style={{ width: 16, height: 16, objectFit: 'contain' }} />
      ) : (
        <Robot size='16' />
      )}
      <span>{agent.name}</span>
    </div>
  );
};
