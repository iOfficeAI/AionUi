/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import AssistantModalContent from '@/renderer/components/settings/SettingsModal/contents/AssistantModalContent';
import SettingsPageWrapper from './components/SettingsPageWrapper';

const AssistantSettings: React.FC = () => {
  return (
    <SettingsPageWrapper>
      <AssistantModalContent />
    </SettingsPageWrapper>
  );
};

export default AssistantSettings;
