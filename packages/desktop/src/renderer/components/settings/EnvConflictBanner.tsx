/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EnvConflict } from '@/common/types/newApiAccount';
import { Alert, Button, Space, Typography } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

type EnvConflictBannerProps = {
  conflicts: EnvConflict[];
  onDismiss?: () => void;
};

const formatConflictKeyList = (conflicts: EnvConflict[]): string => conflicts.map((item) => item.key).join(', ');

const EnvConflictBanner: React.FC<EnvConflictBannerProps> = ({ conflicts, onDismiss }) => {
  const { t } = useTranslation();

  if (conflicts.length === 0) {
    return null;
  }

  return (
    <Alert
      type='warning'
      style={{ margin: '12px 12px 0' }}
      content={
        <Space direction='vertical' size='small' style={{ width: '100%' }}>
          <Text>{t('settings.envConflictBannerTitle')}</Text>
          <Text type='secondary'>
            {t('settings.envConflictBannerDesc', {
              keys: formatConflictKeyList(conflicts),
            })}
          </Text>
          {onDismiss && (
            <div>
              <Button type='text' size='mini' onClick={onDismiss}>
                {t('settings.envConflictBannerDismiss')}
              </Button>
            </div>
          )}
        </Space>
      }
    />
  );
};

export default EnvConflictBanner;
