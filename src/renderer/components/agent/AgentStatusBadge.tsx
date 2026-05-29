/**
 * @license
 * Copyright 2026 Solid Solutions
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

type AgentStatus = 'online' | 'offline' | 'busy';

type AgentStatusBadgeProps = {
  status: AgentStatus;
  agentName?: string;
  showLabel?: boolean;
};

const statusConfig = {
  online: { color: '#52c41a', label: 'Online' },
  offline: { color: '#d9d9d9', label: 'Offline' },
  busy: { color: '#faad14', label: 'Busy' },
};

const AgentStatusBadge: React.FC<AgentStatusBadgeProps> = ({
  status,
  agentName,
  showLabel = true,
}) => {
  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-2">
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: config.color,
        }}
      />
      {showLabel && (
        <span className="text-sm text-gray-600">
          {agentName ? `${agentName}: ${config.label}` : config.label}
        </span>
      )}
    </div>
  );
};

export default AgentStatusBadge;
