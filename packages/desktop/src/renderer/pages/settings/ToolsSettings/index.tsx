/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ToolsSettings — standalone settings page for MCP servers and built-in tools
 * (e.g. image generation). Split out of the former combined "Capabilities" page
 * so Tools has its own top-level entry in the settings sidebar.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import ToolsModalContent from '@/renderer/components/settings/SettingsModal/contents/ToolsModalContent';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import SettingsPageHeader from '../components/SettingsPageHeader';

const ToolsSettings: React.FC = () => {
  const { t } = useTranslation();

  return (
    <SettingsPageWrapper contentClassName='max-w-1200px'>
      <div className='flex flex-col gap-16px'>
        <SettingsPageHeader
          data-testid='tools-header'
          title={t('settings.tools', { defaultValue: 'Tools' })}
          description={t('settings.toolsDescription', {
            defaultValue: 'Configure MCP servers and built-in tools such as image generation.',
          })}
        />
        <ToolsModalContent />
      </div>
    </SettingsPageWrapper>
  );
};

export default ToolsSettings;
