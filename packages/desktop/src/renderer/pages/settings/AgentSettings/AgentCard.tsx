/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Avatar, Button, Popconfirm, Switch, Tooltip, Typography } from '@arco-design/web-react';
import { EditTwo, Delete, Robot } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { getAgentDisplayName, resolveAgentLogo } from '@/renderer/utils/model/agentLogo';
import { resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import type { ManagedCliInstallTarget } from '@/common/types/agent/managedCliInstaller';
import PoundingInteractiveLogo from '@renderer/components/layout/PoundingInteractiveLogo';

type DetectedAgent = {
  agent_type: string;
  backend?: string;
  icon?: string;
  name: string;
  available?: boolean;
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
      variant?: 'row' | 'grid';
      installState?: 'idle' | 'installing' | 'uninstalling';
      managedCliTarget?: ManagedCliInstallTarget;
      canManageInstall?: boolean;
      onInstall?: () => void;
      onUninstall?: () => void;
    }
  | {
      type: 'custom';
      agent: CustomAgentCardData;
      onEdit: () => void;
      onDelete: () => void;
      onToggle: (enabled: boolean) => void;
    };

const AgentCard: React.FC<AgentCardProps> = (props) => {
  const { t } = useTranslation();

  if (props.type === 'detected') {
    const {
      agent,
      variant = 'row',
      installState = 'idle',
      managedCliTarget,
      canManageInstall = false,
      onInstall,
      onUninstall,
    } = props;
    const extensionAvatar = resolveExtensionAssetUrl(agent.isExtension ? agent.avatar : undefined);
    const gridSettingsButtonClassName = '!w-full !justify-center !rounded-10px !text-12px';
    const logo =
      extensionAvatar ||
      resolveAgentLogo({
        icon: agent.icon,
        name: agent.name,
        backend: agent.backend || agent.agent_type,
        custom_agent_id: agent.custom_agent_id,
        isExtension: agent.isExtension,
      });
    const isPoundingCli = (agent.backend || agent.agent_type || '').toLowerCase() === 'aionrs';
    const renderActionButton = () => {
      if (!canManageInstall || !managedCliTarget) return null;
      if (installState === 'installing') {
        return (
          <Button size='small' type='primary' loading disabled className={gridSettingsButtonClassName}>
            {t('settings.agentManagement.marketInstalling', { defaultValue: 'Installing...' })}
          </Button>
        );
      }
      if (installState === 'uninstalling') {
        return (
          <Button size='small' type='secondary' loading disabled className={gridSettingsButtonClassName}>
            {t('settings.agentManagement.uninstalling', { defaultValue: 'Uninstalling...' })}
          </Button>
        );
      }
      if (!agent.available) {
        return (
          <Button size='small' type='primary' className={gridSettingsButtonClassName} onClick={onInstall}>
            {t('settings.agentManagement.marketInstall', { defaultValue: 'Install' })}
          </Button>
        );
      }
      return (
        <Popconfirm
          title={t('settings.agentManagement.uninstallConfirm', { defaultValue: 'Uninstall this CLI?' })}
          onOk={onUninstall}
        >
          <Button size='small' type='outline' status='danger' className={gridSettingsButtonClassName}>
            {t('settings.agentManagement.uninstall', { defaultValue: 'Uninstall' })}
          </Button>
        </Popconfirm>
      );
    };

    if (variant === 'grid') {
      return (
        <div className='flex min-h-[154px] flex-col rounded-12px border border-solid border-[var(--color-border-2)] bg-[var(--color-bg-2)] p-12px transition-colors hover:border-[var(--color-border-3)]'>
          <div className='mb-10px flex justify-center'>
            <Avatar size={40} shape='square' style={{ flexShrink: 0, backgroundColor: 'transparent' }}>
              {isPoundingCli ? (
                <div className='h-full w-full p-2px'>
                  <PoundingInteractiveLogo className='size-full' compact scaleClassName='scale-140' />
                </div>
              ) : logo ? (
                <img src={logo} alt={getAgentDisplayName(agent)} className='h-full w-full object-contain' />
              ) : (
                '🤖'
              )}
            </Avatar>
          </div>

          <div className='mb-10px flex-1 text-center'>
            <Typography.Text className='block text-13px font-medium leading-18px line-clamp-2'>
              {getAgentDisplayName(agent)}
            </Typography.Text>
            <Typography.Text className='mt-4px block text-11px text-t-secondary'>
              {agent.available
                ? t('settings.agentManagement.detected')
                : t('settings.agentManagement.notInstalled', { defaultValue: 'Not installed' })}
            </Typography.Text>
          </div>

          {renderActionButton()}
        </div>
      );
    }

    return (
      <div className='flex items-center justify-between px-16px py-10px rd-8px bg-aou-1 hover:bg-aou-2'>
        <div className='flex items-center gap-12px min-w-0 flex-1'>
          <Avatar size={32} shape='square' style={{ flexShrink: 0, backgroundColor: 'transparent' }}>
            {isPoundingCli ? (
              <div className='h-full w-full p-1px'>
                <PoundingInteractiveLogo className='size-full' compact scaleClassName='scale-140' />
              </div>
            ) : logo ? (
              <img src={logo} alt={getAgentDisplayName(agent)} className='w-full h-full object-contain' />
            ) : (
              '🤖'
            )}
          </Avatar>
          <Typography.Text className='font-medium text-14px'>{getAgentDisplayName(agent)}</Typography.Text>
        </div>
        <Tooltip content={t('settings.agentManagement.settingsDisabledHint')}>
          <Button size='small' type='text' disabled style={{ color: 'var(--color-text-4)' }} />
        </Tooltip>
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
