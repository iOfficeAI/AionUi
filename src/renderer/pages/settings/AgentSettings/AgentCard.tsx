/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Avatar, Button, Switch, Tooltip, Typography } from '@arco-design/web-react';
import { Setting, EditTwo, Delete, Robot } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { getAgentLogo } from '@/renderer/utils/model/agentLogo';
import type { AcpBackendConfig } from '@/common/types/acpTypes';

type DetectedAgent = {
  backend: string;
  name: string;
};

type AgentCardProps =
  | {
      type: 'detected';
      agent: DetectedAgent;
      onSettings?: () => void;
      settingsDisabled?: boolean;
    }
  | {
      type: 'custom';
      agent: AcpBackendConfig;
      onEdit: () => void;
      onDelete: () => void;
      onToggle: (enabled: boolean) => void;
    };

const AgentCard: React.FC<AgentCardProps> = (props) => {
  const { t } = useTranslation();

  if (props.type === 'detected') {
    const { agent, onSettings, settingsDisabled = true } = props;
    const logo = getAgentLogo(agent.backend);

    return (
      <div className='flex items-center justify-between px-16px py-10px rd-8px bg-aou-1 hover:bg-aou-2'>
        <div className='flex items-center gap-12px min-w-0 flex-1'>
          <Avatar size={32} shape='square' style={{ flexShrink: 0, backgroundColor: 'transparent' }}>
            {logo ? <img src={logo} alt={agent.name} className='w-full h-full object-contain' /> : '🤖'}
          </Avatar>
          <Typography.Text className='font-medium text-14px'>{agent.name}</Typography.Text>
        </div>
        {settingsDisabled ? (
          <Tooltip content={t('settings.agentManagement.settingsDisabledHint')}>
            <Button
              size='small'
              type='text'
              icon={<Setting theme='outline' size='14' />}
              disabled
              style={{ color: 'var(--color-text-4)' }}
            />
          </Tooltip>
        ) : (
          <Button size='small' type='text' icon={<Setting theme='outline' size='14' />} onClick={onSettings} />
        )}
      </div>
    );
  }

  const { agent, onEdit, onDelete, onToggle } = props;

  return (
    <div className='flex items-center justify-between px-16px py-10px rd-8px bg-aou-1 hover:bg-aou-2'>
      <div className='flex items-center gap-12px min-w-0 flex-1'>
        <Avatar
          size={32}
          shape='square'
          style={{ flexShrink: 0, backgroundColor: agent.avatar ? 'var(--color-fill-2)' : 'transparent', fontSize: 18 }}
        >
          {agent.avatar || <Robot theme='outline' size='20' />}
        </Avatar>
        <div className='min-w-0 flex-1'>
          <Typography.Text className='font-medium text-14px'>{agent.name || 'Custom Agent'}</Typography.Text>
          <div className='text-12px text-t-secondary truncate'>
            {agent.defaultCliPath}
            {agent.acpArgs && agent.acpArgs.length > 0 ? ` ${agent.acpArgs.join(' ')}` : ''}
          </div>
        </div>
      </div>
      <div className='flex items-center gap-8px'>
        <Switch size='small' checked={agent.enabled !== false} onChange={onToggle} />
        <Button size='small' type='text' icon={<EditTwo theme='outline' size='14' />} onClick={onEdit} />
        <Button
          size='small'
          type='text'
          status='danger'
          icon={<Delete theme='outline' size='14' />}
          onClick={onDelete}
        />
      </div>
    </div>
  );
};

export default AgentCard;
