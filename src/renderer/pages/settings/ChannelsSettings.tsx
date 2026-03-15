/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import ChannelModalContent from '@/renderer/components/SettingsModal/contents/ChannelModalContent';
import ChannelDebugBoundary from '@/renderer/components/SettingsModal/contents/channels/ChannelDebugBoundary';
import SettingsPageWrapper from './components/SettingsPageWrapper';

const ChannelsSettings: React.FC = () => {
  return (
    <SettingsPageWrapper>
      <ChannelDebugBoundary>
        <ChannelModalContent />
      </ChannelDebugBoundary>
    </SettingsPageWrapper>
  );
};

export default ChannelsSettings;
