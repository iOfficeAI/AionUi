/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Empty } from '@arco-design/web-react';
import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * What a right-hand panel shows when the focused column has nothing for it:
 * the preview region held open on a split route whose focused column has no
 * tabs, or the project column of a member that carries no project. Quiet on
 * purpose — the panel is there so the layout holds still, not to say much.
 */
export const PanelEmptyState: React.FC<{ testId?: string }> = ({ testId = 'panel-empty-state' }) => {
  const { t } = useTranslation();
  return (
    <div data-testid={testId} className='h-full w-full flex items-center justify-center px-16px'>
      <Empty
        description={<span className='text-t-tertiary text-13px'>{t('conversation.splitGroup.emptyColumnPanel')}</span>}
      />
    </div>
  );
};
