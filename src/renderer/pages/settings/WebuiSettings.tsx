/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import WebuiModalContent from '@/renderer/components/SettingsModal/contents/WebuiModalContent';
import { isElectronShellRuntime } from '@/renderer/utils/platform';
import ChannelsSettings from './ChannelsSettings';
import SettingsPageWrapper from './components/SettingsPageWrapper';

const WebuiSettings: React.FC = () => {
  if (!isElectronShellRuntime()) {
    return <ChannelsSettings />;
  }

  return (
    <SettingsPageWrapper>
      <WebuiModalContent />
    </SettingsPageWrapper>
  );
};

export default WebuiSettings;
