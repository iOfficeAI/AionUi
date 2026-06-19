/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import AccountModalContent from '@/renderer/components/settings/SettingsModal/contents/AccountModalContent';
import SettingsPageWrapper from './components/SettingsPageWrapper';

/** Route-based account settings page (P1 auth): signed-in identity + logout. */
const AccountSettings: React.FC = () => {
  return (
    <SettingsPageWrapper contentClassName='max-w-640px'>
      <AccountModalContent />
    </SettingsPageWrapper>
  );
};

export default AccountSettings;
