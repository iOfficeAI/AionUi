import React from 'react';
import { Robot } from '@icon-park/react';
import { getAgentLogo } from '@renderer/utils/model/agentLogo';
import { CUSTOM_AVATAR_IMAGE_MAP } from '@renderer/pages/guid/constants';
import type { AvailableAgent } from '@renderer/utils/model/agentTypes';
import type { AcpInitializeResult } from '@/common/types/acpTypes';
import { isTeamCapableBackend } from '@/common/types/teamTypes';

export function agentKey(agent: AvailableAgent): string {
  return agent.customAgentId ? `preset::${agent.customAgentId}` : `cli::${agent.backend}`;
}

export function agentFromKey(key: string, allAgents: AvailableAgent[]): AvailableAgent | undefined {
  return allAgents.find((a) => agentKey(a) === key);
}

export function resolveTeamAgentType(agent: AvailableAgent | undefined, fallback: string): string {
  return agent?.presetAgentType || agent?.backend || fallback;
}

/** Filter agents to only those supported in team mode */
export function filterTeamSupportedAgents(
  agents: AvailableAgent[],
  cachedInitResults: Record<string, AcpInitializeResult> | null | undefined
): AvailableAgent[] {
  return agents.filter((a) => {
    const backend = a.presetAgentType || a.backend;
    return isTeamCapableBackend(backend, cachedInitResults);
  });
}

export function resolveConversationType(
  backend: string
): 'gemini' | 'acp' | 'aionrs' | 'codex' | 'openclaw-gateway' | 'nanobot' | 'remote' {
  if (backend === 'gemini') return 'gemini';
  if (backend === 'aionrs') return 'aionrs';
  if (backend === 'codex') return 'acp';
  if (backend === 'openclaw-gateway') return 'openclaw-gateway';
  if (backend === 'nanobot') return 'nanobot';
  if (backend === 'remote') return 'remote';
  return 'acp';
}

export const AgentOptionLabel: React.FC<{ agent: AvailableAgent }> = ({ agent }) => {
  const logo = getAgentLogo(agent.backend);
  const avatarImage = agent.avatar ? CUSTOM_AVATAR_IMAGE_MAP[agent.avatar] : undefined;
  const isEmoji = agent.avatar && !avatarImage && !agent.avatar.endsWith('.svg');
  return (
    <div className='flex items-center gap-8px'>
      {avatarImage ? (
        <img src={avatarImage} alt={agent.name} style={{ width: 16, height: 16, objectFit: 'contain' }} />
      ) : isEmoji ? (
        <span style={{ fontSize: 14, lineHeight: '16px' }}>{agent.avatar}</span>
      ) : logo ? (
        <img src={logo} alt={agent.name} style={{ width: 16, height: 16, objectFit: 'contain' }} />
      ) : (
        <Robot size='16' />
      )}
      <span>{agent.name}</span>
    </div>
  );
};
