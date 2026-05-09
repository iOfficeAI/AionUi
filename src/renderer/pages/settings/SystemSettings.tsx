/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { application as applicationIpc } from '@/common/adapter/ipcBridge';
import { useLocation } from 'react-router-dom';
import { Navigate } from 'react-router-dom';
import SystemModalContent from '@/renderer/components/settings/SettingsModal/contents/SystemModalContent';
import AboutModalContent from '@/renderer/components/settings/SettingsModal/contents/AboutModalContent';
import SettingsPageWrapper from './components/SettingsPageWrapper';
import { isElectronDesktop } from '@/renderer/utils/platform';

const SystemSettings: React.FC = () => {
  const location = useLocation();
  const isAboutPage = location.pathname === '/settings/about';
  const isDesktop = isElectronDesktop();
  const [isPackagedDesktop, setIsPackagedDesktop] = React.useState(false);

  React.useEffect(() => {
    if (!isDesktop) {
      setIsPackagedDesktop(false);
      return;
    }

    let disposed = false;
    void applicationIpc.getStartOnBootStatus
      .invoke()
      .then((result) => {
        if (!disposed && result.success && result.data) {
          setIsPackagedDesktop(result.data.isPackaged);
        }
      })
      .catch(() => {});

    return () => {
      disposed = true;
    };
  }, [isDesktop]);

  if (isPackagedDesktop && isAboutPage) {
    return <Navigate to='/settings/system' replace />;
  }

  return (
    <SettingsPageWrapper contentClassName={isAboutPage ? 'max-w-640px' : undefined}>
      {isAboutPage ? <AboutModalContent /> : <SystemModalContent />}
    </SettingsPageWrapper>
  );
};

export default SystemSettings;
