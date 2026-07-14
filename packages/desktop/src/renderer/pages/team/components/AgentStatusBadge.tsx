import React from 'react';
import type { TeammateStatus } from '@/common/types/team/teamTypes';

type Props = {
  status: TeammateStatus;
  testId?: string;
  /** 作为头像右下角叠加点时：绝对定位到右下角、带描边环以脱离头像底色。 */
  overlay?: boolean;
};

const STATUS_CONFIG: Record<TeammateStatus, { color: string }> = {
  pending: { color: 'bg-gray-400' },
  idle: { color: 'bg-gray-400' },
  active: { color: 'bg-green-500' },
  completed: { color: 'bg-gray-400' },
  failed: { color: 'bg-red-500' },
};

const FALLBACK_COLOR = 'bg-gray-400';

const AgentStatusBadge: React.FC<Props> = ({ status, testId, overlay = true }) => {
  const color = STATUS_CONFIG[status]?.color ?? FALLBACK_COLOR;
  const overlayClass = overlay
    ? 'absolute -bottom-1px -right-1px w-8px h-8px border-2 border-solid border-[color:var(--color-bg-base)]'
    : 'inline-block w-2 h-2';
  return (
    <span
      data-testid={testId}
      className={`${overlayClass} rounded-full ${color} ${status === 'active' ? 'animate-pulse' : ''}`}
      aria-label={status}
    />
  );
};

export default AgentStatusBadge;
