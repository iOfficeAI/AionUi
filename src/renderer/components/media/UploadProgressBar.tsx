/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useUploadState, type UploadSource } from '@/renderer/hooks/file/useUploadState';
import { useTranslation } from 'react-i18next';

/**
 * Thin progress bar shown while files are being uploaded.
 * Renders nothing when idle. Pass `source` to scope to a specific upload area.
 */
const UploadProgressBar: React.FC<{ source?: UploadSource }> = ({ source }) => {
  const { isUploading, activeCount, overallPercent } = useUploadState(source);
  const { t } = useTranslation();

  if (!isUploading) return null;

  return (
    <div className='px-12px py-4px text-12px color-text-3'>
      <div className='flex justify-between mb-2px'>
        <span>
          {t('common.fileAttach.uploading', {
            count: activeCount,
            defaultValue: 'Uploading {{count}} file(s)...',
          })}
        </span>
        <span>{overallPercent}%</span>
      </div>
      <div className='h-3px rd-2px bg-fill-3 overflow-hidden'>
        <div
          className='h-full rd-2px bg-primary-6 transition-width duration-200 ease'
          style={{ width: `${overallPercent}%` }}
        />
      </div>
    </div>
  );
};

export default UploadProgressBar;
