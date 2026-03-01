/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import ChannelDingTalkLogo from '@/renderer/assets/channel-logos/dingtalk.svg';
import ChannelDiscordLogo from '@/renderer/assets/channel-logos/discord.svg';
import ChannelLarkLogo from '@/renderer/assets/channel-logos/lark.svg';
import ChannelSlackLogo from '@/renderer/assets/channel-logos/slack.svg';
import ChannelTelegramLogo from '@/renderer/assets/channel-logos/telegram.svg';
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
  const channelLogoMap: Record<string, { src: string; alt: string }> = {
    telegram: { src: ChannelTelegramLogo, alt: 'Telegram' },
    lark: { src: ChannelLarkLogo, alt: 'Lark' },
    dingtalk: { src: ChannelDingTalkLogo, alt: 'DingTalk' },
    slack: { src: ChannelSlackLogo, alt: 'Slack' },
    discord: { src: ChannelDiscordLogo, alt: 'Discord' },
  };
  const logo = channelLogoMap[channel.id];

  return (
    <div className='flex items-center justify-between group'>
      <div className='flex items-center gap-8px flex-1 min-w-0'>
        {logo && <img src={logo.src} alt={logo.alt} className='w-14px h-14px object-contain shrink-0' />}
        <span className='text-14px text-t-primary'>{channel.title}</span>
        {channel.status === 'coming_soon' && (
          <Tag size='small' color='gray'>
            {t('settings.channels.comingSoon', 'Coming Soon')}
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
