import React from 'react';
import type { TeamAgentStatus } from '@process/team/types';

type Props = {
  status: TeamAgentStatus;
};

const STATUS_CONFIG: Record<TeamAgentStatus, { color: string }> = {
  idle: { color: 'bg-[var(--color-neutral-4)]' },
  working: { color: 'bg-[var(--color-primary-6)]' },
  done: { color: 'bg-[var(--color-success-6)]' },
  error: { color: 'bg-[var(--color-danger-6)]' },
};

const AgentStatusBadge: React.FC<Props> = ({ status }) => {
  const { color } = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${color} ${status === 'working' ? 'animate-pulse' : ''}`}
      aria-label={status}
    />
  );
};

export default AgentStatusBadge;
