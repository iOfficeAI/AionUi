import React from 'react';
import type { TeamAgent, TeamAgentRuntime } from '@process/team/types';
import AgentStatusBadge from './AgentStatusBadge';

type Props = {
  agent: TeamAgent;
  runtime: TeamAgentRuntime;
};

const AgentTab: React.FC<Props> = ({ agent, runtime }) => {
  return (
    <span className="flex items-center gap-1.5">
      <AgentStatusBadge status={runtime.status} />
      <span className="text-sm">{agent.agentName}</span>
      {agent.role === 'dispatch' && (
        <span className="text-xs text-[var(--color-text-3)] ml-0.5">▸</span>
      )}
    </span>
  );
};

export default AgentTab;
