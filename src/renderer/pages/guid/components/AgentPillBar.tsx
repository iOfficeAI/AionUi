/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getAgentLogo } from '@/renderer/utils/agentLogo';
import type { AcpBackend, AvailableAgent } from '../types';
import { Robot } from '@icon-park/react';
import React from 'react';
import styles from '../index.module.css';

type AgentPillBarProps = {
  availableAgents: AvailableAgent[];
  selectedAgentKey: string;
  getAgentKey: (agent: { backend: AcpBackend; customAgentId?: string }) => string;
  onSelectAgent: (key: string) => void;
};

const AgentPillBar: React.FC<AgentPillBarProps> = ({ availableAgents, selectedAgentKey, getAgentKey, onSelectAgent }) => {
  return (
    <div className='w-full flex justify-center'>
      <div
        className='flex flex-wrap items-center justify-center'
        style={{
          marginBottom: 20,
          padding: '6px',
          borderRadius: '30px',
          backgroundColor: 'var(--color-guid-agent-bar, var(--aou-2))',
          transition: 'all 0.6s cubic-bezier(0.2, 0.8, 0.3, 1)',
          width: 'fit-content',
          maxWidth: '100%',
          gap: 4,
          color: 'var(--text-primary)',
        }}
      >
        {availableAgents
          .filter((agent) => agent.backend !== 'custom')
          .map((agent, index) => {
            const isSelected = selectedAgentKey === getAgentKey(agent);
            const logoSrc = getAgentLogo(agent.backend);

            return (
              <React.Fragment key={getAgentKey(agent)}>
                {index > 0 && <div className='text-16px lh-1 p-2px select-none opacity-30'>|</div>}
                <div className={`group flex items-center cursor-pointer whitespace-nowrap overflow-hidden ${isSelected ? `opacity-100 px-12px py-8px rd-20px mx-2px ${styles.agentItemSelected}` : 'opacity-60 p-4px hover:opacity-100'}`} style={isSelected ? undefined : { transition: 'opacity 0.5s cubic-bezier(0.2, 0.8, 0.3, 1)' }} onClick={() => onSelectAgent(getAgentKey(agent))}>
                  {logoSrc ? <img src={logoSrc} alt={`${agent.backend} logo`} width={20} height={20} style={{ objectFit: 'contain', flexShrink: 0 }} /> : <Robot theme='outline' size={20} fill='currentColor' style={{ flexShrink: 0 }} />}
                  <span
                    className={`font-medium text-14px ${isSelected ? 'font-semibold ml-4px' : 'max-w-0 opacity-0 overflow-hidden group-hover:max-w-100px group-hover:opacity-100 group-hover:ml-8px'}`}
                    style={{
                      color: 'var(--text-primary)',
                      transition: isSelected ? 'color 0.5s cubic-bezier(0.2, 0.8, 0.3, 1), font-weight 0.5s cubic-bezier(0.2, 0.8, 0.3, 1)' : 'max-width 0.6s cubic-bezier(0.2, 0.8, 0.3, 1), opacity 0.5s cubic-bezier(0.2, 0.8, 0.3, 1) 0.05s, margin 0.6s cubic-bezier(0.2, 0.8, 0.3, 1)',
                    }}
                  >
                    {agent.name}
                  </span>
                </div>
              </React.Fragment>
            );
          })}
      </div>
    </div>
  );
};

export default AgentPillBar;
