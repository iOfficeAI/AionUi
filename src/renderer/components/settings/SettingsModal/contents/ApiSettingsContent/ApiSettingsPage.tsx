import SettingsPageWrapper from '@/renderer/pages/settings/components/SettingsPageWrapper';
import React from 'react';
import ApiSettingsContent from '.';

const ApiSettingsPage: React.FC = () => {
  return (
    <SettingsPageWrapper contentClassName='max-w-1280px'>
      <ApiSettingsContent />
    </SettingsPageWrapper>
  );
};

export default ApiSettingsPage;
