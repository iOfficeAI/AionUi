/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Avatar, Button, Switch, Typography } from '@arco-design/web-react';
import { Delete, EditTwo, Robot } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { resolveAgentLogo } from '@/renderer/utils/model/agentLogo';
import { resolveExtensionAssetUrl } from '@/renderer/utils/platform';

type DetectedAgent = {
  agent_type: string;
  backend?: string;
  icon?: string;
  name: string;
  custom_agent_id?: string;
  isExtension?: boolean;
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
};

type AgentCardProps =
  | {
      type: 'detected';
      agent: DetectedAgent;
      onGoToChat: () => void;
    }
  | {
      type: 'custom';
      agent: CustomAgentCardData;
      onGoToChat: () => void;
      onEdit: () => void;
      onDelete: () => void;
      onToggle: (enabled: boolean) => void;
    };

const AgentCard: React.FC<AgentCardProps> = (props) => {
  const { t } = useTranslation();
  const goToChatButtonClassName = '!w-full !justify-center !rounded-10px !text-12px';

  if (props.type === 'detected') {
    const { agent, onGoToChat } = props;
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
          <Typography.Text className='mt-4px block text-11px text-t-secondary'>
            {t('settings.agentManagement.detected')}
          </Typography.Text>
        </div>

        <Button size='small' type='secondary' onClick={onGoToChat} className={goToChatButtonClassName}>
          {t('settings.agentManagement.goToChat')}
        </Button>
      </div>
    );
  }

  const { agent, onGoToChat, onEdit, onDelete, onToggle } = props;

  return (
    <div className='flex items-center justify-between px-16px py-10px rd-8px bg-aou-1 hover:bg-aou-2'>
      <div className='flex items-center gap-12px min-w-0 flex-1'>
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
        </div>
      </div>
      <div className='flex items-center gap-8px'>
        <Switch size='small' checked={agent.enabled !== false} onChange={onToggle} />
        <Button size='small' type='text' onClick={onGoToChat} disabled={agent.enabled === false}>
          {t('settings.agentManagement.goToChat')}
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
