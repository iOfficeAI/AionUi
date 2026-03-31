import React from 'react';
import type { TeammateStatus } from '@/common/types/teamTypes';

type Props = {
  status: TeammateStatus;
};

const STATUS_CONFIG: Record<TeammateStatus, { color: string }> = {
  pending: { color: 'bg-[var(--color-neutral-3)]' },
  idle: { color: 'bg-[var(--color-neutral-4)]' },
  active: { color: 'bg-[var(--color-primary-6)]' },
  completed: { color: 'bg-[var(--color-success-6)]' },
  failed: { color: 'bg-[var(--color-danger-6)]' },
};

const AgentStatusBadge: React.FC<Props> = ({ status }) => {
  const { color } = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${color} ${status === 'active' ? 'animate-pulse' : ''}`}
      aria-label={status}
    />
  );
};

export default AgentStatusBadge;
