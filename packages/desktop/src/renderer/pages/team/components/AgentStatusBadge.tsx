import React from 'react';
import type { TeammateStatus } from '@/common/types/teamTypes';

type Props = {
  status: TeammateStatus;
};

const STATUS_CONFIG: Record<TeammateStatus, { color: string }> = {
  pending: { color: 'bg-gray-400' },
  idle: { color: 'bg-gray-400' },
  active: { color: 'bg-green-500' },
  completed: { color: 'bg-gray-400' },
  failed: { color: 'bg-red-500' },
};

const FALLBACK_COLOR = 'bg-gray-400';

const AgentStatusBadge: React.FC<Props> = ({ status }) => {
  const color = STATUS_CONFIG[status]?.color ?? FALLBACK_COLOR;
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${color} ${status === 'active' ? 'animate-pulse' : ''}`}
      aria-label={status}
    />
  );
};

export default AgentStatusBadge;
