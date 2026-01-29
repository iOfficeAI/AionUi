/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Collapse } from '@arco-design/web-react';
import React from 'react';
import type { IChannelPluginStatus } from '@/channels/types';
import ChannelHeader from './ChannelHeader';

interface ChannelItemProps {
  channelId: string;
  channelTitle: string;
  channelDesc: string;
  status?: IChannelPluginStatus | null;
  enabled: boolean;
  loading?: boolean;
  comingSoon?: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onToggle: (enabled: boolean) => void;
  children: React.ReactNode;
}

const ChannelItem: React.FC<ChannelItemProps> = ({ channelId, channelTitle, channelDesc, status, enabled, loading, comingSoon, isCollapsed, onToggleCollapse, onToggle, children }) => {
  return (
    <Collapse key={channelId} activeKey={isCollapsed ? ['1'] : []} onChange={onToggleCollapse} className='mb-4 [&_div.arco-collapse-item-header-title]:flex-1'>
      <Collapse.Item header={<ChannelHeader channelId={channelId} channelTitle={channelTitle} channelDesc={channelDesc} status={status} enabled={enabled} loading={loading} comingSoon={comingSoon} onToggle={onToggle} />} name='1' className={'[&_div.arco-collapse-item-content-box]:py-3'}>
        {children}
      </Collapse.Item>
    </Collapse>
  );
};

export default ChannelItem;
