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
import { resolveExtensionAssetUrl } from '@/renderer/utils/platform';
import { Tag } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ChannelConfig } from './types';

interface ChannelHeaderProps {
  channel: ChannelConfig;
}

const ChannelHeader: React.FC<ChannelHeaderProps> = ({ channel }) => {
  const { t } = useTranslation();
  const channelLogoMap: Record<string, { src: string; alt: string }> = {
    telegram: { src: ChannelTelegramLogo, alt: 'Telegram' },
    lark: { src: ChannelLarkLogo, alt: 'Lark' },
    dingtalk: { src: ChannelDingTalkLogo, alt: 'DingTalk' },
    slack: { src: ChannelSlackLogo, alt: 'Slack' },
    discord: { src: ChannelDiscordLogo, alt: 'Discord' },
  };
  const builtinLogo = channelLogoMap[channel.id] || (channel.id.startsWith('telegram_') ? channelLogoMap.telegram : channel.id.startsWith('lark_') ? channelLogoMap.lark : channel.id.startsWith('dingtalk_') ? channelLogoMap.dingtalk : channel.id.startsWith('slack_') ? channelLogoMap.slack : channel.id.startsWith('discord_') ? channelLogoMap.discord : undefined);
  const logoSrc = builtinLogo?.src || resolveExtensionAssetUrl(channel.icon);
  const logoAlt = builtinLogo?.alt || channel.title;

  return (
    <div className='flex items-start justify-between gap-12px group' data-channel-header={channel.id}>
      <div className='flex items-start gap-8px flex-1 min-w-0'>
        {logoSrc && <img src={logoSrc} alt={logoAlt} className='w-14px h-14px object-contain shrink-0 mt-2px' />}
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-8px min-w-0'>
            <span className='text-14px text-t-primary truncate'>{channel.title}</span>
            {channel.isExtension ? (
              <Tag size='small' color='arcoblue'>
                {t('settings.channels.extensionTag', 'EXT')}
              </Tag>
            ) : null}
            {channel.instances && channel.instances.length > 1 ? (
              <Tag size='small' color='orangered'>
                {t('settings.channels.instanceCount', { defaultValue: '{{count}} instances', count: channel.instances.length })}
              </Tag>
            ) : null}
            {channel.status === 'coming_soon' ? (
              <Tag size='small' color='gray'>
                {t('settings.channels.comingSoon', 'Coming Soon')}
              </Tag>
            ) : null}
            {channel.status === 'active' && channel.enabled ? (
              <Tag size='small' color={channel.isConnected ? 'green' : 'orange'}>
                {channel.isConnected ? t('settings.channels.connected', 'Connected') : t('settings.channels.connecting', 'Connecting')}
              </Tag>
            ) : null}
          </div>
          {channel.description ? <div className='text-12px text-t-tertiary mt-2px truncate'>{channel.description}</div> : null}
        </div>
      </div>
    </div>
  );
};

export default ChannelHeader;
