/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import DisplayModalContent from '@/renderer/components/SettingsModal/contents/DisplayModalContent';
import SettingsPageWrapper from './components/SettingsPageWrapper';

const DisplaySettings: React.FC = () => {
  return (
    <SettingsPageWrapper>
      <DisplayModalContent />
    </SettingsPageWrapper>
  );
};

export default DisplaySettings;
