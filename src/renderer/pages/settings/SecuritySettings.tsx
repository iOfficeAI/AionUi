/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import SecurityModalContent from '@/renderer/components/SettingsModal/contents/SecurityModalContent';
import SettingsPageWrapper from './components/SettingsPageWrapper';

const SecuritySettings: React.FC = () => {
  return (
    <SettingsPageWrapper contentClassName='max-w-1200px'>
      <SecurityModalContent />
    </SettingsPageWrapper>
  );
};

export default SecuritySettings;
