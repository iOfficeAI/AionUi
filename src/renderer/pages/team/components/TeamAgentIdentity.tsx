import React from 'react';
import { getAgentLogo } from '@renderer/utils/model/agentLogo';

type Props = {
  agentName: string;
  agentType: string;
  isLead?: boolean;
  className?: string;
  logoClassName?: string;
  nameClassName?: string;
  crownClassName?: string;
};

const TeamAgentIdentity: React.FC<Props> = ({
  agentName,
  agentType,
  isLead = false,
  className,
  logoClassName,
  nameClassName,
  crownClassName,
}) => {
  const logo = getAgentLogo(agentType);

  const crownIcon = (
    <svg
      data-testid='team-lead-crown-icon'
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
      {logo && (
        <img
          src={logo}
          alt={agentType}
          className={logoClassName ?? 'w-16px h-16px object-contain rounded-2px opacity-80'}
        />
      )}
      <span className={['min-w-0 flex-1 truncate', nameClassName].filter(Boolean).join(' ')}>{agentName}</span>
      {isLead && (
        <span
          data-testid='team-lead-crown'
          className={['shrink-0 leading-none drop-shadow-sm', crownClassName].filter(Boolean).join(' ')}
        >
          {crownIcon}
        </span>
      )}
    </div>
  );
};

export default TeamAgentIdentity;
