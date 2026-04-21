import React from 'react';
import useSWR from 'swr';
import { ipcBridge } from '@/common';
import { getAgentLogo } from '@renderer/utils/model/agentLogo';
import { usePresetAssistantInfo } from '@renderer/hooks/agent/usePresetAssistantInfo';

type Props = {
  agentName: string;
  agentType: string;
  /** When provided, enables preset-aware avatar (emoji / custom svg) via the agent's conversation extras. */
  conversationId?: string;
  isLeader?: boolean;
  className?: string;
  logoClassName?: string;
  /** Used for emoji presets (text-based avatar) and the first-letter fallback circle. */
  avatarClassName?: string;
  nameClassName?: string;
  crownClassName?: string;
};

const TeamAgentIdentity: React.FC<Props> = ({
  agentName,
  agentType,
  conversationId,
  isLeader = false,
  className,
  logoClassName,
  avatarClassName,
  nameClassName,
  crownClassName,
}) => {
  // Share the SWR key with AgentChatSlot / TeamChatEmptyState so this hits cache instead of firing a fetch
  const { data: conversation } = useSWR(conversationId ? ['team-conversation', conversationId] : null, () =>
    ipcBridge.conversation.get.invoke({ id: conversationId! })
  );
  const { info: presetInfo } = usePresetAssistantInfo(conversation ?? undefined);
  const backendLogo = getAgentLogo(agentType);

  const defaultLogoClassName = 'w-16px h-16px object-contain rounded-2px opacity-80';
  const resolvedLogoClassName = logoClassName ?? defaultLogoClassName;
  const defaultAvatarClassName =
    'w-16px h-16px rounded-2px flex items-center justify-center text-12px leading-none bg-fill-2 shrink-0';
  const resolvedAvatarClassName = avatarClassName ?? defaultAvatarClassName;

  const renderAvatar = () => {
    if (presetInfo) {
      if (presetInfo.isEmoji) {
        return <span className={resolvedAvatarClassName}>{presetInfo.logo}</span>;
      }
      return <img src={presetInfo.logo} alt={presetInfo.name} className={resolvedLogoClassName} />;
    }
    if (backendLogo) {
      return <img src={backendLogo} alt={agentType} className={resolvedLogoClassName} />;
    }
    return <span className={resolvedAvatarClassName}>{agentName.charAt(0).toUpperCase() || '🤖'}</span>;
  };

  const crownIcon = (
    <svg
      data-testid='team-leader-crown-icon'
      width='15'
      height='15'
      viewBox='0 0 16 16'
      fill='none'
      aria-hidden='true'
      className='block'
    >
      <path
        d='M2.3 13L1.2 4.7L4.8 6.5L8 2.1L11.2 6.5L14.8 4.7L13.7 13H2.3Z'
        strokeWidth='1.25'
        strokeLinejoin='round'
        style={{ fill: 'var(--warning)', stroke: 'var(--text-primary)' }}
      />
      <path d='M5 10.1H11' strokeWidth='1.1' strokeLinecap='round' style={{ stroke: 'var(--text-primary)' }} />
    </svg>
  );

  return (
    <div className={['flex items-center gap-8px', className].filter(Boolean).join(' ')}>
      {renderAvatar()}
      <span className={['min-w-0 flex-1 truncate', nameClassName].filter(Boolean).join(' ')}>{agentName}</span>
      {isLeader && (
        <span
          data-testid='team-leader-crown'
          className={['shrink-0 leading-none drop-shadow-sm', crownClassName].filter(Boolean).join(' ')}
        >
          {crownIcon}
        </span>
      )}
    </div>
  );
};

export default TeamAgentIdentity;
