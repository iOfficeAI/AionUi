/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Alert, Result } from '@arco-design/web-react';
import { Lock } from '@icon-park/react';
import { useTranslation } from 'react-i18next';

const DesktopLoginGate: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className='size-full flex items-center justify-center p-24px'>
      <div className='max-w-560px w-full'>
        <Alert type='warning' className='mb-16px' content={t('settings.newApiDesktopGateDesc')} />
        <Result
          status='warning'
          icon={<Lock theme='outline' size='40' />}
          title={t('settings.newApiDesktopGateTitle')}
          subTitle={t('settings.newApiDesktopGateHint')}
        />
      </div>
    </div>
  );
};

export default DesktopLoginGate;
