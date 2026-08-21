/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCrossSessionMessageEnabled } from '@/renderer/hooks/chat/useCrossSessionMessageEnabled';
import { Button, Message } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Persistent notice shown while the cross-session master switch is off.
 *
 * Not optional (spec §5.7 rule 3): a persisted kill switch with no visible state
 * means a user who forgot they flipped it concludes the feature is broken. The
 * banner both explains why `@@` does nothing and offers the one-click way back.
 */
const CrossSessionDisabledBanner: React.FC = () => {
  const { t } = useTranslation();
  const { enabled, setEnabled } = useCrossSessionMessageEnabled();

  if (enabled) {
    return null;
  }

  return (
    <div
      className='mb-6px flex items-center justify-between gap-8px rounded-8px px-10px py-6px text-12px'
      style={{ background: 'var(--color-fill-2)', color: 'var(--text-secondary)' }}
      role='status'
    >
      <span>{t('settings.crossSessionMessageDisabledBanner')}</span>
      <Button
        size='mini'
        type='text'
        onClick={() => {
          void setEnabled(true).catch(() => {
            Message.error(t('settings.crossSessionMessageUpdateFailed'));
          });
        }}
      >
        {t('settings.crossSessionMessageResume')}
      </Button>
    </div>
  );
};

export default CrossSessionDisabledBanner;
