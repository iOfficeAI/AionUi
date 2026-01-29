/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Switch, Tag } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ChannelConfig } from './types';

interface ChannelHeaderProps {
  channel: ChannelConfig;
  onToggleEnabled?: (enabled: boolean) => void;
}

const ChannelHeader: React.FC<ChannelHeaderProps> = ({ channel, onToggleEnabled }) => {
  const { t } = useTranslation();

  return (
    <div className='flex items-center justify-between group'>
      <div className='flex items-center gap-2 flex-1 min-w-0'>
        <span className='text-14px text-t-primary'>{channel.title}</span>
        {channel.status === 'coming_soon' && (
          <Tag size='small' color='gray'>
            {t('channels.comingSoon', 'Coming Soon')}
          </Tag>
        )}
      </div>
      <div className='flex items-center gap-2' onClick={(e) => e.stopPropagation()}>
        <Switch checked={channel.enabled} onChange={onToggleEnabled} size='small' disabled={channel.status === 'coming_soon' || channel.disabled} />
      </div>
    </div>
  );
};

export default ChannelHeader;
