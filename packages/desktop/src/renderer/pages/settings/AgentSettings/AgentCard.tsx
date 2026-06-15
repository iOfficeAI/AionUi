/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Avatar, Button, Switch, Tag, Tooltip, Typography } from '@arco-design/web-react';
import { Delete, EditTwo, Robot } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { resolveAgentLogo } from '@/renderer/utils/model/agentLogo';
import { resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import type { AgentManagementStatus } from '@/renderer/utils/model/agentTypes';

type DetectedAgent = {
  agent_type: string;
  backend?: string;
  icon?: string;
  name: string;
  id: string;
  custom_agent_id?: string;
  isExtension?: boolean;
  status?: AgentManagementStatus;
  last_check_error_message?: string;
  last_check_guidance?: string;
  avatar?: string;
};

/** Minimal custom-agent fields consumed by the 'custom' card variant. */
type CustomAgentCardData = {
  id: string;
  name: string;
  /** User-picked emoji or avatar URL (maps to `AgentMetadata.icon`). */
  icon?: string;
  /** Spawn command for the CLI. */
  command?: string;
  /** Launch arguments for the CLI. */
  args?: string[];
  enabled: boolean;
  status?: AgentManagementStatus;
  last_check_error_message?: string;
  last_check_guidance?: string;
};

type AgentCardProps =
  | {
      type: 'official';
      agent: DetectedAgent;
      onTestConnection: () => void;
      isTesting?: boolean;
    }
  | {
      type: 'custom';
      agent: CustomAgentCardData;
      onTestConnection: () => void;
      onEdit: () => void;
      onDelete: () => void;
      onToggle: (enabled: boolean) => void;
      isTesting?: boolean;
    };

const statusColor = (status?: AgentManagementStatus): 'green' | 'orange' | 'red' | 'gray' => {
  switch (status) {
    case 'available':
      return 'green';
    case 'unavailable':
      return 'orange';
    case 'missing':
      return 'red';
    default:
      return 'gray';
  }
};

const statusLabelKey = (status?: AgentManagementStatus) => {
  switch (status) {
    case 'available':
      return 'settings.agentManagement.statusAvailable';
    case 'unavailable':
      return 'settings.agentManagement.statusUnavailable';
    case 'missing':
      return 'settings.agentManagement.statusMissing';
    default:
      return 'settings.agentManagement.statusUnknown';
  }
};

const statusHelpText = (error?: string, guidance?: string) => [error, guidance].filter(Boolean).join(' ');

const AgentCard: React.FC<AgentCardProps> = (props) => {
  const { t } = useTranslation();

  if (props.type === 'official') {
    const { agent, onTestConnection, isTesting } = props;
    const extensionAvatar = resolveExtensionAssetUrl(agent.isExtension ? agent.avatar : undefined);
    const logo =
      extensionAvatar ||
      resolveAgentLogo({
        icon: agent.icon,
        backend: agent.backend || agent.agent_type,
        custom_agent_id: agent.custom_agent_id,
        isExtension: agent.isExtension,
      });

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
            {statusHelpText(agent.last_check_error_message, agent.last_check_guidance) && (
              <Tooltip content={statusHelpText(agent.last_check_error_message, agent.last_check_guidance)}>
                <Typography.Text className='text-11px text-t-secondary'>i</Typography.Text>
              </Tooltip>
            )}
          </div>
        </div>

        <Button size='small' type='secondary' onClick={onTestConnection} loading={isTesting}>
          {t('settings.agentManagement.testConnection')}
        </Button>
      </div>
    );
  }

  const { agent, onTestConnection, onEdit, onDelete, onToggle, isTesting } = props;
  const isDisabled = agent.enabled === false;

  return (
    <div className='flex items-center justify-between px-16px py-10px rd-8px bg-aou-1 hover:bg-aou-2'>
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
            {statusHelpText(agent.last_check_error_message, agent.last_check_guidance) && (
              <Tooltip content={statusHelpText(agent.last_check_error_message, agent.last_check_guidance)}>
                <Typography.Text className='text-11px text-t-secondary'>i</Typography.Text>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
      <div className='flex items-center gap-8px'>
        <Switch size='small' checked={agent.enabled !== false} onChange={onToggle} />
        <Button size='small' type='text' onClick={onTestConnection} loading={isTesting}>
          {t('settings.agentManagement.testConnection')}
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
  );
};

export default AgentCard;
