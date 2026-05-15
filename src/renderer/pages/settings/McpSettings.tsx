import React from 'react';
import ToolsModalContent from '@/renderer/components/settings/SettingsModal/contents/ToolsModalContent';
import SettingsPageWrapper from './components/SettingsPageWrapper';

const McpSettings: React.FC = () => (
  <SettingsPageWrapper contentClassName='max-w-1200px'>
    <ToolsModalContent />
  </SettingsPageWrapper>
);

export default McpSettings;
