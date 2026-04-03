/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolveAgentLogo } from '@/renderer/utils/model/agentLogo';
import { resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import { useLayoutContext } from '@/renderer/hooks/context/LayoutContext';
import type { AcpBackend, AvailableAgent } from '../types';
import { Plus, Robot } from '@icon-park/react';
import { Tooltip } from '@arco-design/web-react';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styles from '../index.module.css';

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
  const navigate = useNavigate();
  const { t } = useTranslation();

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
          .filter(
            (agent) => agent.backend !== 'custom' || agent.isExtension || (agent.customAgentId && !agent.isPreset)
          )
          .map((agent, index) => {
            const isSelected = selectedAgentKey === getAgentKey(agent);
            const extensionAvatar = resolveExtensionAssetUrl(agent.isExtension ? agent.avatar : undefined);
            // Remote agents use emoji avatars — not image URLs
            const emojiAvatar = agent.backend === 'remote' && agent.avatar ? agent.avatar : undefined;
            const logoSrc =
              extensionAvatar ||
              (!emojiAvatar
                ? resolveAgentLogo({
                    backend: agent.backend,
                    customAgentId: agent.customAgentId,
                    isExtension: agent.isExtension,
                  })
                : undefined);

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
                  {emojiAvatar ? (
                    <span style={{ fontSize: 20, lineHeight: 1, flexShrink: 0 }}>{emojiAvatar}</span>
                  ) : logoSrc ? (
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
        {!isMobile && <div className='text-16px lh-1 p-2px select-none opacity-30'>|</div>}
        <Tooltip content={t('settings.agentManagement.discoverMoreAgents', { defaultValue: '发现更多 Agent' })}>
          <div
            className='flex items-center justify-center cursor-pointer p-4px opacity-60 hover:opacity-100 self-center'
            style={{ transition: 'opacity 0.2s ease', flexShrink: 0, marginTop: 4 }}
            onClick={() => navigate('/settings/agent?tab=local')}
          >
            <Plus theme='outline' size={20} fill='currentColor' style={{ flexShrink: 0 }} />
          </div>
        </Tooltip>
      </div>
    </div>
  );
};

export default AgentPillBar;
