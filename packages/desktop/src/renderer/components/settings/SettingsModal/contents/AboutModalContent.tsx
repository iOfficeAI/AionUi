/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Divider, Typography } from '@arco-design/web-react';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import classNames from 'classnames';
import { useSettingsViewMode } from '../settingsViewContext';
import FeedbackReportModal from './FeedbackReportModal';
import { FEEDBACK_REPORTING_ENABLED } from '@/common/types/feedbackDiagnostics';

// __APP_VERSION__ is injected by electron.vite.config.ts `define:` from the
// repo-root package.json. The previous `import packageJson from
// '../../../../../../package.json'` resolved to packages/desktop/package.json
// which is a workspace placeholder permanently pinned at "0.0.0".
declare const __APP_VERSION__: string;

const AboutModalContent: React.FC = () => {
  const { t } = useTranslation();
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  return (
    <div className='flex flex-col h-full w-full'>
      {/* Content Area */}
      <div
        className={classNames(
          'flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-24px',
          isPageMode && 'px-0 overflow-visible'
        )}
      >
        <div className='flex flex-col max-w-500px mx-auto'>
          {/* App Info Section */}
          <div className='flex flex-col items-center pb-24px'>
            <Typography.Title heading={3} className='text-24px font-bold text-t-primary mb-8px'>
              CSBU WorkMate
            </Typography.Title>
            <Typography.Text className='text-14px text-t-secondary mb-4px text-center'>
              {t('settings.appDescription')}
            </Typography.Text>
            <Typography.Text className='text-13px text-t-secondary mb-12px text-center'>
              {t('settings.producer')}
            </Typography.Text>
            <div className='flex items-center justify-center gap-8px'>
              <span className='px-10px py-4px rd-6px text-13px bg-fill-2 text-t-primary font-500'>
                v{__APP_VERSION__}
              </span>
            </div>
          </div>

          {/* Divider */}
          <Divider className='my-16px' />

          {FEEDBACK_REPORTING_ENABLED && (
            <Typography.Text
              className='text-14px text-t-primary cursor-pointer hover:text-t-secondary transition-colors text-center'
              onClick={() => setShowFeedbackModal(true)}
            >
              {t('settings.bugReport')}
            </Typography.Text>
          )}
        </div>
      </div>
      {FEEDBACK_REPORTING_ENABLED && (
        <FeedbackReportModal visible={showFeedbackModal} onCancel={() => setShowFeedbackModal(false)} />
      )}
    </div>
  );
};

export default AboutModalContent;
