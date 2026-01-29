/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Collapse } from '@arco-design/web-react';
import React from 'react';
import ChannelHeader from './ChannelHeader';
import type { ChannelConfig } from './types';

interface ChannelItemProps {
  channel: ChannelConfig;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onToggleEnabled?: (enabled: boolean) => void;
}

const ChannelItem: React.FC<ChannelItemProps> = ({ channel, isCollapsed, onToggleCollapse, onToggleEnabled }) => {
  return (
    <Collapse activeKey={isCollapsed ? [] : ['1']} onChange={onToggleCollapse} className='mb-4 [&_div.arco-collapse-item-header-title]:flex-1'>
      <Collapse.Item header={<ChannelHeader channel={channel} onToggleEnabled={onToggleEnabled} />} name='1' className='[&_div.arco-collapse-item-content-box]:py-3'>
        {channel.content}
      </Collapse.Item>
    </Collapse>
  );
};

export default ChannelItem;
