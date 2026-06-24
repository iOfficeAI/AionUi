import React from 'react';
import { Robot } from '@icon-park/react';
import { resolveAgentLogo, useAgentLogos } from '@renderer/utils/model/agentLogo';
import { resolveAssistantAvatar } from '@renderer/utils/model/assistantAvatar';
import { resolveAssistantName } from '@renderer/utils/model/assistantDisplay';
import { assistantRuntimeKey, type Assistant } from '@/common/types/agent/assistantTypes';

/** Team leader selector entry derived from the unified assistant catalog. */
export type TeamAssistantOption = {
  id: string;
  name: string;
  /** Execution backend (claude, gemini, qwen, …). */
  backend?: string;
  /** Avatar token — a backend-resolved URL or an emoji. */
  icon?: string;
  /** Whether this assistant can currently be used in team mode. */
  team_capable?: boolean;
  /** Why this assistant cannot currently be used in team mode. */
  team_block_reason?: string;
};

export function assistantToOption(assistant: Assistant, localeKey = 'en-US'): TeamAssistantOption {
  return {
    id: assistant.id,
    name: resolveAssistantName(assistant, localeKey, assistant.name),
    backend: assistantRuntimeKey(assistant),
    icon: assistant.avatar,
    team_capable: assistant.team_selectable,
    team_block_reason: assistant.team_block_reason,
  };
}

export function assistantKey(assistant: TeamAssistantOption): string {
  return assistant.id;
}

export function assistantFromId(
  assistantId: string,
  allAssistants: TeamAssistantOption[]
): TeamAssistantOption | undefined {
  return allAssistants.find((assistant) => assistantKey(assistant) === assistantId);
}

/** Filter assistants to only those supported in team mode. */
export function filterTeamSupportedAssistants(assistants: TeamAssistantOption[]): TeamAssistantOption[] {
  return assistants;
}

export const AssistantOptionLabel: React.FC<{ assistant: TeamAssistantOption }> = ({ assistant }) => {
  const logos = useAgentLogos();
  const logo = resolveAgentLogo(logos, { backend: assistant.backend });
  const avatar = resolveAssistantAvatar(assistant.icon);
  return (
    <div className='flex items-center gap-8px'>
      {avatar.kind === 'image' ? (
        <img src={avatar.value} alt={assistant.name} style={{ width: 16, height: 16, objectFit: 'contain' }} />
      ) : avatar.kind === 'emoji' ? (
        <span style={{ fontSize: 14, lineHeight: '16px' }}>{avatar.value}</span>
      ) : logo ? (
        <img src={logo} alt={assistant.name} style={{ width: 16, height: 16, objectFit: 'contain' }} />
      ) : (
        <Robot size='16' />
      )}
      <span>{assistant.name}</span>
    </div>
  );
};
