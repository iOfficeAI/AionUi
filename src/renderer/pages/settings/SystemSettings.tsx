/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import SystemModalContent from '@/renderer/components/SettingsModal/contents/SystemModalContent';
import SettingsPageWrapper from './components/SettingsPageWrapper';

const SystemSettings: React.FC = () => {
  return (
    <SettingsPageWrapper>
      <SystemModalContent />
    </SettingsPageWrapper>
  );
};

export default SystemSettings;
