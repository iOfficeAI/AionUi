/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import AboutModalContent from '@/renderer/components/SettingsModal/contents/AboutModalContent';
import SettingsPageWrapper from './components/SettingsPageWrapper';

const About: React.FC = () => {
  return (
    <SettingsPageWrapper contentClassName='max-w-640px'>
      <AboutModalContent />
    </SettingsPageWrapper>
  );
};

export default About;
