/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Avatar, Button, Switch, Tag, Tooltip, Typography } from '@arco-design/web-react';
import { Delete, EditTwo, Robot } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { resolveAgentLogo, useAgentLogos } from '@/renderer/utils/model/agentLogo';
import { resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import {
  type AgentManagementStatus,
  type ManagedAgent,
  formatManagedAgentDiagnosticMessage,
} from '@/renderer/utils/model/agentTypes';

type AgentCardProps =
  | {
      type: 'official';
      agent: ManagedAgent;
    }
  | {
      type: 'custom';
      agent: ManagedAgent;
      onEdit: () => void;
      onDelete: () => void;
      onToggle: (enabled: boolean) => void;
    };

const statusColor = (status?: AgentManagementStatus): 'green' | 'orange' | 'red' | 'gray' => {
  switch (status) {
    case 'online':
      return 'green';
    case 'offline':
      return 'orange';
    case 'missing':
      return 'red';
    default:
      return 'gray';
  }
};

const statusLabelKey = (status?: AgentManagementStatus) => {
  switch (status) {
    case 'online':
      return 'settings.agentManagement.statusOnline';
    case 'offline':
      return 'settings.agentManagement.statusOffline';
    case 'missing':
      return 'settings.agentManagement.statusMissing';
    default:
      return 'settings.agentManagement.statusUnknown';
  }
};

const AgentCard: React.FC<AgentCardProps> = (props) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const logos = useAgentLogos();

  if (props.type === 'official') {
    const { agent } = props;
    const extensionAvatar = resolveExtensionAssetUrl(agent.isExtension ? agent.avatar : undefined);
    const logo =
      extensionAvatar ||
      resolveAgentLogo(logos, {
        icon: agent.icon,
        backend: agent.backend || agent.agent_type,
        custom_agent_id: agent.custom_agent_id,
        isExtension: agent.isExtension,
      });

    const diagnostics = formatManagedAgentDiagnosticMessage(t, agent);

    return (
      <div className='flex min-h-[154px] flex-col rounded-12px border border-solid border-[var(--color-border-2)] bg-[var(--color-bg-2)] p-12px transition-colors hover:border-[var(--color-border-3)]'>
        <div className='mb-10px flex justify-center'>
          <Avatar size={40} shape='square' style={{ flexShrink: 0, backgroundColor: 'transparent' }}>
            {logo ? <img src={logo} alt={agent.name} className='h-full w-full object-contain' /> : '🤖'}
          </Avatar>
        </div>

        <div className='mb-10px flex-1 text-center'>
          <Typography.Text className='block text-13px font-medium leading-18px line-clamp-2'>
            {agent.name}
          </Typography.Text>
          <div className='mt-6px flex items-center justify-center gap-6px'>
            <Tag size='small' color={statusColor(agent.status)}>
              {t(statusLabelKey(agent.status))}
            </Tag>
            {diagnostics && (
              <Tooltip content={diagnostics}>
                <Typography.Text className='text-11px text-t-secondary'>i</Typography.Text>
              </Tooltip>
            )}
          </div>
        </div>

        <Button
          size='small'
          type='secondary'
          onClick={() => navigate(`/settings/agent/${agent.id}/repair`)}
          className='w-full'
        >
          {t('settings.agentManagement.configureConnection')}
        </Button>
      </div>
    );
  }

  const { agent, onEdit, onDelete, onToggle } = props;
  const isDisabled = agent.enabled === false;
  const diagnostics = formatManagedAgentDiagnosticMessage(t, agent);

  return (
    <div className='flex flex-col px-16px py-10px rd-8px bg-aou-1 hover:bg-aou-2'>
      <div className='flex items-center justify-between'>
        <div className={`flex items-center gap-12px min-w-0 flex-1 ${isDisabled ? 'opacity-50' : ''}`}>
          <Avatar
            size={32}
            shape='square'
            style={{ flexShrink: 0, backgroundColor: agent.icon ? 'var(--color-fill-2)' : 'transparent', fontSize: 18 }}
          >
            {agent.icon || <Robot theme='outline' size='20' />}
          </Avatar>
          <div className='min-w-0 flex-1'>
            <Typography.Text className='font-medium text-14px'>{agent.name || 'Custom Agent'}</Typography.Text>
            <div className='text-12px text-t-secondary truncate'>
              {agent.command}
              {agent.args && agent.args.length > 0 ? ` ${agent.args.join(' ')}` : ''}
            </div>
            <div className='mt-6px flex items-center gap-6px'>
              <Tag size='small' color={statusColor(agent.status)}>
                {t(statusLabelKey(agent.status))}
              </Tag>
              {diagnostics && (
                <Tooltip content={diagnostics}>
                  <Typography.Text className='text-11px text-t-secondary'>i</Typography.Text>
                </Tooltip>
              )}
            </div>
          </div>
        </div>
        <div className='flex items-center gap-8px'>
          <Switch size='small' checked={agent.enabled !== false} onChange={onToggle} />
          <Button size='small' type='text' onClick={() => navigate(`/settings/agent/${agent.id}/repair`)}>
            {t('settings.agentManagement.configureConnection')}
          </Button>
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
    </div>
  );
};

export default AgentCard;
