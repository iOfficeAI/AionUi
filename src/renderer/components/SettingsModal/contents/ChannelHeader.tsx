/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Switch, Tooltip } from '@arco-design/web-react';
import { Check, CloseOne, CloseSmall, LoadingOne } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { IChannelPluginStatus } from '@/channels/types';
import { iconColors } from '@/renderer/theme/colors';

interface ChannelHeaderProps {
  channelId: string;
  channelTitle: string;
  channelDesc: string;
  status?: IChannelPluginStatus | null;
  enabled: boolean;
  loading?: boolean;
  comingSoon?: boolean;
  onToggle: (enabled: boolean) => void;
}

const getStatusIcon = (status?: IChannelPluginStatus | null) => {
  if (!status) {
    return <CloseOne fill={iconColors.secondary} className='h-[24px]' />;
  }

  if (status.status === 'starting' || status.status === 'initializing') {
    return <LoadingOne fill={iconColors.primary} className='h-[24px]' />;
  }

  if (status.status === 'error') {
    return <CloseSmall fill={iconColors.danger} className='h-[24px]' />;
  }

  if (status.connected) {
    return <Check fill={iconColors.success} className='h-[24px]' />;
  }

  return <CloseOne fill={iconColors.secondary} className='h-[24px]' />;
};

const getStatusText = (status?: IChannelPluginStatus | null, t?: any) => {
  if (!status) {
    return t?.('channels.notConfigured') || 'Not configured';
  }

  if (status.status === 'starting' || status.status === 'initializing') {
    return t?.('settings.loading') || 'Loading...';
  }

  if (status.status === 'error') {
    return status.error || t?.('settings.error') || 'Error';
  }

  if (status.connected) {
    return t?.('assistant.connected') || 'Connected';
  }

  return t?.('assistant.disconnected') || 'Disconnected';
};

const getChannelSummary = (status?: IChannelPluginStatus | null, t?: any) => {
  if (!status || !status.hasToken) {
    return t?.('channels.notConfigured') || 'Not configured';
  }

  if (status.botUsername) {
    return `@${status.botUsername}`;
  }

  return t?.('channels.configured') || 'Configured';
};

const ChannelHeader: React.FC<ChannelHeaderProps> = ({ channelTitle, channelDesc, status, enabled, loading, comingSoon, onToggle }) => {
  const { t } = useTranslation();
  const statusIcon = getStatusIcon(status);
  const statusText = getStatusText(status, t);
  const summary = getChannelSummary(status, t);

  return (
    <div className='flex items-center justify-between group'>
      <div className='flex items-center gap-8px flex-1 min-w-0'>
        <span className='text-14px text-t-primary font-500'>{channelTitle}</span>
        {!comingSoon && (
          <Tooltip content={statusText} position='top'>
            <span className='flex items-center cursor-default flex-shrink-0'>{statusIcon}</span>
          </Tooltip>
        )}
        {comingSoon ? <span className='px-6px py-2px rd-4px text-12px bg-gray-500/20 text-gray-500 flex-shrink-0'>{t('channels.comingSoon')}</span> : <span className='text-12px text-t-tertiary truncate'>{summary}</span>}
      </div>
      <div className='flex items-center gap-8px' onClick={(e) => e.stopPropagation()}>
        <Switch checked={enabled} onChange={onToggle} size='small' disabled={comingSoon || loading} loading={loading} />
      </div>
    </div>
  );
};

export default ChannelHeader;
