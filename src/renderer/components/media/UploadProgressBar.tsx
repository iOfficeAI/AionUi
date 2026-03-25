/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useUploadState } from '@/renderer/hooks/file/useUploadState';
import { useTranslation } from 'react-i18next';

/**
 * Thin progress bar shown while files are being uploaded.
 * Renders nothing when idle.
 */
const UploadProgressBar: React.FC = () => {
  const { isUploading, activeCount, overallPercent } = useUploadState();
  const { t } = useTranslation();

  if (!isUploading) return null;

  return (
    <div style={{ padding: '4px 12px', fontSize: 12, color: 'var(--color-text-3, #86909c)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
        <span>
          {t('common.fileAttach.uploading', {
            count: activeCount,
            defaultValue: `Uploading ${activeCount} file(s)...`,
          })}
        </span>
        <span>{overallPercent}%</span>
      </div>
      <div
        style={{
          height: 3,
          borderRadius: 2,
          backgroundColor: 'var(--color-fill-3, #e5e6eb)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${overallPercent}%`,
            backgroundColor: 'var(--color-primary-6, #165dff)',
            borderRadius: 2,
            transition: 'width 0.2s ease',
          }}
        />
      </div>
    </div>
  );
};

export default UploadProgressBar;
