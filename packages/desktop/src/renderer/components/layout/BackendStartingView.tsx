/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Spin, Typography } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Full-screen, benign "backend is still starting" view. Shown while the backend
 * process is alive but not yet ready (reason `backend_startup_pending_slow`).
 *
 * This is intentionally NOT an error modal: it carries no report / download /
 * restart buttons and no reinstall / antivirus / missing-resource copy — the
 * backend binary exists and was observed listening, so such guidance would be
 * misleading. The top-level gate unmounts this view as soon as the backend
 * becomes ready (switching to the App) or the process exits (switching to the
 * honest-failure view). System-level quit (window close, tray, Cmd+Q) stays
 * available at the OS/main-process layer, so no in-view exit control is needed.
 */
const BackendStartingView: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className='min-h-screen bg-bg-1 flex items-center justify-center px-24px' data-testid='backend-starting-view'>
      <div className='w-full max-w-480px rounded-24px bg-2 px-32px py-40px text-center flex flex-col items-center gap-16px'>
        <img
          src='./pet-states/thinking.svg'
          alt=''
          aria-hidden='true'
          className='w-144px h-144px object-contain'
          data-testid='backend-starting-pet'
        />
        <Typography.Title heading={5} className='m-0 text-t-1'>
          {t('common.backendStartup.pendingSlow.title')}
        </Typography.Title>
        <Typography.Paragraph className='m-0 text-t-secondary' data-testid='backend-starting-description'>
          {t('common.backendStartup.pendingSlow.description')}
        </Typography.Paragraph>
        <Spin size={20} aria-label={t('common.backendStartup.pendingSlow.title')} />
      </div>
    </div>
  );
};

export default BackendStartingView;
