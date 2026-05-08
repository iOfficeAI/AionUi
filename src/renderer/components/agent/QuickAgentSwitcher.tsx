/**
 * @license
 * Copyright 2026 Solid Solutions
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Select } from '@arco-design/web-react';
import { Robot } from '@icon-park/react';
import type { SelectProps } from '@arco-design/web-react';

type AgentOption = {
  id: string;
  name: string;
  avatar?: string;
};

type QuickAgentSwitcherProps = {
  agents: AgentOption[];
  selectedAgentId: string;
  onSelect: (agentId: string) => void;
  loading?: boolean;
};

const QuickAgentSwitcher: React.FC<QuickAgentSwitcherProps> = ({
  agents,
  selectedAgentId,
  onSelect,
  loading = false,
}) => {
  const options = agents.map((agent) => ({
    label: (
      <div className="flex items-center gap-2">
        <Robot style={{ width: 16, height: 16 }} />
        <span>{agent.name}</span>
      </div>
    ),
    value: agent.id,
  }));

  return (
    <Select
      style={{ width: 200 }}
      value={selectedAgentId}
      onChange={(value) => onSelect(value as string)}
      options={options}
      loading={loading}
      placeholder="Switch agent..."
      prefix={<Robot style={{ width: 16, height: 16 }} />}
    />
  );
};

export default QuickAgentSwitcher;
