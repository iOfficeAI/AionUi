/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import AionModal from '@renderer/components/base/AionModal';
import { openExternalUrl } from '@/renderer/utils/platform';
import { Button } from '@arco-design/web-react';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Global event that opens the migration card. Manual "check for updates"
// entry points dispatch it in the discontinued build instead of running any
// version detection.
export const OPEN_MIGRATION_DIALOG_EVENT = 'aionui-open-migration-dialog';

// Official website users are guided to for the AionPro download. Kept as a
// module constant (not i18n) — it is a URL, not translatable copy.
const AIONUI_WEBSITE_URL = 'https://www.aionui.com/';

const UpdateMigrationDialog: React.FC = () => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleOpen = () => setVisible(true);
    window.addEventListener(OPEN_MIGRATION_DIALOG_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_MIGRATION_DIALOG_EVENT, handleOpen);
  }, []);

  const close = () => setVisible(false);

  const gotoWebsite = () => {
    void openExternalUrl(AIONUI_WEBSITE_URL).catch((error) => {
      console.error('Failed to open AionPro website:', error);
    });
    close();
  };

  return (
    <AionModal
      variant='standard'
      size='small'
      visible={visible}
      onCancel={close}
      maskClosable
      header={{ title: t('update.migration.title'), showClose: true }}
      footer={
        <div className='flex items-center justify-end gap-8px'>
          <Button className='!rounded-8px' onClick={close}>
            {t('update.migration.later')}
          </Button>
          <Button type='primary' className='!rounded-8px' onClick={gotoWebsite}>
            {t('update.migration.gotoWebsite')}
          </Button>
        </div>
      }
    >
      <div className='px-24px py-8px text-14px text-t-primary leading-relaxed'>{t('update.migration.description')}</div>
    </AionModal>
  );
};

export default UpdateMigrationDialog;
