/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { resolveAgentLogo } from '@/renderer/utils/model/agentLogo';
import { resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import type { AgentSource } from '@/renderer/utils/model/agentTypes';
import { iconColors } from '@/renderer/styles/colors';
import type { AvailableAgent } from '../types';
import { getOfficeAgentDescriptionKey } from '../config/officeAgentDescriptions';
import { Button, Dropdown, Menu } from '@arco-design/web-react';
import { Down, Robot } from '@icon-park/react';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

type GuidAgentSelectorProps = {
  availableAgents: AvailableAgent[] | undefined;
  selectedAgentKey: string;
  getAgentKey: (agent: {
    agent_type: string;
    agent_source?: AgentSource;
    backend?: string;
    id?: string;
    custom_agent_id?: string;
  }) => string;
  onSelectAgent: (key: string) => void;
};

const GuidAgentSelector: React.FC<GuidAgentSelectorProps> = ({
  availableAgents,
  selectedAgentKey,
  getAgentKey,
  onSelectAgent,
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const agents = useMemo(
    () => (availableAgents ?? []).filter((agent) => !agent.is_preset),
    [availableAgents],
  );

  const selectedAgent = useMemo(
    () => agents.find((agent) => getAgentKey(agent) === selectedAgentKey),
    [agents, getAgentKey, selectedAgentKey],
  );

  if (availableAgents === undefined || agents.length === 0) {
    return null;
  }

  const renderAgentIcon = (agent: AvailableAgent, size = 14) => {
    const extensionAvatar = resolveExtensionAssetUrl(agent.isExtension ? agent.avatar : undefined);
    const usesEmojiAvatar =
      (agent.agent_type === 'remote' || agent.agent_source === 'custom') && Boolean(agent.avatar);
    const emojiAvatar = usesEmojiAvatar ? agent.avatar : undefined;
    const logoSrc =
      extensionAvatar ||
      (!emojiAvatar
        ? resolveAgentLogo({
            icon: agent.icon,
            backend: agent.backend || agent.agent_type,
            custom_agent_id: agent.custom_agent_id,
            isExtension: agent.isExtension,
          })
        : undefined);

    if (emojiAvatar) {
      return <span style={{ fontSize: size, lineHeight: 1 }}>{emojiAvatar}</span>;
    }
    if (logoSrc) {
      return <img src={logoSrc} alt='' width={size} height={size} style={{ objectFit: 'contain', flexShrink: 0 }} />;
    }
    return <Robot theme='outline' size={size} fill={iconColors.secondary} style={{ lineHeight: 0, flexShrink: 0 }} />;
  };

  const selectedLabel = selectedAgent?.name ?? t('guid.office.selectAgentTitle');

  return (
    <Dropdown
      trigger='click'
      position='tl'
      droplist={
        <Menu selectedKeys={[selectedAgentKey]} style={{ minWidth: 260, maxWidth: 320 }}>
          <Menu.Item key='__hint' disabled className='!cursor-default !opacity-100'>
            <div className='py-2px'>
              <div className='text-13px font-medium text-t-primary'>{t('guid.office.selectAgentTitle')}</div>
              <div className='text-12px text-t-secondary leading-snug mt-4px'>{t('guid.office.selectAgentHint')}</div>
            </div>
          </Menu.Item>
          {agents.map((agent) => {
            const agentKey = getAgentKey(agent);
            const descriptionKey = getOfficeAgentDescriptionKey(agent);
            const description = t(descriptionKey, { defaultValue: t('guid.office.agentDescriptionFallback') });

            return (
              <Menu.Item key={agentKey} onClick={() => onSelectAgent(agentKey)}>
                <div className='flex items-start gap-10px py-2px'>
                  <span className='mt-2px'>{renderAgentIcon(agent, 16)}</span>
                  <span className='min-w-0'>
                    <div className='text-13px font-medium text-t-primary'>{agent.name}</div>
                    <div className='text-12px text-t-secondary leading-snug'>{description}</div>
                  </span>
                </div>
              </Menu.Item>
            );
          })}
          <Menu.Item key='__manage' className='text-12px text-t-secondary' onClick={() => navigate('/settings/agent?tab=local')}>
            {t('guid.office.manageAgents')}
          </Menu.Item>
        </Menu>
      }
    >
      <Button
        className='sendbox-model-btn guid-config-btn'
        shape='round'
        size='small'
        data-testid='guid-agent-selector'
      >
        <span className='flex items-center gap-6px min-w-0 max-w-200px'>
          {selectedAgent ? renderAgentIcon(selectedAgent) : <Robot theme='outline' size={14} fill={iconColors.secondary} />}
          <span className='text-t-secondary shrink-0'>{t('guid.office.agentDropdownLabel')}</span>
          <span className='truncate text-t-primary'>{selectedLabel}</span>
          <Down theme='outline' size={12} fill={iconColors.secondary} className='shrink-0' />
        </span>
      </Button>
    </Dropdown>
  );
};

export default GuidAgentSelector;
