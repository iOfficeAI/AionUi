/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Empty } from '@arco-design/web-react';
import { Close } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

/**
 * What a right-hand panel shows when the focused column has nothing for it:
 * the preview region held open on a split route whose focused column has no
 * tabs, or the project column of a member that carries no project. Quiet on
 * purpose — the panel is there so the layout holds still, not to say much.
 *
 * A panel that is held open must still be dismissable from here: the region
 * only stays because the user had it up, and the column they are looking at
 * may be the one place they never opened anything. `onClose` puts the same
 * close the preview's own chrome has in the corner of the empty panel.
 */
export const PanelEmptyState: React.FC<{ testId?: string; onClose?: () => void }> = ({
  testId = 'panel-empty-state',
  onClose,
}) => {
  const { t } = useTranslation();
  return (
    <div data-testid={testId} className='h-full w-full relative flex items-center justify-center px-16px'>
      {onClose && (
        <Button
          type='text'
          size='mini'
          aria-label={t('preview.closePreview')}
          data-testid={`${testId}-close`}
          icon={<Close theme='outline' size='12' fill='currentColor' />}
          // The start corner, not the end one: the neighbouring column's
          // resize grab strip lies inside this panel's end edge and paints
          // above the panel's own stacking context, so a button there can be
          // seen but never pressed — measured by hit-testing its centre on
          // the running app. Nothing overlaps the start corner.
          className='!absolute top-8px start-8px !size-24px !min-w-24px !p-0 !rd-4px flex items-center justify-center !text-t-tertiary hover:!text-t-primary'
          onClick={onClose}
        />
      )}
      <Empty
        description={<span className='text-t-tertiary text-13px'>{t('conversation.splitGroup.emptyColumnPanel')}</span>}
      />
    </div>
  );
};
