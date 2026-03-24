/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getAgentLogo } from '@/renderer/utils/model/agentLogo';
import { resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import type { AcpBackend, AvailableAgent } from '../types';
import { Robot, Peoples } from '@icon-park/react';
import React from 'react';
import styles from '../index.module.css';

const AGENT_TEAM_KEY = 'agent-team';

type AgentPillBarProps = {
  availableAgents: AvailableAgent[];
  selectedAgentKey: string;
  getAgentKey: (agent: { backend: AcpBackend; customAgentId?: string }) => string;
  onSelectAgent: (key: string) => void;
};

const AgentPillBar: React.FC<AgentPillBarProps> = ({
  availableAgents,
  selectedAgentKey,
  getAgentKey,
  onSelectAgent,
}) => {
  const layout = useLayoutContext();
  const isMobile = layout?.isMobile ?? false;

  return (
    <div className='w-full flex justify-center'>
      <div
        className='flex items-center justify-center'
        style={{
          marginBottom: 20,
          padding: '6px',
          borderRadius: '30px',
          backgroundColor: 'var(--color-guid-agent-bar, var(--aou-2))',
          transition: 'background-color 0.35s ease',
          width: isMobile ? 'calc(100% + 28px)' : 'fit-content',
          maxWidth: isMobile ? 'none' : '100%',
          marginLeft: isMobile ? -14 : 0,
          marginRight: isMobile ? -14 : 0,
          overflow: isMobile ? 'visible' : 'hidden',
          gap: isMobile ? 6 : 4,
          flexWrap: isMobile ? 'wrap' : 'nowrap',
          color: 'var(--text-primary)',
        }}
      >
        {availableAgents
          .filter((agent) => agent.backend !== 'custom' || agent.isExtension)
          .map((agent, index) => {
            const isSelected = selectedAgentKey === getAgentKey(agent);
            const extensionAvatar = resolveExtensionAssetUrl(agent.isExtension ? agent.avatar : undefined);
            const logoSrc = extensionAvatar || getAgentLogo(agent.backend);

            return (
              <React.Fragment key={getAgentKey(agent)}>
                {!isMobile && index > 0 && <div className='text-16px lh-1 p-2px select-none opacity-30'>|</div>}
                <div
                  data-agent-pill='true'
                  data-agent-key={getAgentKey(agent)}
                  data-agent-backend={agent.backend}
                  data-agent-selected={isSelected ? 'true' : 'false'}
                  className={`group relative flex items-center cursor-pointer whitespace-nowrap overflow-hidden ${isSelected ? `opacity-100 px-12px py-8px rd-20px mx-2px ${styles.agentItemSelected}` : isMobile ? 'opacity-70 p-4px' : 'opacity-60 p-4px hover:opacity-100'}`}
                  style={
                    isSelected
                      ? isMobile
                        ? { animation: 'none', transition: 'opacity 0.2s ease, background-color 0.2s ease' }
                        : undefined
                      : { transition: 'opacity 0.2s ease' }
                  }
                  onClick={() => onSelectAgent(getAgentKey(agent))}
                >
                  {logoSrc ? (
                    <img
                      src={logoSrc}
                      alt={`${agent.backend} logo`}
                      width={20}
                      height={20}
                      style={{ objectFit: 'contain', flexShrink: 0 }}
                    />
                  ) : (
                    <Robot theme='outline' size={20} fill='currentColor' style={{ flexShrink: 0 }} />
                  )}
                  <span
                    className={`font-medium text-14px ${isSelected ? 'font-semibold ml-4px' : isMobile ? 'max-w-0 opacity-0 overflow-hidden' : 'max-w-0 opacity-0 overflow-hidden group-hover:max-w-100px group-hover:opacity-100 group-hover:ml-8px'}`}
                    style={{
                      color: 'var(--text-primary)',
                      transition: isSelected
                        ? 'color 0.2s ease, font-weight 0.2s ease'
                        : isMobile
                          ? 'none'
                          : 'max-width 0.6s cubic-bezier(0.2, 0.8, 0.3, 1), opacity 0.5s cubic-bezier(0.2, 0.8, 0.3, 1) 0.05s, margin 0.6s cubic-bezier(0.2, 0.8, 0.3, 1)',
                    }}
                  >
                    {agent.name}
                  </span>
                </div>
              </React.Fragment>
            );
          })}

        {/* Agent Team entry */}
        {!isMobile && <div className='text-16px lh-1 p-2px select-none opacity-30'>|</div>}
        <div
          data-agent-pill='true'
          data-agent-key={AGENT_TEAM_KEY}
          data-agent-selected={selectedAgentKey === AGENT_TEAM_KEY ? 'true' : 'false'}
          className={`group relative flex items-center cursor-pointer whitespace-nowrap overflow-hidden ${selectedAgentKey === AGENT_TEAM_KEY ? `opacity-100 px-12px py-8px rd-20px mx-2px ${styles.agentItemSelected}` : isMobile ? 'opacity-70 p-4px' : 'opacity-60 p-4px hover:opacity-100'}`}
          style={
            selectedAgentKey === AGENT_TEAM_KEY
              ? isMobile
                ? { animation: 'none', transition: 'opacity 0.2s ease, background-color 0.2s ease' }
                : undefined
              : { transition: 'opacity 0.2s ease' }
          }
          onClick={() => onSelectAgent(AGENT_TEAM_KEY)}
        >
          <Peoples theme='outline' size={20} fill='currentColor' style={{ flexShrink: 0 }} />
          <span
            className={`font-medium text-14px ${selectedAgentKey === AGENT_TEAM_KEY ? 'font-semibold ml-4px' : isMobile ? 'max-w-0 opacity-0 overflow-hidden' : 'max-w-0 opacity-0 overflow-hidden group-hover:max-w-100px group-hover:opacity-100 group-hover:ml-8px'}`}
            style={{
              color: 'var(--text-primary)',
              transition: selectedAgentKey === AGENT_TEAM_KEY
                ? 'color 0.2s ease, font-weight 0.2s ease'
                : isMobile
                  ? 'none'
                  : 'max-width 0.6s cubic-bezier(0.2, 0.8, 0.3, 1), opacity 0.5s cubic-bezier(0.2, 0.8, 0.3, 1) 0.05s, margin 0.6s cubic-bezier(0.2, 0.8, 0.3, 1)',
            }}
          >
            Agent Team
          </span>
        </div>
      </div>
    </div>
  );
};

export default AgentPillBar;
